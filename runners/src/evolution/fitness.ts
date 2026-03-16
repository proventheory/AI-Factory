/**
 * Evolution Loop V1: deploy-repair fitness scoring.
 * Compare baseline vs candidate on the same cohort; higher resolution success and lower resolution time = better.
 */

export type MetricDirection = "higher_is_better" | "lower_is_better";

export interface DeployRepairMetric {
  metric_name: string;
  metric_value: number;
  metric_direction: MetricDirection;
  weight: number;
  sample_count?: number;
  metric_meta?: Record<string, unknown>;
}

/**
 * Cohort summary for deploy_repair (from incidents + repair_attempts or replay results).
 */
export interface CohortSummary {
  incident_count: number;
  resolved_count: number;
  resolution_time_sec_avg: number;
  repair_attempts_total: number;
  repair_success_count: number;
}

/**
 * Compute deploy-repair fitness metrics from a cohort summary.
 * higher_is_better: resolved_count, repair_success_count.
 * lower_is_better: resolution_time_sec_avg, repair_attempts_total (fewer attempts = more efficient).
 */
export function cohortSummaryToMetrics(
  summary: CohortSummary,
  cohortKey: string | null
): DeployRepairMetric[] {
  const metrics: DeployRepairMetric[] = [];
  metrics.push({
    metric_name: "resolved_count",
    metric_value: summary.resolved_count,
    metric_direction: "higher_is_better",
    weight: 1,
    sample_count: summary.incident_count,
    metric_meta: { cohort_key: cohortKey },
  });
  metrics.push({
    metric_name: "repair_success_count",
    metric_value: summary.repair_success_count,
    metric_direction: "higher_is_better",
    weight: 1,
    sample_count: summary.incident_count,
    metric_meta: { cohort_key: cohortKey },
  });
  metrics.push({
    metric_name: "resolution_time_sec_avg",
    metric_value: summary.resolution_time_sec_avg,
    metric_direction: "lower_is_better",
    weight: 0.001, // scale so it doesn't dominate
    sample_count: summary.incident_count,
    metric_meta: { cohort_key: cohortKey },
  });
  metrics.push({
    metric_name: "repair_attempts_total",
    metric_value: summary.repair_attempts_total,
    metric_direction: "lower_is_better",
    weight: 0.1,
    sample_count: summary.incident_count,
    metric_meta: { cohort_key: cohortKey },
  });
  return metrics;
}

/**
 * Weighted score proxy for deploy_repair (same formula as v_experiment_score_summary).
 * Positive = candidate better than baseline.
 */
export function weightedScoreDelta(
  baselineMetrics: DeployRepairMetric[],
  candidateMetrics: DeployRepairMetric[]
): number {
  const score = (metrics: DeployRepairMetric[]) =>
    metrics.reduce((sum, m) => {
      const v = m.metric_value * m.weight;
      return sum + (m.metric_direction === "higher_is_better" ? v : -v);
    }, 0);
  return score(candidateMetrics) - score(baselineMetrics);
}

/**
 * Whether baseline regressed (e.g. baseline had fewer resolutions than expected).
 * V1: baseline_regression if baseline resolved_count is 0 and we had incidents.
 */
export function detectBaselineRegression(
  baselineSummary: CohortSummary,
  incidentCount: number
): boolean {
  if (incidentCount === 0) return false;
  return baselineSummary.resolved_count === 0 && baselineSummary.incident_count > 0;
}
