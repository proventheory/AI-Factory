/**
 * SEO GSC snapshot: pull Google Search Console data (by page, by query) for goal_metadata.gsc_site_url.
 * Uses OAuth access token from control-plane when the initiative has "Connect Google"; otherwise GOOGLE_APPLICATION_CREDENTIALS.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { fetchGscReport } from "../lib/seo/gsc-ga-api.js";

const CONTROL_PLANE_URL = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function getGoogleAccessToken(initiativeId: string | null): Promise<string | undefined> {
  if (!initiativeId) return undefined;
  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/v1/initiatives/${initiativeId}/google_access_token`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token;
  } catch {
    return undefined;
  }
}

export async function handleSeoGscSnapshot(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const meta = context.goal_metadata ?? {};
  const gscSiteUrl = (meta.gsc_site_url as string) ?? (meta.source_url as string) ?? "";
  const dateRange = (meta.gsc_date_range as string) ?? "last28days";

  const accessToken = await getGoogleAccessToken(context.initiative_id);

  const report = gscSiteUrl
    ? await fetchGscReport(gscSiteUrl, { dateRange, rowLimit: 500, accessToken })
    : { site_url: "", date_range: { start: "", end: "" }, pages: [], queries: [], error: "gsc_site_url not set" };

  const payload: Record<string, unknown> = {
    site_url: report.site_url,
    date_range: report.date_range,
    generated_at: new Date().toISOString(),
    pages: report.pages,
    queries: report.queries,
    ...(report.error && { error: report.error }),
    ...(report.error && report.pages.length === 0 && { note: "Connect Google for this initiative or set GOOGLE_APPLICATION_CREDENTIALS and add site in Search Console for real data." }),
  };

  const uri = `mem://seo_gsc_snapshot/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_gsc_snapshot', 'build_outputs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
