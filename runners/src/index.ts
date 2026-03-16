import "dotenv/config";
import * as Sentry from "@sentry/node";
import { createServer } from "node:http";

if (process.env.SENTRY_DSN?.trim()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENVIRONMENT ?? "sandbox",
    tracesSampleRate: 0.1,
  });
}

import pg from "pg";
import { registerWorker, claimJob, startHeartbeatLoop, completeJobSuccess, completeJobFailure } from "./runner.js";
import { getJobContext, recordArtifactConsumption } from "./job-context.js";
import { getHandler, registerAllHandlers } from "./handlers/index.js";
import {
  getExecutor,
  run as runExecutor,
  jobRequestFromContext,
  persistJobResult,
} from "./executor-registry.js";
import { advanceSuccessors, checkRunCompletion, markRunFailedIfNoPendingJobs } from "../../control-plane/src/scheduler.js";
import { runDeployFailureScanTriggerOnly } from "../../control-plane/src/deploy-failure-scan-trigger-only.js";

registerAllHandlers();

const POLL_INTERVAL_MS = 2_000;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.trim()) {
  console.error("[runner] DATABASE_URL is not set. Set it in .env (same as Control Plane) so the runner can claim jobs.");
  process.exit(1);
}
// Log DB hint (host/port only) so you can compare with Control Plane GET /health/db — artifacts must be in the same DB.
try {
  const u = new URL(databaseUrl);
  console.log("[runner] DATABASE_URL hint (verify same as Control Plane): host=" + u.hostname + " port=" + (u.port || "5432"));
} catch {
  console.log("[runner] DATABASE_URL hint: (could not parse URL)");
}
const poolSize = Math.max(1, Math.min(20, Number(process.env.DATABASE_POOL_MAX) || 5));
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: poolSize,
  idleTimeoutMillis: 30_000,
});

const config = {
  workerId: process.env.WORKER_ID ?? `worker-${process.pid}`,
  runnerVersion: process.env.RUNNER_VERSION ?? "0.1.0",
  environment: process.env.ENVIRONMENT ?? "sandbox",
  maxConcurrency: Number(process.env.MAX_CONCURRENCY ?? "5"),
};

if (process.env.LLM_GATEWAY_URL?.trim()) {
  console.log("[runner] LLM_GATEWAY_URL is set — using gateway for LLM calls.");
} else if (process.env.OPENAI_API_KEY?.trim()) {
  console.log("[runner] Using OPENAI_API_KEY for direct OpenAI (no gateway).");
} else {
  console.warn("[runner] Neither LLM_GATEWAY_URL nor OPENAI_API_KEY set. Set one in .env so LLM handlers (copy_generate, landing_page_generate, etc.) can run.");
}

let activeJobs = 0;

async function pollAndExecute(): Promise<void> {
  if (activeJobs >= config.maxConcurrency) return;

  let claimed: Awaited<ReturnType<typeof claimJob>> = null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    claimed = await claimJob(client, config.workerId);
    // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
    if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
      if (!claimed) {
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/index.ts:claim", message: "claimJob returned null", data: {}, timestamp: Date.now(), hypothesisId: "H1" }) }).catch(() => {});
      } else {
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/index.ts:claimed", message: "job claimed", data: { jobRunId: claimed.jobRun.id, runId: claimed.jobRun.run_id, planNodeId: claimed.jobRun.plan_node_id }, timestamp: Date.now(), hypothesisId: "H2" }) }).catch(() => {});
      }
    }
    // #endregion
    if (!claimed) {
      await client.query("ROLLBACK");
      return;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[runner] Poll error:", err);
    return;
  } finally {
    client.release();
  }

  // From here we no longer hold the claim connection, so the pool can serve other polls and jobs
  if (!claimed) return;
  activeJobs++;
  const { jobRun, claim } = claimed;
  const stopHeartbeat = startHeartbeatLoop(pool, jobRun.id, config.workerId);

  try {
    const ctxClient = await pool.connect();
    let jobContext = null;
    try {
      jobContext = await getJobContext(ctxClient, jobRun);
    } finally {
      ctxClient.release();
    }

    try {
      const role = jobContext?.agent_role ?? "unknown";
      const artifactCount = jobContext?.predecessor_artifacts?.length ?? 0;
      console.log(`[runner] Executing job ${jobRun.id} (node ${jobRun.plan_node_id}, job_type=${jobContext?.job_type ?? "unknown"}, agent_role=${role}, predecessor_artifacts=${artifactCount}, attempt ${jobRun.attempt})`);

      const executor = jobContext ? getExecutor(jobContext.job_type) : undefined;
      const handler = jobContext ? getHandler(jobContext.job_type) : undefined;

      if (executor && jobContext) {
        const request = jobRequestFromContext(jobContext);
        const result = await runExecutor(jobContext.job_type, request);
        const txClient = await pool.connect();
        try {
          await txClient.query("BEGIN");
          await persistJobResult(txClient, result, {
            runId: jobRun.run_id,
            jobRunId: jobRun.id,
            planNodeId: jobRun.plan_node_id,
          });
          await txClient.query("COMMIT");
        } catch (err) {
          await txClient.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          txClient.release();
        }
        if (!result.success) {
          throw new Error(result.error ?? "Executor returned success: false");
        }
      } else if (handler && jobContext) {
        const txClient = await pool.connect();
        try {
          await txClient.query("BEGIN");
          await handler(txClient, jobContext, { runId: jobRun.run_id, jobRunId: jobRun.id, planNodeId: jobRun.plan_node_id });
          await txClient.query("COMMIT");
          const countResult = await txClient.query<{ c: number }>("SELECT count(*)::int AS c FROM public.artifacts WHERE run_id = $1", [jobRun.run_id]);
          const artifactCount = countResult.rows[0]?.c ?? 0;
          console.log("[runner] handler transaction committed (artifacts persisted)", { run_id: jobRun.run_id, job_type: jobContext.job_type, artifact_count: artifactCount });
          // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
          if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
            fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/index.ts:handler_done", message: "handler completed", data: { job_type: jobContext.job_type, runId: jobRun.run_id }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
          }
          // #endregion
        } catch (err) {
          await txClient.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          txClient.release();
        }
      } else {
        // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
        if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
          fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/index.ts:no_executor_handler", message: "no executor or handler", data: { job_type: jobContext?.job_type }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
        }
        // #endregion
        throw new Error(`No executor or handler for job_type=${jobContext?.job_type ?? "unknown"}. Ensure the runner is up to date and has a handler for this job (e.g. email_generate_mjml).`);
      }

      const txClient = await pool.connect();
      try {
        await txClient.query("BEGIN");
        const won = await completeJobSuccess(
          txClient, jobRun.id, jobRun.run_id, jobRun.plan_node_id, config.workerId,
        );
        if (won) {
          if (jobContext?.predecessor_artifact_ids?.length) {
            await recordArtifactConsumption(
              txClient,
              jobRun.run_id,
              jobRun.id,
              jobRun.plan_node_id,
              jobContext.predecessor_artifact_ids,
              "input"
            );
          }
          await advanceSuccessors(txClient, jobRun.run_id, jobRun.plan_node_id, jobRun.id);
          await checkRunCompletion(txClient, jobRun.run_id);
        }
        await txClient.query("COMMIT");
      } catch (err) {
        await txClient.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        txClient.release();
      }
    } catch (err) {
      const errorSig = (err as Error).message?.slice(0, 200) ?? "unknown";
      if (process.env.SENTRY_DSN?.trim()) {
        Sentry.withScope((scope) => {
          scope.setTag("job_type", jobContext?.job_type ?? "unknown");
          scope.setTag("run_id", jobRun.run_id);
          scope.setTag("job_run_id", jobRun.id);
          Sentry.captureException(err);
        });
      }
      // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
      if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/index.ts:catch", message: "job failed", data: { job_type: jobContext?.job_type, error: errorSig }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
      }
      // #endregion
      const txClient = await pool.connect();
      try {
        await txClient.query("BEGIN");
        await completeJobFailure(txClient, jobRun.id, jobRun.run_id, jobRun.plan_node_id, config.workerId, errorSig);
        await markRunFailedIfNoPendingJobs(txClient, jobRun.run_id);
        await txClient.query("COMMIT");
      } catch {
        await txClient.query("ROLLBACK").catch(() => {});
      } finally {
        txClient.release();
      }
      // Dev Kernel V1: notify control-plane to classify failure and record in incident_memory (fire-and-forget)
      const controlPlaneUrl = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
      fetch(`${controlPlaneUrl}/v1/job_failures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: jobRun.run_id,
          job_run_id: jobRun.id,
          plan_node_id: jobRun.plan_node_id,
          error_signature: errorSig,
          job_type: jobContext?.job_type ?? undefined,
        }),
      }).catch(() => {});
    } finally {
      stopHeartbeat();
      activeJobs--;
    }
  } finally {
    // outer try (97) finally — no op; ensures try/catch/finally is complete
  }
}

/** Start a minimal HTTP server for GET /health when PORT is set (e.g. Render web service check / MCP). */
function startHealthServer(): void {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 0;
  if (!port || port <= 0) {
    console.log("[runner] PORT not set — health server skipped (worker-only mode)");
    return;
  }
  const server = createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/health/readiness")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "runner" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`[runner] Health server listening on port ${port} (GET /health)`);
  });
}

async function main(): Promise<void> {
  console.log(`[runner] Starting worker ${config.workerId} (v${config.runnerVersion})`);
  await registerWorker(pool, config);
  const q = await pool.query("SELECT count(*)::int AS c FROM job_runs WHERE status = 'queued'");
  console.log(`[runner] DB check: ${q.rows[0]?.c ?? 0} queued job(s) visible`);
  setInterval(async () => {
    try {
      await pollAndExecute();
    } catch (err) {
      console.error("[runner] Poll error:", err);
    }
  }, POLL_INTERVAL_MS);

  startHealthServer();

  // Deploy-failure self-heal (staging): when api-staging is down, runner can still trigger redeploys for api/gateway/runner.
  if (process.env.ENABLE_SELF_HEAL === "true" && process.env.RENDER_API_KEY?.trim()) {
    const run = () => {
      runDeployFailureScanTriggerOnly().catch((err) =>
        console.warn("[runner] Deploy-failure scan error:", (err as Error).message)
      );
    };
    setTimeout(run, 30_000);
    setInterval(run, 5 * 60 * 1000);
    console.log("[runner] Deploy-failure self-heal scan started (every 5 min when RENDER_STAGING_SERVICE_IDS or RENDER_WORKER_SERVICE_ID set)");
  }

  console.log("[runner] Polling for jobs...");
}

main().catch((err) => {
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.captureException(err);
    void Sentry.close(2000).then(() => process.exit(1));
  } else {
    console.error("[runner] Fatal:", err);
    process.exit(1);
  }
});
