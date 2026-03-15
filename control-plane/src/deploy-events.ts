import { v4 as uuid } from "uuid";
import type { Pool } from "pg";

export type DeployEventPayload = {
  status?: string;
  service_id?: string;
  commit_sha?: string;
  build_log_text?: string;
  external_deploy_id?: string;
};

export type DeployEventResult = {
  deploy_id: string;
  change_event_id?: string | null;
  service_id?: string | null;
  commit_sha?: string | null;
  status: string;
  failure_class?: string | null;
  error_signature?: string | null;
  created_at: string;
};

/** Create a deploy_events row from webhook/API payload. Optionally creates change_event; does not classify from build_log (no failure-classifier dependency). */
export async function createDeployEventFromPayload(
  pool: Pool,
  body: DeployEventPayload
): Promise<DeployEventResult> {
  const deployId = uuid();
  const status = body.status ?? "unknown";
  const serviceId = body.service_id ?? null;
  const commitSha = body.commit_sha ?? null;
  const externalDeployId = body.external_deploy_id ?? null;
  let changeEventId: string | null = null;

  if (body.build_log_text && (status === "failed" || status === "failure")) {
    try {
      const r = await pool.query(
        "INSERT INTO change_events (source_type, change_class, summary) VALUES ($1, $2, $3) RETURNING change_event_id",
        ["deploy", "build", (body.build_log_text as string).slice(0, 500)]
      );
      changeEventId = r.rows[0]?.change_event_id ?? null;
    } catch {
      // change_events may not exist
    }
  }

  await pool.query(
    `INSERT INTO deploy_events (deploy_id, change_event_id, service_id, commit_sha, status, external_deploy_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [deployId, changeEventId, serviceId, commitSha, status, externalDeployId]
  );

  const created = await pool.query(
    "SELECT deploy_id, change_event_id, service_id, commit_sha, status, failure_class, error_signature, created_at FROM deploy_events WHERE deploy_id = $1",
    [deployId]
  );
  const row = created.rows[0];
  return {
    deploy_id: row.deploy_id,
    change_event_id: row.change_event_id,
    service_id: row.service_id,
    commit_sha: row.commit_sha,
    status: row.status,
    failure_class: row.failure_class,
    error_signature: row.error_signature,
    created_at: row.created_at,
  };
}
