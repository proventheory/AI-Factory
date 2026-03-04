import { v4 as uuid } from "uuid";
import type pg from "pg";

/**
 * Repair Engine (Section 13.3 Loop A, 13.4.5-6, 12C.11 A10):
 * Failure signatures → repair_recipes → hypothesis generation → escalation.
 *
 * Implements:
 * - Repair recipe lookup (known fixes first)
 * - Bounded hypothesis generation for novel failures
 * - Model tier escalation
 * - Halt + incident generation when budget exhausted
 */

export interface RepairRecipe {
  id: string;
  error_signature: string;
  patch_pattern: string;
  validation_required: string;
  success_count: number;
  failure_count: number;
}

/**
 * Look up known repair recipes for an error signature.
 * Ordered by success rate (most reliable first).
 */
export async function findRepairRecipes(
  pool: pg.Pool,
  errorSignature: string,
  jobType?: string,
  adapterId?: string,
): Promise<RepairRecipe[]> {
  const result = await pool.query<RepairRecipe>(
    `SELECT * FROM repair_recipes
     WHERE error_signature = $1
       AND (job_type IS NULL OR job_type = $2)
       AND (adapter_id IS NULL OR adapter_id = $3)
     ORDER BY
       CASE WHEN success_count + failure_count > 0
            THEN success_count::float / (success_count + failure_count)
            ELSE 0 END DESC,
       last_used_at DESC NULLS LAST
     LIMIT 5`,
    [errorSignature, jobType ?? null, adapterId ?? null],
  );

  return result.rows;
}

/**
 * Record the outcome of applying a repair recipe.
 */
export async function recordRepairOutcome(
  pool: pg.Pool,
  recipeId: string,
  succeeded: boolean,
): Promise<void> {
  if (succeeded) {
    await pool.query(
      `UPDATE repair_recipes SET success_count = success_count + 1, last_used_at = now()
       WHERE id = $1`,
      [recipeId],
    );
  } else {
    await pool.query(
      `UPDATE repair_recipes SET failure_count = failure_count + 1, last_used_at = now()
       WHERE id = $1`,
      [recipeId],
    );
  }
}

/**
 * Promote a new repair into the recipe library.
 * Called when a novel hypothesis repair succeeds and validators pass.
 */
export async function promoteRepairRecipe(
  pool: pg.Pool,
  errorSignature: string,
  patchPattern: string,
  validationRequired: string,
  createdFromJobRunId: string,
  jobType?: string,
  adapterId?: string,
): Promise<string> {
  const id = uuid();
  await pool.query(
    `INSERT INTO repair_recipes
       (id, error_signature, job_type, adapter_id, patch_pattern,
        validation_required, created_from_job_run_id, success_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
    [id, errorSignature, jobType ?? null, adapterId ?? null,
     patchPattern, validationRequired, createdFromJobRunId],
  );
  return id;
}

/**
 * Execute the repair loop for a failed job_run.
 * Implements: known recipes first → hypotheses → model escalation → halt.
 */
export async function executeRepairLoop(
  pool: pg.Pool,
  jobRunId: string,
  runId: string,
  planNodeId: string,
  errorSignature: string,
  maxAttempts: number = 4,
  modelTiers: string[] = ["cheap", "strong"],
): Promise<{ repaired: boolean; halted: boolean }> {
  const client = await pool.connect();

  try {
    // Check current attempt count
    const attemptResult = await client.query<{ attempt: number }>(
      `SELECT MAX(attempt) as attempt FROM job_runs WHERE run_id = $1 AND plan_node_id = $2`,
      [runId, planNodeId],
    );
    const currentAttempt = attemptResult.rows[0]?.attempt ?? 1;

    if (currentAttempt >= maxAttempts) {
      // Budget exhausted: halt + generate incident
      await client.query(
        `INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'halted', $2::jsonb)`,
        [jobRunId, JSON.stringify({
          reason: "attempt_budget_exhausted",
          error_signature: errorSignature,
          attempts: currentAttempt,
        })],
      );

      await client.query(
        `INSERT INTO artifacts (id, run_id, job_run_id, artifact_type, artifact_class, uri, metadata_json)
         VALUES ($1, $2, $3, 'mdd_doc', 'docs', $4, $5)`,
        [uuid(), runId, jobRunId, `mem://incident/${runId}/${planNodeId}`,
         JSON.stringify({ type: "incident", error_signature: errorSignature })],
      );

      return { repaired: false, halted: true };
    }

    // Try known recipes first
    const recipes = await findRepairRecipes(pool, errorSignature);
    if (recipes.length > 0) {
      await client.query(
        `INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'hypothesis_generated', $2::jsonb)`,
        [jobRunId, JSON.stringify({
          source: "repair_recipe",
          recipe_id: recipes[0].id,
          patch_pattern: recipes[0].patch_pattern,
        })],
      );
    } else {
      // Novel failure: generate hypothesis
      const tierIndex = Math.min(currentAttempt - 1, modelTiers.length - 1);
      const modelTier = modelTiers[tierIndex];

      if (tierIndex > 0) {
        await client.query(
          `INSERT INTO job_events (job_run_id, event_type, payload_json)
           VALUES ($1, 'escalated_model', $2::jsonb)`,
          [jobRunId, JSON.stringify({ model_tier: modelTier, attempt: currentAttempt })],
        );
      }

      await client.query(
        `INSERT INTO job_events (job_run_id, event_type, payload_json)
         VALUES ($1, 'hypothesis_generated', $2::jsonb)`,
        [jobRunId, JSON.stringify({
          source: "hypothesis",
          model_tier: modelTier,
          attempt: currentAttempt,
        })],
      );
    }

    return { repaired: false, halted: false };
  } finally {
    client.release();
  }
}
