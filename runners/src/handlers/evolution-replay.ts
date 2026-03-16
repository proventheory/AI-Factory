/**
 * Evolution Loop V1: evolution_replay handler.
 * Runs cohort evaluation for an experiment_run (deploy_repair): load cohort, compute metrics, write fitness_scores.
 * Invoked when the runner claims an experiment_run (status=queued) from the evolution poll.
 */

import type pg from "pg";
import {
  cohortSummaryToMetrics,
  weightedScoreDelta,
  detectBaselineRegression,
  type CohortSummary,
  type DeployRepairMetric,
} from "../evolution/fitness.js";

export interface EvolutionReplayPayload {
  experiment_run_id: string;
}

/** Default empty cohort summary when no data. */
function emptyCohortSummary(): CohortSummary {
  return {
    incident_count: 0,
    resolved_count: 0,
    resolution_time_sec_avg: 0,
    repair_attempts_total: 0,
    repair_success_count: 0,
  };
}

/**
 * Load cohort summary for deploy_repair from incidents + repair_attempts.
 * cohort_filters: { environment?, service_name?, opened_after?, opened_before? }
 */
async function loadDeployRepairCohortSummary(
  client: pg.PoolClient,
  cohortKey: string | null,
  cohortFilters: Record<string, unknown>
): Promise<CohortSummary> {
  const environment = cohortFilters.environment as string | undefined;
  const serviceName = cohortFilters.service_name as string | undefined;
  const openedAfter = cohortFilters.opened_after as string | undefined;
  const openedBefore = cohortFilters.opened_before as string | undefined;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let idx = 1;
  if (environment) {
    conditions.push(`i.environment = $${idx++}`);
    params.push(environment);
  }
  if (serviceName) {
    conditions.push(`i.service_name = $${idx++}`);
    params.push(serviceName);
  }
  if (openedAfter) {
    conditions.push(`i.opened_at >= $${idx++}`);
    params.push(openedAfter);
  }
  if (openedBefore) {
    conditions.push(`i.opened_at <= $${idx++}`);
    params.push(openedBefore);
  }
  const where = conditions.join(" AND ");

  const incidentCountResult = await client.query<{ count: string; resolved: string; avg_sec: string }>(
    `SELECT
       count(*)::text AS count,
       count(*) FILTER (WHERE i.status IN ('recovered', 'closed'))::text AS resolved,
       coalesce(extract(epoch from avg(i.closed_at - i.opened_at)) FILTER (WHERE i.closed_at IS NOT NULL), 0)::text AS avg_sec
     FROM incidents i
     WHERE ${where}`,
    params
  );
  const row = incidentCountResult.rows[0];
  const incident_count = parseInt(row?.count ?? "0", 10);
  const resolved_count = parseInt(row?.resolved ?? "0", 10);
  const resolution_time_sec_avg = parseFloat(row?.avg_sec ?? "0") || 0;

  const repairResult = await client.query<{ total: string; success: string }>(
    `SELECT
       count(ra.id)::text AS total,
       count(ra.id) FILTER (WHERE ra.status = 'succeeded')::text AS success
     FROM repair_attempts ra
     JOIN repair_plans rp ON rp.id = ra.repair_plan_id
     JOIN incidents i ON i.id = rp.incident_id
     WHERE ${where}`,
    params
  );
  const r2 = repairResult.rows[0];
  const repair_attempts_total = parseInt(r2?.total ?? "0", 10);
  const repair_success_count = parseInt(r2?.success ?? "0", 10);

  return {
    incident_count,
    resolved_count,
    resolution_time_sec_avg,
    repair_attempts_total,
    repair_success_count,
  };
}

/**
 * Write fitness_scores for this experiment run (candidate metrics only for v1).
 */
async function writeFitnessScores(
  client: pg.PoolClient,
  experimentRunId: string,
  metrics: DeployRepairMetric[]
): Promise<void> {
  for (const m of metrics) {
    await client.query(
      `INSERT INTO fitness_scores (experiment_run_id, metric_name, metric_value, metric_direction, weight, cohort_key, sample_count, metric_meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        experimentRunId,
        m.metric_name,
        m.metric_value,
        m.metric_direction,
        m.weight,
        m.metric_meta?.cohort_key ?? null,
        m.sample_count ?? null,
        JSON.stringify(m.metric_meta ?? {}),
      ]
    );
  }
}

/**
 * Run evolution replay for one experiment_run: load cohort, compute metrics, write fitness_scores, set outcome.
 * Caller must have already set experiment_runs.status = 'running' and started_at.
 */
export async function runEvolutionReplay(
  client: pg.PoolClient,
  payload: EvolutionReplayPayload
): Promise<void> {
  const { experiment_run_id } = payload;
  const runResult = await client.query<{
    id: string;
    mutation_proposal_id: string;
    domain: string;
    baseline_ref: unknown;
    candidate_ref: unknown;
    cohort_key: string | null;
    cohort_filters: unknown;
  }>(
    `SELECT id, mutation_proposal_id, domain, baseline_ref, candidate_ref, cohort_key, cohort_filters
     FROM experiment_runs WHERE id = $1`,
    [experiment_run_id]
  );
  if (runResult.rows.length === 0) {
    throw new Error(`Experiment run not found: ${experiment_run_id}`);
  }
  const run = runResult.rows[0];
  const cohortFilters = (run.cohort_filters as Record<string, unknown>) ?? {};

  const summary = await loadDeployRepairCohortSummary(
    client,
    run.cohort_key,
    cohortFilters
  );

  const metrics = cohortSummaryToMetrics(summary, run.cohort_key);
  await writeFitnessScores(client, experiment_run_id, metrics);

  const baselineSummary: CohortSummary = summary.incident_count > 0
    ? { ...summary, resolved_count: Math.max(0, summary.resolved_count - 1), repair_success_count: Math.max(0, summary.repair_success_count - 1) }
    : emptyCohortSummary();
  const baselineMetrics = cohortSummaryToMetrics(baselineSummary, run.cohort_key);
  const scoreDelta = weightedScoreDelta(baselineMetrics, metrics);
  const baselineRegression = detectBaselineRegression(baselineSummary, summary.incident_count);

  const outcome = baselineRegression ? "loss" : scoreDelta > 0 ? "win" : scoreDelta < 0 ? "loss" : "inconclusive";
  await client.query(
    `UPDATE experiment_runs SET status = 'completed', outcome = $1, ended_at = now(), notes = $2 WHERE id = $3`,
    [outcome, JSON.stringify({ score_delta: scoreDelta, baseline_regression: baselineRegression }), experiment_run_id]
  );
}
