import { v4 as uuid } from "uuid";
const STALE_THRESHOLD_MS = 2 * 60_000; // 2 minutes
/**
 * Lease Reaper (Section 12C.9 A6):
 * Scans for stale/expired job_claims and recovers stuck jobs.
 * Should be run periodically by the Control Plane (e.g. every 30s).
 */
export async function reapStaleLeases(pool, maxAttemptsPerNode = 4) {
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
    const staleLeases = await pool.query(`SELECT jc.id, jc.job_run_id, jc.worker_id
     FROM job_claims jc
     WHERE jc.released_at IS NULL
       AND (jc.lease_expires_at < now() OR jc.heartbeat_at < $1)
     LIMIT 100`, [staleThreshold]);
    let reaped = 0;
    for (const lease of staleLeases.rows) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(`UPDATE job_claims SET released_at = now() WHERE id = $1 AND released_at IS NULL`, [lease.id]);
            await client.query(`UPDATE job_runs SET status = 'failed', ended_at = now(),
           error_signature = COALESCE(error_signature, 'lease_expired')
         WHERE id = $1 AND status = 'running'`, [lease.job_run_id]);
            await client.query(`INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'attempt_failed', '{"reason":"lease_expired"}'::jsonb)`, [lease.job_run_id]);
            // Check if retry is allowed
            const jobInfo = await client.query(`SELECT run_id, plan_node_id, attempt FROM job_runs WHERE id = $1`, [lease.job_run_id]);
            if (jobInfo.rows.length > 0) {
                const { run_id, plan_node_id, attempt } = jobInfo.rows[0];
                if (attempt < maxAttemptsPerNode) {
                    const newJobRunId = uuid();
                    const idempotencyKey = `${run_id}:${plan_node_id}`;
                    await client.query(`INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key)
             VALUES ($1, $2, $3, $4, 'queued', $5)`, [newJobRunId, run_id, plan_node_id, attempt + 1, idempotencyKey]);
                }
            }
            await client.query("COMMIT");
            reaped++;
        }
        catch {
            await client.query("ROLLBACK").catch(() => { });
        }
        finally {
            client.release();
        }
    }
    return reaped;
}
/**
 * Reconcile run status: runs that are still "running" but have all node_progress
 * succeeded (e.g. runner died or errored before calling checkRunCompletion) get
 * marked "succeeded" so the UI shows the correct state.
 */
export async function reconcileRunStatuses(pool) {
    const runs = await pool.query(`SELECT r.id
     FROM runs r
     WHERE r.status = 'running'
       AND (SELECT count(*) FROM node_progress np WHERE np.run_id = r.id) > 0
       AND (SELECT count(*) FROM node_progress np WHERE np.run_id = r.id AND np.status = 'succeeded')
           = (SELECT count(*) FROM node_progress np WHERE np.run_id = r.id)
     LIMIT 200`);
    let reconciled = 0;
    for (const row of runs.rows) {
        const r = await pool.query(`UPDATE runs SET status = 'succeeded', ended_at = now() WHERE id = $1 AND status = 'running' RETURNING id`, [row.id]);
        if (r.rowCount && r.rowCount > 0) {
            await pool.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'succeeded')`, [row.id]).catch(() => { });
            reconciled++;
        }
    }
    return reconciled;
}
//# sourceMappingURL=reaper.js.map