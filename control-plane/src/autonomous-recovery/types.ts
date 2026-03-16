/**
 * Types for the autonomous incident-response and release-recovery subsystem.
 * See implementation spec: incidents → evidence → classify → plan → execute → verify.
 */

export type IncidentStatus =
  | "detected"
  | "collecting_evidence"
  | "classified"
  | "repair_planned"
  | "repair_running"
  | "candidate_verifying"
  | "recovered"
  | "rolled_back"
  | "quarantined"
  | "escalated"
  | "closed";

export type FailurePhase = "build" | "boot" | "migrate" | "healthcheck" | "runtime" | "unknown";

export type EvidenceType =
  | "deploy_log"
  | "startup_log"
  | "migration_log"
  | "healthcheck_result"
  | "release_diff"
  | "env_snapshot"
  | "schema_snapshot"
  | "service_status"
  | "stack_trace"
  | "tool_output"
  | "historical_incident";

export type RepairStrategyType =
  | "retry"
  | "restart"
  | "rollback"
  | "config_fix"
  | "branch_patch"
  | "schema_guard_patch"
  | "migration_reorder_patch"
  | "quarantine"
  | "escalate"
  | "rollback_then_branch_patch";

export type RepairActionType =
  | "redeploy"
  | "restart"
  | "rollback"
  | "pause_retries"
  | "fetch_schema"
  | "generate_patch"
  | "create_branch"
  | "commit_patch"
  | "run_tests"
  | "run_shadow_migration"
  | "deploy_candidate"
  | "verify_candidate"
  | "promote_candidate"
  | "mark_quarantined";

export interface IncidentRow {
  id: string;
  service_name: string;
  environment: string;
  release_id: string | null;
  deploy_id: string | null;
  status: IncidentStatus;
  failure_phase: FailurePhase;
  opened_at: Date;
  updated_at: Date;
  closed_at: Date | null;
  first_failure_at: Date;
  last_failure_at: Date;
  retry_count: number;
  deterministic_failure: boolean | null;
  confidence: number | null;
  root_cause_summary: string | null;
  current_signature_id: string | null;
  last_healthy_release_id: string | null;
  current_bad_release_id: string | null;
  quarantine_reason: string | null;
  escalated_reason: string | null;
  metadata: Record<string, unknown>;
}

/** Rule/LLM signature match for an incident. */
export interface SignatureMatch {
  signatureId: string;
  signatureKey: string;
  confidence: number;
  matchedBy: "rule" | "llm" | "hybrid";
  rationale: string;
  phase: FailurePhase;
  className: string;
  subclass: string | null;
}

/** Evidence bundle passed to classifier (and optionally LLM). */
export interface EvidenceBundle {
  incidentId: string;
  logs: string[];
  migrationLogs: string[];
  startupLogs: string[];
  deployLogs: string[];
  diffSummary?: string;
  schemaSnapshot?: Record<string, unknown>;
  envSnapshot?: Record<string, unknown>;
}

/** Planner output: retry, rollback_then_branch_patch, quarantine, or escalate. */
export type RepairDecision =
  | { strategy: "retry"; recipeKey: string; suppressRetries: boolean; confidence: number; rationale: string }
  | { strategy: "rollback_then_branch_patch"; recipeKey: string; suppressRetries: boolean; confidence: number; rationale: string }
  | { strategy: "quarantine"; recipeKey: string; suppressRetries: boolean; confidence: number; rationale: string }
  | { strategy: "escalate"; recipeKey: string; suppressRetries: boolean; confidence: number; rationale: string };

/** Legacy simple shape (used by repair-planner chooseRepairPlan). */
export interface RepairDecisionLegacy {
  strategy: "rollback_then_branch_patch" | "quarantine_then_branch_patch" | "restart_or_redeploy" | "quarantine_or_escalate";
  suppressRetries: boolean;
  confidence: number;
}
