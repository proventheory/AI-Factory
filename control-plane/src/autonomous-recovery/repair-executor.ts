/**
 * Repair executor: run repair_plans in status 'planned' by executing repair_attempts (bounded tools only).
 * Actions: pause_retries, rollback, create_branch, generate_patch, run_shadow_migration, deploy_candidate, verify_candidate, promote_candidate, mark_quarantined.
 * This is a scaffold; actual tool calls (Render API rollback, Git branch, etc.) are stubbed or delegated.
 */

import { pool } from "../db.js";
import { triggerRenderDeploy } from "../render-worker-remediate.js";

/**
 * Execute one repair plan: create repair_attempts for each step in the recipe, run them in order.
 */
export async function executeRepairPlan(planId: string): Promise<{ attempts: number; lastStatus: string }> {
  const plan = await pool.query(
    `SELECT rp.id, rp.incident_id, rp.recipe_id, rp.status, rr.steps, i.service_name
     FROM repair_plans rp
     JOIN repair_recipes rr ON rr.id = rp.recipe_id
     JOIN incidents i ON i.id = rp.incident_id
     WHERE rp.id = $1 AND rp.status = 'planned'`,
    [planId]
  );
  if (plan.rows.length === 0) return { attempts: 0, lastStatus: "planned" };

  const row = plan.rows[0] as { incident_id: string; recipe_id: string; steps: string[]; service_name: string };
  const steps = Array.isArray(row.steps) ? row.steps : [];
  const serviceId = row.service_name?.replace("render:", "") ?? "";
  await pool.query("UPDATE repair_plans SET status = 'running', updated_at = now() WHERE id = $1", [planId]);

  let attemptNo = 0;
  let lastStatus = "running";

  for (const actionType of steps) {
    attemptNo++;
    const attemptIns = await pool.query(
      `INSERT INTO repair_attempts (repair_plan_id, attempt_no, action_type, status, input) VALUES ($1, $2, $3, 'running', '{}') RETURNING id`,
      [planId, attemptNo, actionType]
    );
    const attemptId = attemptIns.rows[0]?.id as string;
    await pool.query(
      `UPDATE repair_attempts SET started_at = now() WHERE id = $1`,
      [attemptId]
    );

    let status: "succeeded" | "failed" | "skipped" = "succeeded";
    let errorText: string | null = null;

    if (actionType === "pause_retries") {
      // Already done by planner
    } else if (actionType === "redeploy" || actionType === "restart") {
      if (serviceId && process.env.RENDER_API_KEY) {
        try {
          await triggerRenderDeploy(process.env.RENDER_API_KEY, serviceId, true);
        } catch (e) {
          errorText = (e as Error).message;
          status = "failed";
        }
      }
    } else if (actionType === "rollback" || actionType === "generate_patch" || actionType === "create_branch" || actionType === "run_shadow_migration" || actionType === "deploy_candidate" || actionType === "verify" || actionType === "promote") {
      // Stub: not implemented; mark skipped so pipeline can be extended later
      status = "skipped";
      errorText = "Tool not implemented yet";
    } else if (actionType === "mark_quarantined") {
      await pool.query(
        `UPDATE incidents SET status = 'quarantined', quarantine_reason = 'repair plan quarantine', updated_at = now() WHERE id = $1`,
        [row.incident_id]
      );
    }

    await pool.query(
      `UPDATE repair_attempts SET status = $1, error_text = $2, finished_at = now() WHERE id = $3`,
      [status, errorText, attemptId]
    );
    if (status === "failed") {
      await pool.query("UPDATE repair_plans SET status = 'failed', updated_at = now() WHERE id = $1", [planId]);
      lastStatus = "failed";
      break;
    }
  }

  if (lastStatus === "running") {
    await pool.query("UPDATE repair_plans SET status = 'running', updated_at = now() WHERE id = $1", [planId]);
  }
  return { attempts: attemptNo, lastStatus };
}

/**
 * Run executor for all plans in status 'planned'.
 */
export async function executeAllPlannedPlans(): Promise<{ executed: number }> {
  const list = await pool.query("SELECT id FROM repair_plans WHERE status = 'planned'");
  let executed = 0;
  for (const r of list.rows) {
    await executeRepairPlan((r as { id: string }).id);
    executed++;
  }
  return { executed };
}
