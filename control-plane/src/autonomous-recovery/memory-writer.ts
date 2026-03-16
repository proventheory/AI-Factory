/**
 * Memory writer: when an incident is closed (recovered, rolled_back, quarantined), write incident_memories so future incidents can prefer successful recipes.
 */

import { pool } from "../db.js";

/**
 * Record a successful resolution for an incident (recipe + optional patch ref).
 */
export async function recordIncidentMemory(opts: {
  incidentId: string;
  signatureId: string | null;
  serviceName: string;
  environment: string;
  summary: string;
  successfulRecipeId: string | null;
  successfulPatchRef: string | null;
  lessons: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO incident_memories (signature_id, service_name, environment, summary, successful_recipe_id, successful_patch_ref, lessons)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.signatureId,
      opts.serviceName,
      opts.environment,
      opts.summary,
      opts.successfulRecipeId,
      opts.successfulPatchRef,
      JSON.stringify(opts.lessons ?? {}),
    ]
  );
}

/**
 * When closing an incident, optionally write memory (e.g. if status is recovered or rolled_back).
 */
export async function onIncidentClosed(opts: {
  incidentId: string;
  status: string;
  repairPlanId: string | null;
}): Promise<void> {
  if (opts.status !== "recovered" && opts.status !== "rolled_back") return;

  const inc = await pool.query(
    `SELECT service_name, environment, current_signature_id, root_cause_summary FROM incidents WHERE id = $1`,
    [opts.incidentId]
  );
  if (inc.rows.length === 0) return;
  const row = inc.rows[0] as { service_name: string; environment: string; current_signature_id: string | null; root_cause_summary: string | null };

  let recipeId: string | null = null;
  if (opts.repairPlanId) {
    const rp = await pool.query("SELECT recipe_id FROM repair_plans WHERE id = $1", [opts.repairPlanId]);
    recipeId = rp.rows[0]?.recipe_id ?? null;
  }

  await recordIncidentMemory({
    incidentId: opts.incidentId,
    signatureId: row.current_signature_id,
    serviceName: row.service_name,
    environment: row.environment,
    summary: row.root_cause_summary ?? opts.status,
    successfulRecipeId: recipeId,
    successfulPatchRef: null,
    lessons: { closed_as: opts.status },
  });
}