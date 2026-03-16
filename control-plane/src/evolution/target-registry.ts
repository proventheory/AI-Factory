/**
 * Evolution Loop V1: target registry.
 * Validates mutation patches by target type and assigns risk level from evolution_targets.
 */

import type { DbClient } from "../db.js";
import type { PatchValidation, RiskLevelEvolution, EvolutionTargetRow } from "./types.js";

const DEPLOY_REPAIR_TARGET_TYPES = new Set([
  "repair_recipe_order",
  "classifier_threshold",
  "retry_backoff_profile",
  "canary_policy",
  "validator_threshold",
]);

/**
 * Map evolution_targets.mutability_level to risk_level for proposals.
 * low -> low, medium -> medium, high -> high, locked -> reject.
 */
export function riskLevelFromMutability(mutability: string): RiskLevelEvolution | "reject" {
  switch (mutability) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "locked":
      return "reject";
    default:
      return "medium";
  }
}

/**
 * Validate patch shape for deploy_repair target types (bounded mutation only).
 * V1: no code/schema/policy-boundary mutation; only recipe order, thresholds, weights, backoff.
 */
function validateDeployRepairPatch(
  targetType: string,
  targetId: string,
  patch: Record<string, unknown>
): { valid: boolean; error?: string } {
  if (!DEPLOY_REPAIR_TARGET_TYPES.has(targetType)) {
    return { valid: false, error: `Unknown deploy_repair target_type: ${targetType}` };
  }
  if (typeof patch !== "object" || patch === null) {
    return { valid: false, error: "patch must be an object" };
  }
  switch (targetType) {
    case "repair_recipe_order":
      if (!Array.isArray(patch.recipe_ids) && !Array.isArray(patch.order)) {
        return { valid: false, error: "repair_recipe_order patch must have recipe_ids or order array" };
      }
      break;
    case "classifier_threshold":
      if (typeof patch.threshold !== "number" && typeof patch.confidence_min !== "number") {
        return { valid: false, error: "classifier_threshold patch must have threshold or confidence_min number" };
      }
      break;
    case "retry_backoff_profile":
      if (!Array.isArray(patch.delays_ms) && typeof patch.multiplier !== "number") {
        return { valid: false, error: "retry_backoff_profile patch must have delays_ms array or multiplier" };
      }
      break;
    case "canary_policy":
    case "validator_threshold":
      if (typeof patch.value !== "number" && typeof patch.percent !== "number" && typeof patch.enabled !== "boolean") {
        return { valid: false, error: `${targetType} patch must have value, percent, or enabled` };
      }
      break;
    default:
      return { valid: false, error: `Unsupported target_type: ${targetType}` };
  }
  return { valid: true };
}

/**
 * Load evolution target by (domain, target_type, target_id). Returns null if not found or inactive.
 */
export async function getEvolutionTarget(
  db: DbClient,
  domain: string,
  targetType: string,
  targetId: string
): Promise<EvolutionTargetRow | null> {
  const r = await db.query<EvolutionTargetRow>(
    `SELECT id, domain, target_type, target_id, mutability_level, owner_module, config_ref, is_active, created_at
     FROM evolution_targets
     WHERE domain = $1 AND target_type = $2 AND target_id = $3 AND is_active = true`,
    [domain, targetType, targetId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    config_ref: (row.config_ref as Record<string, unknown>) ?? {},
    created_at: new Date(row.created_at),
  };
}

/**
 * Validate patch for the given (domain, target_type, target_id) and return validation + risk level.
 * If target is locked or missing, returns valid: false.
 */
export async function validatePatch(
  db: DbClient,
  domain: string,
  targetType: string,
  targetId: string,
  patch: Record<string, unknown>
): Promise<PatchValidation> {
  const target = await getEvolutionTarget(db, domain, targetType, targetId);
  if (!target) {
    return { valid: false, risk_level: "medium", error: "Evolution target not found or inactive" };
  }
  const riskFromMutability = riskLevelFromMutability(target.mutability_level);
  if (riskFromMutability === "reject") {
    return { valid: false, risk_level: "high", error: "Target is locked; no mutations allowed" };
  }
  if (domain === "deploy_repair") {
    const shape = validateDeployRepairPatch(targetType, targetId, patch);
    if (!shape.valid) {
      return { valid: false, risk_level: riskFromMutability, error: shape.error };
    }
  }
  return { valid: true, risk_level: riskFromMutability };
}

/**
 * List active evolution targets (e.g. for GET /v1/evolution/targets).
 */
export async function listEvolutionTargets(
  db: DbClient,
  domain?: string
): Promise<EvolutionTargetRow[]> {
  const q = domain
    ? `SELECT id, domain, target_type, target_id, mutability_level, owner_module, config_ref, is_active, created_at
       FROM evolution_targets WHERE is_active = true AND domain = $1 ORDER BY domain, target_type, target_id`
    : `SELECT id, domain, target_type, target_id, mutability_level, owner_module, config_ref, is_active, created_at
       FROM evolution_targets WHERE is_active = true ORDER BY domain, target_type, target_id`;
  const r = await db.query<EvolutionTargetRow & { created_at: string }>(
    domain ? q : q.replace(" AND domain = $1", ""),
    domain ? [domain] : []
  );
  return r.rows.map((row) => ({
    ...row,
    config_ref: (row.config_ref as Record<string, unknown>) ?? {},
    created_at: new Date(row.created_at),
  }));
}
