/**
 * Evolution Loop V1: experiment orchestrator.
 * Create experiment runs (replay/shadow/canary), enqueue via status=queued for runner poll.
 */

import type { DbClient } from "../db.js";
import type { ExperimentRunRow, TrafficStrategy } from "./types.js";
import { getMutationProposal } from "./mutation-manager.js";

export interface CreateExperimentRunParams {
  mutation_proposal_id: string;
  domain: string;
  baseline_ref: Record<string, unknown>;
  candidate_ref: Record<string, unknown>;
  traffic_strategy: TrafficStrategy;
  traffic_percent?: number | null;
  sample_size?: number | null;
  cohort_key?: string | null;
  cohort_filters?: Record<string, unknown>;
}

/**
 * Create an experiment run and set status to 'queued'.
 * Runner polls experiment_runs WHERE status = 'queued' and processes them (evolution_replay handler).
 */
export async function createExperimentRun(
  db: DbClient,
  params: CreateExperimentRunParams
): Promise<ExperimentRunRow> {
  const proposal = await getMutationProposal(db, params.mutation_proposal_id);
  if (!proposal) throw new Error("Mutation proposal not found");
  if (proposal.domain !== params.domain) throw new Error("Domain mismatch with proposal");

  const id = crypto.randomUUID();
  const cohort_filters = params.cohort_filters ?? {};
  await db.query(
    `INSERT INTO experiment_runs (
      id, mutation_proposal_id, domain, baseline_ref, candidate_ref,
      traffic_strategy, traffic_percent, sample_size, cohort_key, cohort_filters, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued')`,
    [
      id,
      params.mutation_proposal_id,
      params.domain,
      JSON.stringify(params.baseline_ref),
      JSON.stringify(params.candidate_ref),
      params.traffic_strategy,
      params.traffic_percent ?? null,
      params.sample_size ?? null,
      params.cohort_key ?? null,
      JSON.stringify(cohort_filters),
    ]
  );
  const r = await db.query<ExperimentRunRow & { started_at: string | null; ended_at: string | null; notes: string | null }>(
    `SELECT * FROM experiment_runs WHERE id = $1`,
    [id]
  );
  return mapExperimentRow(r.rows[0]);
}

function mapExperimentRow(
  row: (ExperimentRunRow & { started_at: string | null; ended_at: string | null; notes: string | null }) | undefined
): ExperimentRunRow {
  if (!row) throw new Error("Experiment run not found");
  return {
    ...row,
    baseline_ref: (row.baseline_ref as Record<string, unknown>) ?? {},
    candidate_ref: (row.candidate_ref as Record<string, unknown>) ?? {},
    cohort_filters: (row.cohort_filters as Record<string, unknown>) ?? {},
    started_at: row.started_at ? new Date(row.started_at) : null,
    ended_at: row.ended_at ? new Date(row.ended_at) : null,
    notes: row.notes ?? null,
    created_at: new Date(row.created_at),
  };
}

export async function getExperimentRun(db: DbClient, id: string): Promise<ExperimentRunRow | null> {
  const r = await db.query<ExperimentRunRow & { started_at: string | null; ended_at: string | null; notes: string | null }>(
    `SELECT * FROM experiment_runs WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  return mapExperimentRow(r.rows[0]);
}

export async function listExperimentRuns(
  db: DbClient,
  opts: { mutation_proposal_id?: string; domain?: string; status?: string; limit?: number; offset?: number }
): Promise<ExperimentRunRow[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (opts.mutation_proposal_id) {
    conditions.push(`mutation_proposal_id = $${idx++}`);
    params.push(opts.mutation_proposal_id);
  }
  if (opts.domain) {
    conditions.push(`domain = $${idx++}`);
    params.push(opts.domain);
  }
  if (opts.status) {
    conditions.push(`status = $${idx++}`);
    params.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);
  const r = await db.query<ExperimentRunRow & { started_at: string | null; ended_at: string | null; notes: string | null }>(
    `SELECT * FROM experiment_runs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return r.rows.map(mapExperimentRow);
}
