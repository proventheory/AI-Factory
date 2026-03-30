/**
 * SEO GA4 snapshot: pull Google Analytics 4 top pages/sessions for goal_metadata.ga4_property_id.
 * Uses OAuth access token from control-plane when the initiative has "Connect Google"; otherwise GOOGLE_APPLICATION_CREDENTIALS.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { fetchGa4Report } from "../lib/seo/gsc-ga-api.js";
import { getGoogleAccessTokenFromControlPlane } from "../lib/control-plane-google-token.js";

export async function handleSeoGa4Snapshot(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const meta = context.goal_metadata ?? {};
  const ga4PropertyId = (meta.ga4_property_id as string) ?? "";

  const accessToken = context.initiative_id
    ? await getGoogleAccessTokenFromControlPlane(context.initiative_id)
    : undefined;

  const report = ga4PropertyId
    ? await fetchGa4Report(ga4PropertyId, { rowLimit: 500, accessToken })
    : { property_id: "", pages: [], error: "ga4_property_id not set" };

  const payload: Record<string, unknown> = {
    property_id: report.property_id || ga4PropertyId || null,
    generated_at: new Date().toISOString(),
    pages: report.pages,
    ...(report.error && { error: report.error }),
    ...(report.error && report.pages.length === 0 && { note: "Connect Google for this initiative or set GOOGLE_APPLICATION_CREDENTIALS and GA4 property ID for real data." }),
  };

  const uri = `mem://seo_ga4_snapshot/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_ga4_snapshot', 'data', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
