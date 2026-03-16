/**
 * Evolution Loop V1 types.
 * Bounded self-improvement for deploy_repair: mutation proposals, experiments, fitness, promotion.
 */

export const EVOLUTION_DOMAIN_DEPLOY_REPAIR = "deploy_repair" as const;
export type EvolutionDomain = typeof EVOLUTION_DOMAIN_DEPLOY_REPAIR;

export type MutationProposalStatus =
  | "draft"
  | "queued"
  | "approved_for_test"
  | "testing"
  | "accepted"
  | "rejected"
  | "retired"
  | "superseded";

export type TrafficStrategy = "replay" | "shadow" | "canary" | "sampled_live";

export type ExperimentRunStatus = "queued" | "running" | "completed" | "aborted" | "failed";

export type ExperimentOutcome = "win" | "loss" | "inconclusive";

export type PromotionDecision =
  | "promote"
  | "reject"
  | "retry_test"
  | "sandbox_only"
  | "human_review";

export type RiskLevelEvolution = "low" | "medium" | "high";

export type MutabilityLevel = "low" | "medium" | "high" | "locked";

export type MetricDirection = "higher_is_better" | "lower_is_better" | "target_band";

export interface EvolutionTargetRow {
  id: string;
  domain: string;
  target_type: string;
  target_id: string;
  mutability_level: MutabilityLevel;
  owner_module: string;
  config_ref: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
}

export interface MutationProposalRow {
  id: string;
  domain: string;
  target_type: string;
  target_id: string;
  mutation_kind: string;
  patch: Record<string, unknown>;
  baseline_snapshot: Record<string, unknown>;
  hypothesis: string | null;
  proposed_by: string;
  source_run_id: string | null;
  source_job_run_id: string | null;
  source_event_id: number | null;
  risk_level: RiskLevelEvolution;
  status: MutationProposalStatus;
  dedupe_key: string | null;
  rationale: Record<string, unknown>;
  tags: unknown[];
  created_at: Date;
  updated_at: Date;
  approved_at: Date | null;
  retired_at: Date | null;
}

export interface ExperimentRunRow {
  id: string;
  mutation_proposal_id: string;
  domain: string;
  baseline_ref: Record<string, unknown>;
  candidate_ref: Record<string, unknown>;
  traffic_strategy: TrafficStrategy;
  traffic_percent: number | null;
  sample_size: number | null;
  cohort_key: string | null;
  cohort_filters: Record<string, unknown>;
  status: ExperimentRunStatus;
  outcome: ExperimentOutcome | null;
  started_at: Date | null;
  ended_at: Date | null;
  notes: string | null;
  created_at: Date;
}

export interface FitnessScoreRow {
  id: string;
  experiment_run_id: string;
  metric_name: string;
  metric_value: number;
  metric_direction: MetricDirection;
  weight: number;
  cohort_key: string | null;
  sample_count: number | null;
  metric_meta: Record<string, unknown>;
  recorded_at: Date;
}

export interface PromotionDecisionRow {
  id: string;
  mutation_proposal_id: string;
  experiment_run_id: string;
  decision: PromotionDecision;
  decided_by: string;
  reason: Record<string, unknown>;
  promoted_ref: Record<string, unknown> | null;
  decided_at: Date;
}

/** Patch validation result from target registry */
export interface PatchValidation {
  valid: boolean;
  risk_level: RiskLevelEvolution;
  error?: string;
}
