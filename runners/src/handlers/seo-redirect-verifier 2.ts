/**
 * SEO redirect verifier: for each source→target in match report, verify redirect (HEAD source, check Location).
 * Writes seo_redirect_verification artifact.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import axios from "axios";

async function loadArtifactMetadata(
  client: pg.PoolClient,
  artifactId: string,
): Promise<Record<string, unknown> | null> {
  const r = await client.query<{ metadata_json: unknown }>(
    "SELECT metadata_json FROM artifacts WHERE id = $1",
    [artifactId],
  );
  const row = r.rows[0];
  const meta = row?.metadata_json;
  if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return null;
}

export async function handleSeoRedirectVerifier(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const matchReportArtifact = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_url_match_report");
  if (!matchReportArtifact) {
    throw new Error("seo_redirect_verifier requires predecessor seo_url_match_report");
  }

  const meta = await loadArtifactMetadata(client, matchReportArtifact.id);
  if (!meta?.matches || !Array.isArray(meta.matches)) {
    throw new Error("seo_redirect_verifier: match report missing matches array");
  }

  const matches = meta.matches as Array<{ source_url: string; target_url: string | null; match_type: string }>;
  const toVerify = matches.filter((m) => m.target_url && m.source_url).slice(0, 100);
  const delayMs = Math.max(0, Number(context.goal_metadata?.crawl_delay_ms) || 300);

  const results: Array<{
    source_url: string;
    target_url: string | null;
    status: number;
    redirect_ok: boolean;
    location?: string;
    error?: string;
  }> = [];

  for (let i = 0; i < toVerify.length; i++) {
    const m = toVerify[i];
    let status = 0;
    let redirect_ok = false;
    let location: string | undefined;
    let error: string | undefined;
    try {
      const res = await axios.head(m.source_url!, {
        timeout: 8000,
        maxRedirects: 0,
        validateStatus: () => true,
      });
      status = res.status;
      location = res.headers?.location;
      const expectedTarget = (m.target_url ?? "").replace(/\/$/, "");
      const actualLocation = (location ?? "").replace(/\/$/, "");
      redirect_ok = status >= 301 && status <= 308 && (actualLocation === expectedTarget || actualLocation === expectedTarget + "/");
    } catch (e) {
      error = (e as Error).message?.slice(0, 200);
    }
    results.push({ source_url: m.source_url, target_url: m.target_url ?? null, status, redirect_ok, location, error });
    if (i < toVerify.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const verified = results.filter((r) => r.redirect_ok).length;
  const broken = results.filter((r) => r.status > 0 && !r.redirect_ok && (r.status >= 400 || (r.status >= 301 && r.status <= 308))).length;
  const payload = {
    verified_count: verified,
    broken_count: broken,
    sampled_count: results.length,
    results,
  };
  const uri = `mem://seo_redirect_verification/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_redirect_verification', 'build_outputs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
