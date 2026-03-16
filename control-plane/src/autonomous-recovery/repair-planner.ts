/**
 * Repair planner: for incidents in 'classified', choose a repair recipe (rollback, branch_patch, etc.), create repair_plans, set status = 'repair_planned'.
 */

import type { RepairDecisionLegacy } from "./types.js";
import { pool } from "../db.js";

/**
 * Choose repair plan from incident context (deterministic failure, phase, last healthy release).
 */
export function chooseRepairPlan(ctx: {
  deterministicFailure: boolean | null;
  failurePhase: string;
  lastHealthyReleaseId: string | null;
  signatureClass: string | null;
}): RepairDecisionLegacy {
  if (ctx.deterministicFailure && (ctx.failurePhase === "migrate" || ctx.failurePhase === "boot")) {
    if (ctx.lastHealthyReleaseId) {
      return { strategy: "rollback_then_branch_patch", suppressRetries: true, confidence: 0.95 };
    }
    return { strategy: "quarantine_then_branch_patch", suppressRetries: true, confidence: 0.88 };
  }
  if (!ctx.deterministicFailure && ctx.failurePhase === "runtime") {
    return { strategy: "restart_or_redeploy", suppressRetries: false, confidence: 0.75 };
  }
  return { strategy: "quarantine_or_escalate", suppressRetries: true, confidence: 0.5 };
}

/**
 * Plan repair for one incident: select recipe by signature class, insert repair_plans, update incident status.
 */
export async function planRepairForIncident(incidentId: string): Promise<{ planId: string | null }> {
  const inc = await pool.query(
    `SELECT i.id, i.current_signature_id, i.last_healthy_release_id, i.failure_phase, i.deterministic_failure,
            fs.class AS signature_class
     FROM incidents i
     LEFT JOIN failure_signatures fs ON fs.id = i.current_signature_id
     WHERE i.id = $1 AND i.status = 'classified'`,
    [incidentId]
  );
  if (inc.rows.length === 0) return { planId: null };
  const row = inc.rows[0] as {
    current_signature_id: string | null;
    last_healthy_release_id: string | null;
    failure_phase: string;
    deterministic_failure: boolean | null;
    signature_class: string | null;
  };

  const decision = chooseRepairPlan({
    deterministicFailure: row.deterministic_failure,
    failurePhase: row.failure_phase,
    lastHealthyReleaseId: row.last_healthy_release_id,
    signatureClass: row.signature_class,
  });

  const recipes = await pool.query(
    `SELECT id, recipe_key, strategy_type FROM repair_recipes
     WHERE applies_to_class = $1 OR (applies_to_class IS NULL AND recipe_key = 'quarantine_escalate')
     ORDER BY applies_to_class NULLS LAST LIMIT 5`,
    [row.signature_class ?? "migration"]
  );

  const recipeId = recipes.rows[0]?.id as string | undefined ?? (await pool.query("SELECT id FROM repair_recipes WHERE recipe_key = 'quarantine_escalate'")).rows[0]?.id as string | undefined;
  if (!recipeId) return { planId: null };

  const planIns = await pool.query(
    `INSERT INTO repair_plans (incident_id, recipe_id, status, planner_type, confidence, rationale, plan_json)
     VALUES ($1, $2, 'planned', 'rule', $3, $4, $5) RETURNING id`,
    [incidentId, recipeId, decision.confidence, JSON.stringify(decision), JSON.stringify({ decision })]
  );
  const planId = planIns.rows[0]?.id as string;

  await pool.query(
    `UPDATE incidents SET status = 'repair_planned', updated_at = now() WHERE id = $1`,
    [incidentId]
  );

  if (decision.suppressRetries) {
    const svc = await pool.query("SELECT service_name, environment FROM incidents WHERE id = $1", [incidentId]);
    const s = svc.rows[0] as { service_name: string; environment: string };
    await pool.query(
      `UPDATE release_recovery_state SET retry_suppressed = true, suppression_reason = $1, updated_at = now() WHERE service_name = $2 AND environment = $3`,
      ["deterministic failure – repair planned", s.service_name, s.environment]
    );
  }

  return { planId };
}

/**
 * Plan repair for all incidents in 'classified'.
 */
export async function planRepairForAllClassified(): Promise<{ planned: number }> {
  const list = await pool.query("SELECT id FROM incidents WHERE status = 'classified'");
  let planned = 0;
  for (const r of list.rows) {
    const { planId } = await planRepairForIncident((r as { id: string }).id);
    if (planId) planned++;
  }
  return { planned };
}
