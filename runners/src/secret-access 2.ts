/**
 * Record secret access for audit (Plan 12B.4). Call when the runner resolves or uses a secret.
 * Table: secret_access_events (secret_ref_id, environment, job_run_id, tool_call_id?, worker_id, accessed_at).
 */

import type pg from "pg";

export interface RecordSecretAccessParams {
  client: pg.PoolClient;
  secret_ref_id: string;
  environment: string;
  job_run_id: string;
  tool_call_id?: string | null;
  worker_id: string;
}

export async function recordSecretAccess(params: RecordSecretAccessParams): Promise<void> {
  const { client, secret_ref_id, environment, job_run_id, tool_call_id, worker_id } = params;
  try {
    await client.query(
      `INSERT INTO secret_access_events (secret_ref_id, environment, job_run_id, tool_call_id, worker_id)
       VALUES ($1, $2::environment_type, $3, $4, $5)`,
      [secret_ref_id, environment, job_run_id, tool_call_id ?? null, worker_id]
    );
  } catch {
    // secret_access_events or environment_type may not exist in older DBs
  }
}

/**
 * Record access by secret name and scope (looks up secret_ref_id). Use when env-based secret is used.
 */
export async function recordSecretAccessByName(
  client: pg.PoolClient,
  name: string,
  scope: string,
  job_run_id: string,
  worker_id: string,
  tool_call_id?: string | null
): Promise<void> {
  try {
    const r = await client.query<{ id: string }>(
      "SELECT id FROM secret_refs WHERE name = $1 AND scope = $2::environment_type LIMIT 1",
      [name, scope]
    );
    if (r.rows.length === 0) return;
    await recordSecretAccess({
      client,
      secret_ref_id: r.rows[0].id,
      environment: scope,
      job_run_id,
      tool_call_id,
      worker_id,
    });
  } catch {
    // ignore
  }
}
