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
import { normalizeErrorSignature } from "./error-signature.js";
import { recordSecretAccessByName } from "./secret-access.js";
import {
  peekWpShopifyWizardKind,
  executeWpShopifySourceCrawlJob,
  executeWpShopifyMigrationRunJob,
  executeWpShopifyPdfImportJob,
  executeWpShopifyPdfResolveJob,
} from "./handlers/wp-shopify-wizard-job.js";
import { claimExperimentRun } from "./evolution-claim.js";
import { runEvolutionReplay } from "./handlers/evolution-replay.js";

registerAllHandlers();

const POLL_INTERVAL_MS = 2_000;
const EVOLUTION_POLL_INTERVAL_MS = 10_000;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.trim()) {
  console.error("[runner] DATABASE_URL is not set. Set it in .env (same as Control Plane) so the runner can claim jobs.");
  process.exit(1);
}
// Log DB hint (host/port only) so you can compare with Control Plane GET /health/db — artifacts must be in the same DB.
function isSupabaseSessionPooler5432(connectionString: string): boolean {
  try {
    const u = new URL(connectionString);
    return u.hostname.includes("pooler.supabase.com") && (u.port === "" || u.port === "5432");
  } catch {
    return false;
  }
}

try {
  const u = new URL(databaseUrl);
  console.log("[runner] DATABASE_URL hint (verify same as Control Plane): host=" + u.hostname + " port=" + (u.port || "5432"));
} catch {
  console.log("[runner] DATABASE_URL hint: (could not parse URL)");
}

const sessionPooler = isSupabaseSessionPooler5432(databaseUrl);
const poolMaxEnv = process.env.DATABASE_POOL_MAX?.trim();
const defaultPoolMax = sessionPooler ? 2 : 3;
let poolSize: number;
if (poolMaxEnv) {
  const n = Number(poolMaxEnv);
  poolSize = Number.isFinite(n) && n >= 1 ? Math.min(20, Math.floor(n)) : defaultPoolMax;
} else {
  poolSize = defaultPoolMax;
}
poolSize = Math.max(1, poolSize);

if (sessionPooler && !poolMaxEnv) {
  console.warn(
    "[runner] Supabase Session pooler (pooler.*:5432) shares a small server-side connection cap with every service using this URL. Defaulting DATABASE_POOL_MAX=2. If you see MaxClientsInSessionMode, set DATABASE_URL to the direct host db.<project>.supabase.co (same DB), or set DATABASE_POOL_MAX=1, and reduce pool size on the Control Plane.",
  );
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: poolSize,
  idleTimeoutMillis: 30_000,
  /** Session pooler slots are scarce; wait so a slot freed by another process can be picked up without an immediate fatal. */
  ...(sessionPooler ? { connectionTimeoutMillis: 90_000 } : {}),
});

const rawMaxConc = Number(process.env.MAX_CONCURRENCY ?? "5");
/** Leave at least one pool slot for heartbeats / polls when jobs hold connections. */
const maxConcurrency = Math.min(Math.max(1, rawMaxConc), Math.max(1, poolSize - 1));
const config = {
  workerId: process.env.WORKER_ID ?? `worker-${process.pid}`,
  runnerVersion: process.env.RUNNER_VERSION ?? "0.1.0",
  environment: process.env.ENVIRONMENT ?? "sandbox",
  maxConcurrency,
};
if (maxConcurrency < rawMaxConc) {
  console.warn(
    `[runner] MAX_CONCURRENCY capped to ${maxConcurrency} (DATABASE_POOL_MAX=${poolSize}); raise DATABASE_POOL_MAX to run more jobs in parallel.`,
  );
}

if (process.env.LLM_GATEWAY_URL?.trim()) {
  console.log("[runner] LLM_GATEWAY_URL is set — using gateway for LLM calls.");
} else if (process.env.OPENAI_API_KEY?.trim()) {
  console.log("[runner] Using OPENAI_API_KEY for direct OpenAI (no gateway).");
} else {
  console.warn("[runner] Neither LLM_GATEWAY_URL nor OPENAI_API_KEY set. Set one in .env so LLM handlers (copy_generate, landing_page_generate, etc.) can run.");
}

let activeJobs = 0;
let evolutionBusy = false;

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

    // Digest check: if release pins a runner digest, this process must match (Plan 12B.4).
    const expectedDigest = jobContext?.runner_image_digest;
    if (expectedDigest?.trim()) {
      const currentDigest = process.env.RUNNER_IMAGE_DIGEST?.trim() ?? "";
      if (currentDigest && currentDigest !== expectedDigest) {
        throw new Error(
          `Runner digest mismatch: release expects ${expectedDigest.slice(0, 16)}..., current RUNNER_IMAGE_DIGEST=${currentDigest.slice(0, 16)}...`
        );
      }
    }

    // Record secret access for audit when we use env-based secrets that match secret_refs (Plan 12B.4).
    const envScope = jobContext?.environment ?? config.environment;
    const secretClient = await pool.connect();
    try {
      if (process.env.OPENAI_API_KEY) await recordSecretAccessByName(secretClient, "openai_api_key", envScope, jobRun.id, config.workerId);
      if (process.env.GITHUB_TOKEN) await recordSecretAccessByName(secretClient, "github_token", envScope, jobRun.id, config.workerId);
    } finally {
      secretClient.release();
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
        const jobParams = { runId: jobRun.run_id, jobRunId: jobRun.id, planNodeId: jobRun.plan_node_id };
        if (jobContext.job_type === "wp_shopify_wizard_job") {
          const initiativeId = jobContext.initiative_id;
          if (!initiativeId) throw new Error("initiative_id required for wp_shopify_wizard_job");
          const wizKind = await peekWpShopifyWizardKind(pool, initiativeId, jobRun.run_id, jobRun.plan_node_id);
          if (wizKind === "source_crawl") {
            await executeWpShopifySourceCrawlJob(pool, jobContext, jobParams);
            const lc = await pool.connect();
            try {
              const countResult = await lc.query<{ c: number }>(
                "SELECT count(*)::int AS c FROM public.artifacts WHERE run_id = $1",
                [jobRun.run_id],
              );
              const artifactCount = countResult.rows[0]?.c ?? 0;
              console.log("[runner] wp_shopify source_crawl finished (short DB transactions)", {
                run_id: jobRun.run_id,
                artifact_count: artifactCount,
              });
            } finally {
              lc.release();
            }
            if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
              fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" },
                body: JSON.stringify({
                  sessionId: "24bf14",
                  location: "runners/src/index.ts:source_crawl_done",
                  message: "source_crawl completed",
                  data: { runId: jobRun.run_id },
                  timestamp: Date.now(),
                  hypothesisId: "H3",
                }),
              }).catch(() => {});
            }
          } else if (wizKind === "migration_run_placeholder") {
            await executeWpShopifyMigrationRunJob(pool, jobContext, jobParams);
          } else if (wizKind === "pdf_import") {
            await executeWpShopifyPdfImportJob(pool, jobContext, jobParams);
          } else if (wizKind === "pdf_resolve") {
            await executeWpShopifyPdfResolveJob(pool, jobContext, jobParams);
          } else {
            // Short DB sections only: holding one pool slot across long HTTP starves heartbeats + parallel jobs → lease_expired.
            const wizParams = { ...jobParams, dbPool: pool };
            const c = await pool.connect();
            try {
              await handler(c, jobContext, wizParams);
            } finally {
              c.release();
            }
            const lc = await pool.connect();
            try {
              const countResult = await lc.query<{ c: number }>(
                "SELECT count(*)::int AS c FROM public.artifacts WHERE run_id = $1",
                [jobRun.run_id],
              );
              const artifactCount = countResult.rows[0]?.c ?? 0;
              console.log("[runner] wp_shopify wizard handler finished (no outer transaction)", {
                run_id: jobRun.run_id,
                job_type: jobContext.job_type,
                artifact_count: artifactCount,
              });
              if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
                fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" },
                  body: JSON.stringify({
                    sessionId: "24bf14",
                    location: "runners/src/index.ts:handler_done",
                    message: "handler completed",
                    data: { job_type: jobContext.job_type, runId: jobRun.run_id },
                    timestamp: Date.now(),
                    hypothesisId: "H3",
                  }),
                }).catch(() => {});
              }
            } finally {
              lc.release();
            }
          }
        } else {
          const txClient = await pool.connect();
          try {
            await txClient.query("BEGIN");
            await handler(txClient, jobContext, jobParams);
            await txClient.query("COMMIT");
            const countResult = await txClient.query<{ c: number }>("SELECT count(*)::int AS c FROM public.artifacts WHERE run_id = $1", [jobRun.run_id]);
            const artifactCount = countResult.rows[0]?.c ?? 0;
            console.log("[runner] handler transaction committed (artifacts persisted)", { run_id: jobRun.run_id, job_type: jobContext.job_type, artifact_count: artifactCount });
            if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
              fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/index.ts:handler_done", message: "handler completed", data: { job_type: jobContext.job_type, runId: jobRun.run_id }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
            }
          } catch (err) {
            await txClient.query("ROLLBACK").catch(() => {});
            throw err;
          } finally {
            txClient.release();
          }
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
      const errorSig = normalizeErrorSignature(err);
      const failureMsg = err instanceof Error ? err.message : String(err);
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
        await completeJobFailure(
          txClient,
          jobRun.id,
          jobRun.run_id,
          jobRun.plan_node_id,
          config.workerId,
          errorSig,
          failureMsg,
        );
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

function isSessionPoolerSaturationError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return m.includes("MaxClientsInSessionMode") || m.includes("max clients reached");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Supavisor session mode rejects new clients when the shared pool is full (control plane + other runners compete for the same cap). */
async function withSessionPoolerRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 18;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isSessionPoolerSaturationError(e) || i === maxAttempts - 1) throw e;
      const waitMs = Math.min(45_000, 2500 * 2 ** i);
      console.warn(
        `[runner] ${label}: session pooler saturated (${(e as Error).message.slice(0, 140)}). Retry ${i + 1}/${maxAttempts - 1} in ${Math.round(waitMs / 1000)}s. Prefer direct db.*.supabase.co for DATABASE_URL on this worker.`,
      );
      await sleep(waitMs);
    }
  }
  throw new Error(`${label}: session pooler retries exhausted`);
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

/** Interval for worker_registry heartbeat so control plane /system_state sees workers_alive (requires last_heartbeat_at within 5 min). */
const WORKER_REGISTRY_HEARTBEAT_MS = 2 * 60 * 1000; // 2 minutes

async function main(): Promise<void> {
  console.log(`[runner] Starting worker ${config.workerId} (v${config.runnerVersion})`);
  // Start health server first so Render/Docker health checks pass before DB work
  startHealthServer();
  await withSessionPoolerRetry("registerWorker", () => registerWorker(pool, config));
  setInterval(() => {
    registerWorker(pool, config).catch((err) => {
      const msg = (err as Error).message;
      if (isSessionPoolerSaturationError(err)) {
        console.warn("[runner] Worker registry heartbeat skipped (session pooler full):", msg.slice(0, 160));
        return;
      }
      console.warn("[runner] Worker registry heartbeat error:", msg);
    });
  }, WORKER_REGISTRY_HEARTBEAT_MS);
  const q = await withSessionPoolerRetry("queued job check", () =>
    pool.query("SELECT count(*)::int AS c FROM job_runs WHERE status = 'queued'"),
  );
  console.log(`[runner] DB check: ${q.rows[0]?.c ?? 0} queued job(s) visible`);
  setInterval(async () => {
    try {
      await pollAndExecute();
    } catch (err) {
      console.error("[runner] Poll error:", err);
    }
  }, POLL_INTERVAL_MS);

  setInterval(async () => {
    if (evolutionBusy) return;
    evolutionBusy = true;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await claimExperimentRun(client, config.workerId);
      if (!claimed) {
        await client.query("ROLLBACK");
        return;
      }
      await client.query("COMMIT");
      try {
        await client.query("BEGIN");
        await runEvolutionReplay(client, { experiment_run_id: claimed.id });
        await client.query("COMMIT");
        console.log("[runner] Evolution replay completed", { experiment_run_id: claimed.id });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        await pool.query(
          `UPDATE experiment_runs SET status = 'failed', ended_at = now(), notes = $1 WHERE id = $2`,
          [String((err as Error).message).slice(0, 1000), claimed.id]
        );
        console.error("[runner] Evolution replay failed:", err);
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[runner] Evolution claim error:", err);
    } finally {
      client.release();
      evolutionBusy = false;
    }
  }, EVOLUTION_POLL_INTERVAL_MS);

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
