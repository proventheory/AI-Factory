import { v4 as uuid } from "uuid";
/**
 * Determine which release/cohort a new run should be assigned to.
 * Uses release_routes or percent_rollout on active releases.
 */
export async function routeRun(pool, environment) {
    const routes = await pool.query(`SELECT rule_id, release_id, cohort, percent
     FROM release_routes
     WHERE environment = $1
       AND (active_from IS NULL OR active_from <= now())
       AND (active_to IS NULL OR active_to > now())
     ORDER BY cohort, percent DESC`, [environment]);
    if (routes.rows.length > 0) {
        const canaryRoute = routes.rows.find((r) => r.cohort === "canary");
        if (canaryRoute && canaryRoute.percent > 0) {
            const roll = Math.random() * 100;
            if (roll < canaryRoute.percent) {
                return {
                    releaseId: canaryRoute.release_id,
                    cohort: "canary",
                    routingReason: "canary_sample",
                    routingRuleId: canaryRoute.rule_id,
                };
            }
        }
        const controlRoute = routes.rows.find((r) => r.cohort === "control");
        if (controlRoute) {
            return {
                releaseId: controlRoute.release_id,
                cohort: "control",
                routingReason: "control_default",
                routingRuleId: controlRoute.rule_id,
            };
        }
    }
    // Fallback: use the latest promoted release
    const latest = await pool.query(`SELECT id FROM releases WHERE status = 'promoted' ORDER BY created_at DESC LIMIT 1`);
    if (latest.rows.length === 0) {
        throw new Error(`No promoted release found for environment ${environment}`);
    }
    return {
        releaseId: latest.rows[0].id,
        cohort: "control",
        routingReason: "fallback_latest_promoted",
        routingRuleId: null,
    };
}
/**
 * Compute canary drift metrics over a sliding window (Section 8.1).
 */
export async function computeDrift(pool, environment, windowMinutes = 60, rollbackThreshold = -0.05) {
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);
    const stats = await pool.query(`SELECT r.cohort,
            count(*) AS total,
            count(*) FILTER (WHERE r.status = 'succeeded') AS succeeded
     FROM runs r
     WHERE r.environment = $1
       AND r.started_at >= $2
       AND r.cohort IS NOT NULL
     GROUP BY r.cohort`, [environment, cutoff]);
    let canaryTotal = 0, canaryOk = 0, controlTotal = 0, controlOk = 0;
    for (const row of stats.rows) {
        if (row.cohort === "canary") {
            canaryTotal = Number(row.total);
            canaryOk = Number(row.succeeded);
        }
        else {
            controlTotal = Number(row.total);
            controlOk = Number(row.succeeded);
        }
    }
    const canaryRate = canaryTotal > 0 ? canaryOk / canaryTotal : 1;
    const controlRate = controlTotal > 0 ? controlOk / controlTotal : 1;
    const delta = canaryRate - controlRate;
    // Check for new error signatures in canary not present in control
    const newSigs = await pool.query(`SELECT DISTINCT jr.error_signature
     FROM job_runs jr
     JOIN runs r ON r.id = jr.run_id
     WHERE r.environment = $1 AND r.started_at >= $2
       AND r.cohort = 'canary' AND jr.status = 'failed'
       AND jr.error_signature IS NOT NULL
       AND jr.error_signature NOT IN (
         SELECT DISTINCT jr2.error_signature
         FROM job_runs jr2
         JOIN runs r2 ON r2.id = jr2.run_id
         WHERE r2.environment = $1 AND r2.started_at >= $2
           AND r2.cohort = 'control' AND jr2.status = 'failed'
           AND jr2.error_signature IS NOT NULL
       )`, [environment, cutoff]);
    const canaryNewSignatures = newSigs.rows.map((r) => r.error_signature);
    const shouldRollback = delta < rollbackThreshold || canaryNewSignatures.length > 0;
    return {
        canarySuccessRate: canaryRate,
        controlSuccessRate: controlRate,
        successRateDelta: delta,
        canaryNewSignatures,
        shouldRollback,
    };
}
/**
 * Execute an automatic rollback: disable canary, mark release rolled_back.
 */
export async function executeRollback(pool, canaryReleaseId, environment) {
    await pool.query(`UPDATE releases SET status = 'rolled_back', percent_rollout = 0 WHERE id = $1`, [canaryReleaseId]);
    await pool.query(`UPDATE release_routes SET active_to = now()
     WHERE release_id = $1 AND environment = $2 AND active_to IS NULL`, [canaryReleaseId, environment]);
    // Generate incident artifact
    const incidentId = uuid();
    const latestRun = await pool.query(`SELECT id FROM runs WHERE release_id = $1 ORDER BY created_at DESC LIMIT 1`, [canaryReleaseId]);
    const runId = latestRun.rows[0]?.id;
    if (runId) {
        await pool.query(`INSERT INTO artifacts (id, run_id, artifact_type, artifact_class, uri, metadata_json)
       VALUES ($1, $2, 'drift_report', 'docs', $3, $4)`, [incidentId, runId, `mem://drift-report/${canaryReleaseId}`,
            JSON.stringify({ release_id: canaryReleaseId, action: "auto_rollback" })]);
    }
    return incidentId;
}
//# sourceMappingURL=release-manager.js.map