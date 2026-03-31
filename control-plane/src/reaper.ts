import { v4 as uuid } from "uuid";
import type pg from "pg";

/** Heartbeats run every 30s; allow headroom when the pool is busy or jobs are I/O-heavy (PDF/blog migration). */
const STALE_THRESHOLD_MS = 8 * 60_000; // 8 minutes

/**
 * Lease Reaper (Section 12C.9 A6):
 * Scans for stale/expired job_claims and recovers stuck jobs.
 * Should be run periodically by the Control Plane (e.g. every 30s).
 */
export async function reapStaleLeases(pool: pg.Pool, maxAttemptsPerNode: number = 4): Promise<number> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  const staleLeases = await pool.query<{
    id: string;
    job_run_id: string;
    worker_id: string;
  }>(
    `SELECT jc.id, jc.job_run_id, jc.worker_id
     FROM job_claims jc
     WHERE jc.released_at IS NULL
       AND (jc.lease_expires_at < now() OR jc.heartbeat_at < $1)
     LIMIT 100`,
    [staleThreshold],
  );

  let reaped = 0;
  if (staleLeases.rows.length === 0) return 0;

  /** One client for the whole batch avoids N× pool.connect under a tiny max pool (see db.ts). */
  const client = await pool.connect();
  try {
    for (const lease of staleLeases.rows) {
      try {
        await client.query("BEGIN");

        await client.query(
          `UPDATE job_claims SET released_at = now() WHERE id = $1 AND released_at IS NULL`,
          [lease.id],
        );

        // Load job info first (for next_retry_at and for sweep to create attempt+1; Plan §10 delayed retry)
        const jobInfo = await client.query<{
          run_id: string;
          plan_node_id: string;
          attempt: number;
        }>(
          `SELECT run_id, plan_node_id, attempt FROM job_runs WHERE id = $1`,
          [lease.job_run_id],
        );

        const retryAllowed = jobInfo.rows.length > 0 && jobInfo.rows[0].attempt < maxAttemptsPerNode;

        await client.query(
          `UPDATE job_runs SET status = 'failed', ended_at = now(),
           error_signature = COALESCE(error_signature, 'lease_expired')
         WHERE id = $1 AND status = 'running'`,
          [lease.job_run_id],
        );

        if (retryAllowed) {
          await client.query(
            `UPDATE job_runs SET next_retry_at = $2 WHERE id = $1`,
            [lease.job_run_id, new Date()],
          ).catch(() => {});
        }

        await client.query(
          `INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'attempt_failed', '{"reason":"lease_expired"}'::jsonb)`,
          [lease.job_run_id],
        );

        // Do not insert attempt+1 here; sweepDelayedRetries() will create it when next_retry_at <= now()

        await client.query("COMMIT");
        reaped++;
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      }
    }
  } finally {
    client.release();
  }

  return reaped;
}

const DEFAULT_MAX_ATTEMPTS_PER_NODE = 4;

/**
 * Sweep delayed retries (Plan §10): job_runs with status = 'failed', next_retry_at <= now(),
 * attempt < max → insert attempt+1 (queued) and clear next_retry_at.
 * Call this from the control-plane loop next to reapStaleLeases.
 */
export async function sweepDelayedRetries(
  pool: pg.Pool,
  maxAttemptsPerNode: number = DEFAULT_MAX_ATTEMPTS_PER_NODE,
): Promise<number> {
  const rows = await pool.query<{
    id: string;
    run_id: string;
    plan_node_id: string;
    attempt: number;
  }>(
    `SELECT id, run_id, plan_node_id, attempt
     FROM job_runs
     WHERE status = 'failed'
       AND next_retry_at IS NOT NULL
       AND next_retry_at <= now()
       AND attempt < $1
     ORDER BY next_retry_at ASC
     LIMIT 100`,
    [maxAttemptsPerNode],
  );

  let swept = 0;
  if (rows.rows.length === 0) return 0;

  const client = await pool.connect();
  try {
    for (const row of rows.rows) {
      try {
        await client.query("BEGIN");
        const newJobRunId = uuid();
        const idempotencyKey = `${row.run_id}:${row.plan_node_id}`;
        await client.query(
          `INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key)
         VALUES ($1, $2, $3, $4, 'queued', $5)`,
          [newJobRunId, row.run_id, row.plan_node_id, row.attempt + 1, idempotencyKey],
        );
        await client.query(
          `UPDATE job_runs SET next_retry_at = NULL WHERE id = $1`,
          [row.id],
        );
        await client.query("COMMIT");
        swept++;
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      }
    }
  } finally {
    client.release();
  }
  return swept;
}

/**
 * Reconcile run status: runs that are still "running" but have all node_progress
 * succeeded (e.g. runner died or errored before calling checkRunCompletion) get
 * marked "succeeded" so the UI shows the correct state.
 */
export async function reconcileRunStatuses(pool: pg.Pool): Promise<number> {
  const runs = await pool.query<{ id: string }>(
    `SELECT r.id
     FROM runs r
     WHERE r.status = 'running'
       AND (SELECT count(*) FROM node_progress np WHERE np.run_id = r.id) > 0
       AND (SELECT count(*) FROM node_progress np WHERE np.run_id = r.id AND np.status = 'succeeded')
           = (SELECT count(*) FROM node_progress np WHERE np.run_id = r.id)
     LIMIT 200`,
  );
  let reconciled = 0;
  for (const row of runs.rows) {
    const r = await pool.query(
      `UPDATE runs SET status = 'succeeded', ended_at = now() WHERE id = $1 AND status = 'running' RETURNING id`,
      [row.id],
    );
    if (r.rowCount && r.rowCount > 0) {
      await pool.query(
        `INSERT INTO run_events (run_id, event_type) VALUES ($1, 'succeeded')`,
        [row.id],
      ).catch(() => {});
      reconciled++;
    }
  }
  return reconciled;
}

/**
 * Reconcile runs stuck in "running" when there are no pending job_runs (all are succeeded or failed).
 * E.g. after lease_expired the job_runs are failed but the run was never marked failed/succeeded.
 */
export async function reconcileRunningRunsWithNoPendingJobs(pool: pg.Pool): Promise<{ succeeded: number; failed: number }> {
  const runs = await pool.query<{ id: string }>(
    `SELECT r.id
     FROM runs r
     WHERE r.status = 'running'
       AND (SELECT count(*) FROM job_runs jr WHERE jr.run_id = r.id AND jr.status IN ('queued', 'running')) = 0
       AND (SELECT count(*) FROM job_runs jr WHERE jr.run_id = r.id) > 0
     LIMIT 200`,
  );
  let succeeded = 0;
  let failed = 0;
  for (const row of runs.rows) {
    const counts = await pool.query<{ succeeded: string; failed: string }>(
      `SELECT
         count(*) FILTER (WHERE status = 'succeeded')::text AS succeeded,
         count(*) FILTER (WHERE status = 'failed')::text AS failed
       FROM job_runs WHERE run_id = $1`,
      [row.id],
    );
    const s = Number(counts.rows[0]?.succeeded ?? 0);
    const f = Number(counts.rows[0]?.failed ?? 0);
    if (s > 0 && f === 0) {
      const r = await pool.query(
        `UPDATE runs SET status = 'succeeded', ended_at = now() WHERE id = $1 AND status = 'running' RETURNING id`,
        [row.id],
      );
      if (r.rowCount && r.rowCount > 0) {
        await pool.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'stage_exited')`, [row.id]).catch(() => {});
        await pool.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'succeeded')`, [row.id]).catch(() => {});
        succeeded++;
      }
    } else {
      const r = await pool.query(
        `UPDATE runs SET status = 'failed', ended_at = now() WHERE id = $1 AND status = 'running' RETURNING id`,
        [row.id],
      );
      if (r.rowCount && r.rowCount > 0) {
        await pool.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'stage_exited')`, [row.id]).catch(() => {});
        await pool.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'failed')`, [row.id]).catch(() => {});
        failed++;
      }
    }
  }
  return { succeeded, failed };
}

/** Threshold: if a run is still "running" and all job_runs are "queued" (never started) for this long, mark run + jobs failed. */
const STALE_QUEUED_RUN_MS = 10 * 60_000; // 10 minutes

/**
 * Reconcile runs that are "running" but have only queued job_runs that were never claimed.
 * After STALE_QUEUED_RUN_MS, mark the run and those job_runs as failed so the UI shows a result.
 */
export async function reconcileRunningRunsWithStaleQueuedJobs(pool: pg.Pool): Promise<number> {
  const since = new Date(Date.now() - STALE_QUEUED_RUN_MS);
  const runs = await pool.query<{ id: string }>(
    `SELECT r.id
     FROM runs r
     WHERE r.status = 'running'
       AND r.started_at IS NOT NULL AND r.started_at < $1
       AND (SELECT count(*) FROM job_runs jr WHERE jr.run_id = r.id AND jr.status IN ('queued', 'running')) > 0
       AND (SELECT count(*) FROM job_runs jr WHERE jr.run_id = r.id AND jr.started_at IS NOT NULL) = 0
     LIMIT 100`,
    [since],
  );
  let failed = 0;
  if (runs.rows.length === 0) return 0;

  const client = await pool.connect();
  try {
    for (const row of runs.rows) {
      try {
        await client.query("BEGIN");
        // DB allows only queued->running, running->failed
        await client.query(
          `UPDATE job_runs SET status = 'running', started_at = now() WHERE run_id = $1 AND status = 'queued'`,
          [row.id],
        );
        await client.query(
          `UPDATE job_runs SET status = 'failed', ended_at = now(), error_signature = COALESCE(error_signature, 'never_claimed')
         WHERE run_id = $1 AND status = 'running' AND started_at IS NOT NULL AND ended_at IS NULL`,
          [row.id],
        );
        const r = await client.query(
          `UPDATE runs SET status = 'failed', ended_at = now() WHERE id = $1 AND status = 'running' RETURNING id`,
          [row.id],
        );
        if (r.rowCount && r.rowCount > 0) {
          await client.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'stage_exited')`, [row.id]).catch(() => {});
          await client.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'failed')`, [row.id]).catch(() => {});
          failed++;
        }
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      }
    }
  } finally {
    client.release();
  }
  return failed;
}
