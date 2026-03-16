/**
 * SEO backlink snapshot: pull backlink/referring domain data per URL (e.g. Ahrefs/SEMrush).
 * Writes seo_backlink_snapshot. Stub implementation: writes empty urls unless backlink API is configured.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";

export async function handleSeoBacklinkSnapshot(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const payload: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    urls: [],
    note: "Backlink API not configured. Upload backlink data as artifact or integrate Ahrefs/SEMrush API for real data.",
  };

  const uri = `mem://seo_backlink_snapshot/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_backlink_snapshot', 'data', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
