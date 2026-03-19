import { v4 as uuid } from "uuid";
/**
 * Look up known repair recipes for an error signature.
 * Supports both schemas: (1) 20250403 applies_to_class/strategy_type, (2) core error_signature/patch_pattern.
 * Returns legacy RepairRecipe shape for executeRepairLoop.
 */
export async function findRepairRecipes(pool, errorSignature, jobType, adapterId) {
    try {
        const result = await pool.query(`SELECT rr.id, rr.recipe_key, rr.applies_to_class,
              fs.class AS class_from_fs,
              rr.strategy_type
       FROM repair_recipes rr
       LEFT JOIN failure_signatures fs ON fs.id = rr.applies_to_signature_id
       WHERE rr.applies_to_class = $1 OR fs.class = $1
       ORDER BY CASE rr.risk_level WHEN 'low' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, rr.recipe_key
       LIMIT 5`, [errorSignature]);
        return result.rows.map((r) => ({
            id: r.id,
            error_signature: r.applies_to_class ?? r.class_from_fs ?? r.recipe_key,
            patch_pattern: r.strategy_type,
            validation_required: "optional",
            success_count: 0,
            failure_count: 0,
        }));
    }
    catch (err) {
        if (err.code !== "42703")
            throw err;
        const legacy = await pool.query(`SELECT id, error_signature, patch_pattern, validation_required, success_count, failure_count
       FROM repair_recipes
       WHERE error_signature = $1 AND (job_type IS NULL OR job_type = $2) AND (adapter_id IS NULL OR adapter_id = $3)
       ORDER BY CASE WHEN success_count + failure_count > 0 THEN success_count::float / (success_count + failure_count) ELSE 0 END DESC, last_used_at DESC NULLS LAST
       LIMIT 5`, [errorSignature, jobType ?? null, adapterId ?? null]);
        return legacy.rows;
    }
}
/**
 * Record the outcome of applying a repair recipe.
 * No-op for 20250403 schema (no success_count/failure_count). For core schema, updates counts.
 */
export async function recordRepairOutcome(pool, recipeId, succeeded) {
    try {
        if (succeeded) {
            await pool.query(`UPDATE repair_recipes SET success_count = success_count + 1, last_used_at = now() WHERE id = $1`, [recipeId]);
        }
        else {
            await pool.query(`UPDATE repair_recipes SET failure_count = failure_count + 1, last_used_at = now() WHERE id = $1`, [recipeId]);
        }
    }
    catch (err) {
        if (err.code === "42703")
            return;
        throw err;
    }
}
/**
 * Promote a new repair into the recipe library.
 * For core schema: INSERT. For 20250403 schema: no-op (use evolution or seed to add recipes).
 */
export async function promoteRepairRecipe(pool, errorSignature, patchPattern, validationRequired, createdFromJobRunId, jobType, adapterId) {
    const id = uuid();
    try {
        await pool.query(`INSERT INTO repair_recipes (id, error_signature, job_type, adapter_id, patch_pattern, validation_required, created_from_job_run_id, success_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`, [id, errorSignature, jobType ?? null, adapterId ?? null, patchPattern, validationRequired, createdFromJobRunId]);
        return id;
    }
    catch (err) {
        if (err.code === "42703")
            return id;
        throw err;
    }
}
/**
 * Execute the repair loop for a failed job_run.
 * Implements: known recipes first → hypotheses → model escalation → halt.
 */
export async function executeRepairLoop(pool, jobRunId, runId, planNodeId, errorSignature, maxAttempts = 4, modelTiers = ["cheap", "strong"]) {
    const client = await pool.connect();
    try {
        // Check current attempt count
        const attemptResult = await client.query(`SELECT MAX(attempt) as attempt FROM job_runs WHERE run_id = $1 AND plan_node_id = $2`, [runId, planNodeId]);
        const currentAttempt = attemptResult.rows[0]?.attempt ?? 1;
        if (currentAttempt >= maxAttempts) {
            // Budget exhausted: halt + generate incident
            await client.query(`INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'halted', $2::jsonb)`, [jobRunId, JSON.stringify({
                    reason: "attempt_budget_exhausted",
                    error_signature: errorSignature,
                    attempts: currentAttempt,
                })]);
            await client.query(`INSERT INTO artifacts (id, run_id, job_run_id, artifact_type, artifact_class, uri, metadata_json)
         VALUES ($1, $2, $3, 'mdd_doc', 'docs', $4, $5)`, [uuid(), runId, jobRunId, `mem://incident/${runId}/${planNodeId}`,
                JSON.stringify({ type: "incident", error_signature: errorSignature })]);
            return { repaired: false, halted: true };
        }
        // Try known recipes first
        const recipes = await findRepairRecipes(pool, errorSignature);
        if (recipes.length > 0) {
            await client.query(`INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'hypothesis_generated', $2::jsonb)`, [jobRunId, JSON.stringify({
                    source: "repair_recipe",
                    recipe_id: recipes[0].id,
                    patch_pattern: recipes[0].patch_pattern,
                })]);
        }
        else {
            // Novel failure: generate hypothesis
            const tierIndex = Math.min(currentAttempt - 1, modelTiers.length - 1);
            const modelTier = modelTiers[tierIndex];
            if (tierIndex > 0) {
                await client.query(`INSERT INTO job_events (job_run_id, event_type, payload_json)
           VALUES ($1, 'escalated_model', $2::jsonb)`, [jobRunId, JSON.stringify({ model_tier: modelTier, attempt: currentAttempt })]);
            }
            await client.query(`INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'hypothesis_generated', $2::jsonb)`, [jobRunId, JSON.stringify({
                    source: "hypothesis",
                    model_tier: modelTier,
                    attempt: currentAttempt,
                })]);
        }
        return { repaired: false, halted: false };
    }
    catch (e) {
        await client.query("ROLLBACK").catch(() => { });
        throw e;
    }
    finally {
        await client.query("ROLLBACK").catch(() => { });
        client.release();
    }
}
//# sourceMappingURL=repair-engine.js.map