/**
 * Minimal stub for plan-compiler: job type and edge condition validation.
 * Full implementation uses action_registry / handler registry when available.
 */

const VALID_EDGE_CONDITIONS = new Set(["success", "failure"]);

export function isKnownJobType(_jobType: string): boolean {
  return true;
}

export function isValidEdgeCondition(condition: string): boolean {
  return VALID_EDGE_CONDITIONS.has(condition);
}
