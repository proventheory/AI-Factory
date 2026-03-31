import { v4 as uuid } from "uuid";
import type pg from "pg";
import type { JobRun, JobClaim } from "../../control-plane/src/types.js";

/** Initial lease and extension window on each heartbeat. Reaper treats lease as stale when lease_expires_at < now() OR heartbeat is old — must extend expiry on heartbeat or long jobs (e.g. WP crawl) die at 10m. */
const LEASE_DURATION_MS = Number.isFinite(Number(process.env.RUNNER_LEASE_DURATION_MS))
  ? Math.max(5 * 60_000, Number(process.env.RUNNER_LEASE_DURATION_MS))
  : 30 * 60_000; // default 30m (blog/PDF migrations); override with RUNNER_LEASE_DURATION_MS
const HEARTBEAT_INTERVAL_MS = 30_000;   // 30 seconds

export interface RunnerConfig {
  workerId: string;
  runnerVersion: string;
  environment: string;
  maxConcurrency: number;
}

export interface ClaimedJob {
  jobRun: JobRun;
  claim: JobClaim;
}

/**
 * Register this worker in the registry.
 */
export async function registerWorker(pool: pg.Pool, config: RunnerConfig): Promise<void> {
  await pool.query(
    `INSERT INTO worker_registry (id, worker_id, last_heartbeat_at, runner_version)
     VALUES (gen_random_uuid(), $1, now(), $2)
     ON CONFLICT (worker_id) DO UPDATE
       SET last_heartbeat_at = now(), runner_version = $2`,
    [config.workerId, config.runnerVersion],
  );
}

/**
 * Claim a single eligible job (Section 12C.9 A3-A4).
 * Atomic: SELECT FOR UPDATE SKIP LOCKED + INSERT job_claims + UPDATE job_runs.
 */
export async function claimJob(client: pg.PoolClient, workerId: string): Promise<ClaimedJob | null> {
  const jobResult = await client.query<JobRun>(
    `SELECT jr.*
     FROM job_runs jr
     JOIN node_progress np ON np.run_id = jr.run_id AND np.plan_node_id = jr.plan_node_id
     WHERE jr.status = 'queued' AND np.status = 'eligible'
     ORDER BY np.eligible_at NULLS FIRST, jr.id
     FOR UPDATE OF jr SKIP LOCKED
     LIMIT 1`,
  );

  if (jobResult.rows.length === 0) return null;

  const jobRun = jobResult.rows[0];
  const claimToken = uuid();
  const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);

  try {
    await client.query(
      `INSERT INTO job_claims (id, job_run_id, worker_id, claim_token, claimed_at, lease_expires_at, heartbeat_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), $4, now())`,
      [jobRun.id, workerId, claimToken, leaseExpiresAt],
    );
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") return null; // unique violation = someone else claimed
    throw err;
  }

  await client.query(
    `UPDATE job_runs SET status = 'running', started_at = now() WHERE id = $1`,
    [jobRun.id],
  );

  await client.query(
    `INSERT INTO job_events (job_run_id, event_type) VALUES ($1, 'attempt_started')`,
    [jobRun.id],
  );

  return {
    jobRun: { ...jobRun, status: "running", started_at: new Date() },
    claim: {
      id: "",
      job_run_id: jobRun.id,
      worker_id: workerId,
      claim_token: claimToken,
      claimed_at: new Date(),
      lease_expires_at: leaseExpiresAt,
      heartbeat_at: new Date(),
      released_at: null,
    },
  };
}

/**
 * Heartbeat: update heartbeat_at for the active lease.
 */
export async function heartbeat(pool: pg.Pool, jobRunId: string, workerId: string): Promise<boolean> {
  const nextLease = new Date(Date.now() + LEASE_DURATION_MS);
  const result = await pool.query(
    `UPDATE job_claims SET heartbeat_at = now(), lease_expires_at = $3
     WHERE job_run_id = $1 AND worker_id = $2 AND released_at IS NULL
     RETURNING id`,
    [jobRunId, workerId, nextLease],
  );
  return result.rows.length > 0;
}

/**
 * Release the lease after job completion.
 */
export async function releaseLease(pool: pg.Pool, jobRunId: string, workerId: string): Promise<void> {
  await pool.query(
    `UPDATE job_claims SET released_at = now()
     WHERE job_run_id = $1 AND worker_id = $2 AND released_at IS NULL`,
    [jobRunId, workerId],
  );
}

/**
 * Complete a job run as succeeded.
 * Uses node_outcomes for single-winner election (Section 5.7c).
 */
export async function completeJobSuccess(
  client: pg.PoolClient,
  jobRunId: string,
  runId: string,
  planNodeId: string,
  workerId: string,
): Promise<boolean> {
  // Single-winner election
  const outcomeResult = await client.query(
    `INSERT INTO node_outcomes (run_id, plan_node_id, outcome_status, winning_job_run_id)
     VALUES ($1, $2, 'succeeded', $3)
     ON CONFLICT (run_id, plan_node_id) DO NOTHING
     RETURNING run_id`,
    [runId, planNodeId, jobRunId],
  );

  if (outcomeResult.rows.length === 0) {
    // Lost the race — another attempt already won
    await client.query(
      `UPDATE job_runs SET status = 'failed', ended_at = now(), error_signature = 'lost_race'
       WHERE id = $1`,
      [jobRunId],
    );
    await client.query(
      `INSERT INTO job_events (job_run_id, event_type, payload_json)
       VALUES ($1, 'attempt_failed', '{"reason":"lost_race"}'::jsonb)`,
      [jobRunId],
    );
    return false;
  }

  await client.query(
    `UPDATE job_runs SET status = 'succeeded', ended_at = now() WHERE id = $1`,
    [jobRunId],
  );

  await client.query(
    `INSERT INTO job_events (job_run_id, event_type) VALUES ($1, 'attempt_succeeded')`,
    [jobRunId],
  );

  await client.query(
    `UPDATE node_progress SET status = 'succeeded' WHERE run_id = $1 AND plan_node_id = $2`,
    [runId, planNodeId],
  );

  await client.query(
    `UPDATE job_claims SET released_at = now()
     WHERE job_run_id = $1 AND worker_id = $2 AND released_at IS NULL`,
    [jobRunId, workerId],
  );

  return true;
}

/**
 * Complete a job run as failed.
 */
export async function completeJobFailure(
  client: pg.PoolClient,
  jobRunId: string,
  runId: string,
  planNodeId: string,
  workerId: string,
  errorSignature: string,
  failureMessage?: string,
): Promise<void> {
  await client.query(
    `UPDATE job_runs SET status = 'failed', ended_at = now(), error_signature = $2
     WHERE id = $1`,
    [jobRunId, errorSignature],
  );
  // Plan §10: set next_retry_at so control-plane sweepDelayedRetries can create attempt+1
  await client.query(
    `UPDATE job_runs SET next_retry_at = now() WHERE id = $1`,
    [jobRunId],
  ).catch(() => {});

  const payload: Record<string, string> = { error_signature: errorSignature };
  if (failureMessage && failureMessage.trim()) {
    payload.message = failureMessage.trim().slice(0, 4000);
  }
  await client.query(
    `INSERT INTO job_events (job_run_id, event_type, payload_json)
     VALUES ($1, 'attempt_failed', $2::jsonb)`,
    [jobRunId, JSON.stringify(payload)],
  );

  await client.query(
    `UPDATE job_claims SET released_at = now()
     WHERE job_run_id = $1 AND worker_id = $2 AND released_at IS NULL`,
    [jobRunId, workerId],
  );
}

/**
 * Start the heartbeat loop for a claimed job.
 * Returns a function to stop the loop.
 *
 * Important: do not stop the loop on transient DB errors (pool saturation, timeouts). A single
 * failed heartbeat used to clear the interval; the reaper then sees stale heartbeat_at (~8m) and
 * marks the job lease_expired while the worker is still uploading PDFs — partial imports with "failed" runs.
 */
export function startHeartbeatLoop(
  pool: pg.Pool,
  jobRunId: string,
  workerId: string,
): () => void {
  let tickInFlight = false;
  const interval = setInterval(() => {
    if (tickInFlight) return;
    tickInFlight = true;
    void (async () => {
      try {
        let ok: boolean | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            ok = await heartbeat(pool, jobRunId, workerId);
            break;
          } catch (e) {
            if (attempt === 4) {
              console.warn(
                `[runner] heartbeat failed after 5 attempts for job_run ${jobRunId} (will retry on next tick):`,
                e instanceof Error ? e.message : e,
              );
              ok = null;
            } else {
              await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
            }
          }
        }
        if (ok === false) clearInterval(interval);
      } finally {
        tickInFlight = false;
      }
    })();
  }, HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(interval);
}
