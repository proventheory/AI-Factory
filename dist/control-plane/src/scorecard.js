import { v4 as uuid } from "uuid";
/**
 * Generate a Factory Scorecard for a given release + environment.
 */
export async function generateScorecard(pool, releaseId, environment, windowMinutes = 60) {
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);
    // Reliability
    const runStats = await pool.query(`SELECT count(*) as total,
            count(*) FILTER (WHERE status = 'succeeded') as succeeded
     FROM runs WHERE release_id = $1 AND environment = $2 AND started_at >= $3`, [releaseId, environment, cutoff]);
    const totalRuns = Number(runStats.rows[0].total);
    const succeededRuns = Number(runStats.rows[0].succeeded);
    const jobStats = await pool.query(`SELECT count(*) as total,
            count(*) FILTER (WHERE jr.status = 'succeeded') as succeeded,
            count(*) FILTER (WHERE jr.attempt > 1) as retried
     FROM job_runs jr
     JOIN runs r ON r.id = jr.run_id
     WHERE r.release_id = $1 AND r.environment = $2 AND r.started_at >= $3`, [releaseId, environment, cutoff]);
    const totalJobs = Number(jobStats.rows[0].total);
    const succeededJobs = Number(jobStats.rows[0].succeeded);
    const retriedJobs = Number(jobStats.rows[0].retried);
    const leaseExpiries = await pool.query(`SELECT count(*) as count
     FROM job_runs jr
     JOIN runs r ON r.id = jr.run_id
     WHERE r.release_id = $1 AND r.environment = $2 AND r.started_at >= $3
       AND jr.error_signature = 'lease_expired'`, [releaseId, environment, cutoff]);
    // Velocity
    const durations = await pool.query(`SELECT
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000) as median_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000) as p95_ms
     FROM runs
     WHERE release_id = $1 AND environment = $2 AND started_at >= $3
       AND ended_at IS NOT NULL`, [releaseId, environment, cutoff]);
    // Quality
    const validations = await pool.query(`SELECT count(*) as total,
            count(*) FILTER (WHERE v.status = 'fail') as failed
     FROM validations v
     JOIN runs r ON r.id = v.run_id
     WHERE r.release_id = $1 AND r.environment = $2 AND r.started_at >= $3`, [releaseId, environment, cutoff]);
    const totalValidations = Number(validations.rows[0].total);
    const failedValidations = Number(validations.rows[0].failed);
    const goldenResults = await pool.query(`SELECT count(*) as total,
            count(*) FILTER (WHERE v.status = 'pass') as passed
     FROM validations v
     JOIN runs r ON r.id = v.run_id
     WHERE r.release_id = $1 AND r.environment = $2 AND r.started_at >= $3
       AND v.validator_type = 'golden_test'`, [releaseId, environment, cutoff]);
    const scorecard = {
        releaseId,
        environment,
        cohort: null,
        reliability: {
            runSuccessRate: totalRuns > 0 ? succeededRuns / totalRuns : 1,
            jobSuccessRate: totalJobs > 0 ? succeededJobs / totalJobs : 1,
            leaseExpiryRate: totalJobs > 0 ? Number(leaseExpiries.rows[0].count) / totalJobs : 0,
            retryRate: totalJobs > 0 ? retriedJobs / totalJobs : 0,
        },
        determinism: {
            reproducibilityRate: 1, // Requires replay comparison; placeholder
            idempotencyConflictRate: 0, // Would need tool_calls conflict tracking
        },
        safety: {
            policyViolationCount: 0,
            unauthorizedCapabilityAttempts: 0,
        },
        velocity: {
            medianRunDurationMs: Number(durations.rows[0]?.median_ms ?? 0),
            p95RunDurationMs: Number(durations.rows[0]?.p95_ms ?? 0),
            timeToGreenAfterFailureMs: 0, // Would need temporal analysis
        },
        quality: {
            goldenSuitePassRate: Number(goldenResults.rows[0].total) > 0
                ? Number(goldenResults.rows[0].passed) / Number(goldenResults.rows[0].total) : 1,
            validationFailureRate: totalValidations > 0
                ? failedValidations / totalValidations : 0,
        },
        computedAt: new Date(),
    };
    // Store as artifact
    const latestRun = await pool.query(`SELECT id FROM runs WHERE release_id = $1 AND environment = $2
     ORDER BY created_at DESC LIMIT 1`, [releaseId, environment]);
    if (latestRun.rows.length > 0) {
        await pool.query(`INSERT INTO artifacts (id, run_id, artifact_type, artifact_class, uri, metadata_json)
       VALUES ($1, $2, 'scorecard_report', 'docs', $3, $4)`, [uuid(), latestRun.rows[0].id, `mem://scorecard/${releaseId}/${environment}`,
            JSON.stringify(scorecard)]);
    }
    return scorecard;
}
//# sourceMappingURL=scorecard.js.map