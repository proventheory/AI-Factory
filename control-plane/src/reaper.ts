import { v4 as uuid } from "uuid";
import type pg from "pg";

const STALE_THRESHOLD_MS = 2 * 60_000; // 2 minutes

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

  for (const lease of staleLeases.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE job_claims SET released_at = now() WHERE id = $1 AND released_at IS NULL`,
        [lease.id],
      );

      await client.query(
        `UPDATE job_runs SET status = 'failed', ended_at = now(),
           error_signature = COALESCE(error_signature, 'lease_expired')
         WHERE id = $1 AND status = 'running'`,
        [lease.job_run_id],
      );

      await client.query(
        `INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'attempt_failed', '{"reason":"lease_expired"}'::jsonb)`,
        [lease.job_run_id],
      );

      // Check if retry is allowed
      const jobInfo = await client.query<{
        run_id: string;
        plan_node_id: string;
        attempt: number;
      }>(
        `SELECT run_id, plan_node_id, attempt FROM job_runs WHERE id = $1`,
        [lease.job_run_id],
      );

      if (jobInfo.rows.length > 0) {
        const { run_id, plan_node_id, attempt } = jobInfo.rows[0];
        if (attempt < maxAttemptsPerNode) {
          const newJobRunId = uuid();
          const idempotencyKey = `${run_id}:${plan_node_id}`;
          await client.query(
            `INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key)
             VALUES ($1, $2, $3, $4, 'queued', $5)`,
            [newJobRunId, run_id, plan_node_id, attempt + 1, idempotencyKey],
          );
        }
      }

      await client.query("COMMIT");
      reaped++;
    } catch {
      await client.query("ROLLBACK").catch(() => {});
    } finally {
      client.release();
    }
  }

  return reaped;
}
