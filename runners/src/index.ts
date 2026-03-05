import pg from "pg";
import { registerWorker, claimJob, startHeartbeatLoop, completeJobSuccess, completeJobFailure } from "./runner.js";
import { getJobContext } from "./job-context.js";
import { getHandler, registerAllHandlers } from "./handlers/index.js";
import {
  getExecutor,
  run as runExecutor,
  jobRequestFromContext,
  persistJobResult,
} from "./executor-registry.js";
import { advanceSuccessors, checkRunCompletion } from "../../control-plane/src/scheduler.js";

registerAllHandlers();

const POLL_INTERVAL_MS = 2_000;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const config = {
  workerId: process.env.WORKER_ID ?? `worker-${process.pid}`,
  runnerVersion: process.env.RUNNER_VERSION ?? "0.1.0",
  environment: process.env.ENVIRONMENT ?? "sandbox",
  maxConcurrency: Number(process.env.MAX_CONCURRENCY ?? "5"),
};

let activeJobs = 0;

async function pollAndExecute(): Promise<void> {
  if (activeJobs >= config.maxConcurrency) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await claimJob(client, config.workerId);
    if (!claimed) {
      await client.query("ROLLBACK");
      return;
    }
    await client.query("COMMIT");

    activeJobs++;
    const { jobRun, claim } = claimed;
    const stopHeartbeat = startHeartbeatLoop(pool, jobRun.id, config.workerId);

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
          await txClient.query("ROLLBACK");
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
        } catch (err) {
          await txClient.query("ROLLBACK");
          throw err;
        } finally {
          txClient.release();
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const txClient = await pool.connect();
      try {
        await txClient.query("BEGIN");
        const won = await completeJobSuccess(
          txClient, jobRun.id, jobRun.run_id, jobRun.plan_node_id, config.workerId,
        );
        if (won) {
          await advanceSuccessors(txClient, jobRun.run_id, jobRun.plan_node_id, jobRun.id);
          await checkRunCompletion(txClient, jobRun.run_id);
        }
        await txClient.query("COMMIT");
      } catch (err) {
        await txClient.query("ROLLBACK");
        throw err;
      } finally {
        txClient.release();
      }
    } catch (err) {
      const errorSig = (err as Error).message?.slice(0, 200) ?? "unknown";
      const txClient = await pool.connect();
      try {
        await txClient.query("BEGIN");
        await completeJobFailure(txClient, jobRun.id, jobRun.run_id, jobRun.plan_node_id, config.workerId, errorSig);
        await txClient.query("COMMIT");
      } catch {
        await txClient.query("ROLLBACK");
      } finally {
        txClient.release();
      }
    } finally {
      stopHeartbeat();
      activeJobs--;
    }
  } catch {
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  console.log(`[runner] Starting worker ${config.workerId} (v${config.runnerVersion})`);
  await registerWorker(pool, config);

  setInterval(async () => {
    try {
      await pollAndExecute();
    } catch (err) {
      console.error("[runner] Poll error:", err);
    }
  }, POLL_INTERVAL_MS);

  console.log("[runner] Polling for jobs...");
}

main().catch((err) => {
  console.error("[runner] Fatal:", err);
  process.exit(1);
});
