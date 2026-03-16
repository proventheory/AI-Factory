/**
 * Evolution Loop V1: mutation manager.
 * Create and upsert mutation proposals; status transitions.
 */

import type { DbClient } from "../db.js";
import type { MutationProposalRow, MutationProposalStatus } from "./types.js";
import { validatePatch } from "./target-registry.js";

export interface CreateMutationProposalParams {
  domain: string;
  target_type: string;
  target_id: string;
  mutation_kind: string;
  patch: Record<string, unknown>;
  baseline_snapshot?: Record<string, unknown>;
  hypothesis?: string | null;
  proposed_by: string;
  source_run_id?: string | null;
  source_job_run_id?: string | null;
  source_event_id?: number | null;
  dedupe_key?: string | null;
  rationale?: Record<string, unknown>;
  tags?: unknown[];
}

/**
 * Create a mutation proposal. Validates patch via target-registry and sets risk_level.
 * Uses ON CONFLICT (dedupe_key) DO UPDATE SET updated_at = now() when dedupe_key is provided.
 */
export async function createMutationProposal(
  db: DbClient,
  params: CreateMutationProposalParams
): Promise<MutationProposalRow> {
  const validation = await validatePatch(db, params.domain, params.target_type, params.target_id, params.patch);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid patch");
  }
  const baseline_snapshot = params.baseline_snapshot ?? {};
  const rationale = params.rationale ?? {};
  const tags = params.tags ?? [];
  const id = crypto.randomUUID();

  if (params.dedupe_key) {
    const upserted = await db.query<MutationProposalRow & { updated_at: string }>(
      `INSERT INTO mutation_proposals (
        id, domain, target_type, target_id, mutation_kind, patch, baseline_snapshot,
        hypothesis, proposed_by, source_run_id, source_job_run_id, source_event_id,
        risk_level, status, dedupe_key, rationale, tags
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', $14, $15, $16
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
      DO UPDATE SET
        patch = EXCLUDED.patch,
        baseline_snapshot = EXCLUDED.baseline_snapshot,
        hypothesis = EXCLUDED.hypothesis,
        rationale = EXCLUDED.rationale,
        tags = EXCLUDED.tags,
        updated_at = now()
      RETURNING *`,
      [
        id, params.domain, params.target_type, params.target_id, params.mutation_kind,
        JSON.stringify(params.patch), JSON.stringify(baseline_snapshot), params.hypothesis ?? null,
        params.proposed_by, params.source_run_id ?? null, params.source_job_run_id ?? null,
        params.source_event_id ?? null, validation.risk_level, params.dedupe_key,
        JSON.stringify(rationale), JSON.stringify(tags),
      ]
    );
    const row = upserted.rows[0];
    if (!row) throw new Error("Upsert failed");
    return mapMutationRow(row);
  }

  await db.query(
    `INSERT INTO mutation_proposals (
      id, domain, target_type, target_id, mutation_kind, patch, baseline_snapshot,
      hypothesis, proposed_by, source_run_id, source_job_run_id, source_event_id,
      risk_level, status, dedupe_key, rationale, tags
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', $14, $15, $16)`,
    [
      id, params.domain, params.target_type, params.target_id, params.mutation_kind,
      JSON.stringify(params.patch), JSON.stringify(baseline_snapshot), params.hypothesis ?? null,
      params.proposed_by, params.source_run_id ?? null, params.source_job_run_id ?? null,
      params.source_event_id ?? null, validation.risk_level, params.dedupe_key ?? null,
      JSON.stringify(rationale), JSON.stringify(tags),
    ]
  );
  const created = await db.query<MutationProposalRow & { updated_at: string }>(
    `SELECT * FROM mutation_proposals WHERE id = $1`,
    [id]
  );
  return mapMutationRow(created.rows[0]);
}

function mapMutationRow(row: (MutationProposalRow & { updated_at: string }) | undefined): MutationProposalRow {
  if (!row) throw new Error("Mutation proposal not found");
  return {
    ...row,
    patch: (row.patch as Record<string, unknown>) ?? {},
    baseline_snapshot: (row.baseline_snapshot as Record<string, unknown>) ?? {},
    rationale: (row.rationale as Record<string, unknown>) ?? {},
    tags: Array.isArray(row.tags) ? row.tags : [],
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    approved_at: row.approved_at ? new Date(row.approved_at) : null,
    retired_at: row.retired_at ? new Date(row.retired_at) : null,
  };
}

export async function getMutationProposal(db: DbClient, id: string): Promise<MutationProposalRow | null> {
  const r = await db.query<MutationProposalRow & { updated_at: string }>(
    `SELECT * FROM mutation_proposals WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  return mapMutationRow(r.rows[0]);
}

export async function listMutationProposals(
  db: DbClient,
  opts: { domain?: string; status?: MutationProposalStatus; limit?: number; offset?: number }
): Promise<MutationProposalRow[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
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
  const r = await db.query<MutationProposalRow & { updated_at: string }>(
    `SELECT * FROM mutation_proposals ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return r.rows.map(mapMutationRow);
}

export async function updateMutationProposalStatus(
  db: DbClient,
  id: string,
  status: MutationProposalStatus,
  approved_at?: Date | null
): Promise<boolean> {
  const r = await db.query(
    `UPDATE mutation_proposals SET status = $1, updated_at = now(), approved_at = COALESCE($2, approved_at) WHERE id = $3 RETURNING id`,
    [status, approved_at ?? null, id]
  );
  return r.rowCount !== null && r.rowCount > 0;
}
