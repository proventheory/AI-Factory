/**
 * Evolution Loop V1: claim experiment_runs (status=queued) for the runner.
 * One worker claims a row, sets status=running and started_at, then the handler runs.
 */

import type pg from "pg";

export interface ClaimedExperimentRun {
  id: string;
  mutation_proposal_id: string;
  domain: string;
  traffic_strategy: string;
  cohort_key: string | null;
  cohort_filters: Record<string, unknown>;
}

/**
 * Claim one queued experiment run (FOR UPDATE SKIP LOCKED), set status=running, started_at=now().
 * Returns null if none available.
 */
export async function claimExperimentRun(
  client: pg.PoolClient,
  workerId: string
): Promise<ClaimedExperimentRun | null> {
  const r = await client.query<{
    id: string;
    mutation_proposal_id: string;
    domain: string;
    traffic_strategy: string;
    cohort_key: string | null;
    cohort_filters: unknown;
  }>(
    `SELECT id, mutation_proposal_id, domain, traffic_strategy, cohort_key, cohort_filters
     FROM experiment_runs
     WHERE status = 'queued'
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT 1`
  );
  if (r.rows.length === 0) return null;

  const row = r.rows[0];
  await client.query(
    `UPDATE experiment_runs SET status = 'running', started_at = now() WHERE id = $1`,
    [row.id]
  );
  return {
    id: row.id,
    mutation_proposal_id: row.mutation_proposal_id,
    domain: row.domain,
    traffic_strategy: row.traffic_strategy,
    cohort_key: row.cohort_key,
    cohort_filters: (row.cohort_filters as Record<string, unknown>) ?? {},
  };
}
