import { v4 as uuid } from "uuid";
const LEASE_DURATION_MS = 10 * 60_000; // 10 minutes
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
/**
 * Register this worker in the registry.
 */
export async function registerWorker(pool, config) {
    await pool.query(`INSERT INTO worker_registry (id, worker_id, last_heartbeat_at, runner_version)
     VALUES (gen_random_uuid(), $1, now(), $2)
     ON CONFLICT (worker_id) DO UPDATE
       SET last_heartbeat_at = now(), runner_version = $2`, [config.workerId, config.runnerVersion]);
}
/**
 * Claim a single eligible job (Section 12C.9 A3-A4).
 * Atomic: SELECT FOR UPDATE SKIP LOCKED + INSERT job_claims + UPDATE job_runs.
 */
export async function claimJob(client, workerId) {
    const jobResult = await client.query(`SELECT jr.*
     FROM job_runs jr
     JOIN node_progress np ON np.run_id = jr.run_id AND np.plan_node_id = jr.plan_node_id
     WHERE jr.status = 'queued' AND np.status = 'eligible'
     ORDER BY np.eligible_at NULLS FIRST, jr.id
     FOR UPDATE OF jr SKIP LOCKED
     LIMIT 1`);
    if (jobResult.rows.length === 0)
        return null;
    const jobRun = jobResult.rows[0];
    const claimToken = uuid();
    const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);
    try {
        await client.query(`INSERT INTO job_claims (id, job_run_id, worker_id, claim_token, claimed_at, lease_expires_at, heartbeat_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), $4, now())`, [jobRun.id, workerId, claimToken, leaseExpiresAt]);
    }
    catch (err) {
        if (err.code === "23505")
            return null; // unique violation = someone else claimed
        throw err;
    }
    await client.query(`UPDATE job_runs SET status = 'running', started_at = now() WHERE id = $1`, [jobRun.id]);
    await client.query(`INSERT INTO job_events (job_run_id, event_type) VALUES ($1, 'attempt_started')`, [jobRun.id]);
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
export async function heartbeat(pool, jobRunId, workerId) {
    const result = await pool.query(`UPDATE job_claims SET heartbeat_at = now()
     WHERE job_run_id = $1 AND worker_id = $2 AND released_at IS NULL
     RETURNING id`, [jobRunId, workerId]);
    return result.rows.length > 0;
}
/**
 * Release the lease after job completion.
 */
export async function releaseLease(pool, jobRunId, workerId) {
    await pool.query(`UPDATE job_claims SET released_at = now()
     WHERE job_run_id = $1 AND worker_id = $2 AND released_at IS NULL`, [jobRunId, workerId]);
}
/**
 * Complete a job run as succeeded.
 * Uses node_outcomes for single-winner election (Section 5.7c).
 */
export async function completeJobSuccess(client, jobRunId, runId, planNodeId, workerId) {
    // Single-winner election
    const outcomeResult = await client.query(`INSERT INTO node_outcomes (run_id, plan_node_id, outcome_status, winning_job_run_id)
     VALUES ($1, $2, 'succeeded', $3)
     ON CONFLICT (run_id, plan_node_id) DO NOTHING
     RETURNING run_id`, [runId, planNodeId, jobRunId]);
    if (outcomeResult.rows.length === 0) {
        // Lost the race — another attempt already won
        await client.query(`UPDATE job_runs SET status = 'failed', ended_at = now(), error_signature = 'lost_race'
       WHERE id = $1`, [jobRunId]);
        await client.query(`INSERT INTO job_events (job_run_id, event_type, payload_json)
       VALUES ($1, 'attempt_failed', '{"reason":"lost_race"}'::jsonb)`, [jobRunId]);
        return false;
    }
    await client.query(`UPDATE job_runs SET status = 'succeeded', ended_at = now() WHERE id = $1`, [jobRunId]);
    await client.query(`INSERT INTO job_events (job_run_id, event_type) VALUES ($1, 'attempt_succeeded')`, [jobRunId]);
    await client.query(`UPDATE node_progress SET status = 'succeeded' WHERE run_id = $1 AND plan_node_id = $2`, [runId, planNodeId]);
    await client.query(`UPDATE job_claims SET released_at = now()
     WHERE job_run_id = $1 AND worker_id = $2 AND released_at IS NULL`, [jobRunId, workerId]);
    return true;
}
/**
 * Complete a job run as failed.
 */
export async function completeJobFailure(client, jobRunId, runId, planNodeId, workerId, errorSignature) {
    await client.query(`UPDATE job_runs SET status = 'failed', ended_at = now(), error_signature = $2
     WHERE id = $1`, [jobRunId, errorSignature]);
    await client.query(`INSERT INTO job_events (job_run_id, event_type, payload_json)
     VALUES ($1, 'attempt_failed', $2::jsonb)`, [jobRunId, JSON.stringify({ error_signature: errorSignature })]);
    await client.query(`UPDATE job_claims SET released_at = now()
     WHERE job_run_id = $1 AND worker_id = $2 AND released_at IS NULL`, [jobRunId, workerId]);
}
/**
 * Start the heartbeat loop for a claimed job.
 * Returns a function to stop the loop.
 */
export function startHeartbeatLoop(pool, jobRunId, workerId) {
    const interval = setInterval(async () => {
        try {
            const ok = await heartbeat(pool, jobRunId, workerId);
            if (!ok)
                clearInterval(interval);
        }
        catch {
            clearInterval(interval);
        }
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
}
//# sourceMappingURL=runner.js.map