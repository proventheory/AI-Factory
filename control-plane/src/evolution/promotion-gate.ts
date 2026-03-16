/**
 * Evolution Loop V1: promotion gate.
 * Evaluate deploy-repair promotion rules and write promotion_decisions.
 */

import type { DbClient } from "../db.js";
import type { PromotionDecision, PromotionDecisionRow } from "./types.js";

export interface PromotionGateInput {
  mutation_proposal_id: string;
  experiment_run_id: string;
  /** Weighted score delta (candidate - baseline); higher is better for deploy_repair. */
  score_delta: number;
  /** Whether baseline had any regression (e.g. more failures). */
  baseline_regression: boolean;
  /** Metric counts used for gate (e.g. resolution_time_sec, repair_success_count). */
  metric_summary: Record<string, number>;
}

/**
 * Deploy-repair promotion rules (V1):
 * - promote: score_delta > 0, no baseline regression, low/medium risk.
 * - reject: score_delta <= 0 or baseline_regression.
 * - human_review: high risk or edge cases.
 */
export function evaluatePromotionDecision(input: PromotionGateInput): {
  decision: PromotionDecision;
  reason: Record<string, unknown>;
} {
  if (input.baseline_regression) {
    return {
      decision: "reject",
      reason: { rule: "baseline_regression", message: "Baseline regressed; do not promote." },
    };
  }
  if (input.score_delta <= 0) {
    return {
      decision: "reject",
      reason: { rule: "no_improvement", score_delta: input.score_delta, message: "No fitness improvement." },
    };
  }
  return {
    decision: "promote",
    reason: { rule: "improvement", score_delta: input.score_delta, metric_summary: input.metric_summary },
  };
}

export interface RecordPromotionDecisionParams {
  mutation_proposal_id: string;
  experiment_run_id: string;
  decision: PromotionDecision;
  decided_by: string;
  reason?: Record<string, unknown>;
  promoted_ref?: Record<string, unknown> | null;
}

export async function recordPromotionDecision(
  db: DbClient,
  params: RecordPromotionDecisionParams
): Promise<PromotionDecisionRow> {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO promotion_decisions (
      id, mutation_proposal_id, experiment_run_id, decision, decided_by, reason, promoted_ref
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      params.mutation_proposal_id,
      params.experiment_run_id,
      params.decision,
      params.decided_by,
      JSON.stringify(params.reason ?? {}),
      params.promoted_ref ? JSON.stringify(params.promoted_ref) : null,
    ]
  );
  const r = await db.query<PromotionDecisionRow & { decided_at: string }>(
    `SELECT * FROM promotion_decisions WHERE id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) throw new Error("Failed to read promotion decision");
  return {
    ...row,
    reason: (row.reason as Record<string, unknown>) ?? {},
    promoted_ref: row.promoted_ref != null ? (row.promoted_ref as Record<string, unknown>) : null,
    decided_at: new Date(row.decided_at),
  };
}

/**
 * Decide and record in one step (e.g. from API POST experiments/:id/decide).
 */
export async function evaluateAndRecordPromotion(
  db: DbClient,
  experimentRunId: string,
  decidedBy: string,
  gateInput: PromotionGateInput
): Promise<PromotionDecisionRow> {
  const { decision, reason } = evaluatePromotionDecision(gateInput);
  return recordPromotionDecision(db, {
    mutation_proposal_id: gateInput.mutation_proposal_id,
    experiment_run_id: experimentRunId,
    decision,
    decided_by: decidedBy,
    reason,
    promoted_ref: decision === "promote" ? gateInput.metric_summary : null,
  });
}
