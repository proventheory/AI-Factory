/**
 * Verifier: after a repair attempt (rollback or deploy_candidate), run verification (boot, migration, healthcheck, smoke).
 * Inserts verification_runs; updates repair_plan status to 'verified' or 'failed'.
 * Scaffold: actual health checks are stubbed (GET service health URL or Render deploy status).
 */

import { pool } from "../db.js";

/**
 * Run verification for an incident (e.g. after rollback or candidate deploy).
 */
export async function runVerification(
  incidentId: string,
  repairPlanId: string | null,
  targetEnvironment: string,
  verificationType: "boot" | "migration" | "healthcheck" | "smoke"
): Promise<{ passed: boolean }> {
  const ins = await pool.query(
    `INSERT INTO verification_runs (incident_id, repair_plan_id, target_environment, verification_type, status, started_at)
     VALUES ($1, $2, $3, $4, 'running', now()) RETURNING id`,
    [incidentId, repairPlanId, targetEnvironment, verificationType]
  );
  const runId = ins.rows[0]?.id as string;

  // Stub: no actual health check; assume pass for scaffold
  const passed = true;
  await pool.query(
    `UPDATE verification_runs SET status = $1, result = $2, finished_at = now() WHERE id = $3`,
    [passed ? "passed" : "failed", JSON.stringify({ stub: true }), runId]
  );

  if (repairPlanId && passed) {
    await pool.query("UPDATE repair_plans SET status = 'verified', updated_at = now() WHERE id = $1", [repairPlanId]);
  }
  return { passed };
}