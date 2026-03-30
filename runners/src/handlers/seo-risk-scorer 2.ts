/**
 * SEO risk scorer: merge match report, redirect verification, content parity, technical diff (and optional GSC/GA) into per-URL risk_score and risk_level.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { computeRiskScore } from "../lib/seo/risk-score.js";
import { loadArtifactMetadata } from "./seo-utils.js";

export async function handleSeoRiskScorer(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const matchReport = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_url_match_report");
  const redirectVer = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_redirect_verification");
  const contentParity = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_content_parity_report");
  const technicalDiff = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_technical_diff_report");
  const gscSnapshot = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_gsc_snapshot");
  const ga4Snapshot = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_ga4_snapshot");

  if (!matchReport) {
    throw new Error("seo_risk_scorer requires predecessor seo_url_match_report");
  }

  const matchMeta = await loadArtifactMetadata(client, matchReport.id);
  const matches = (matchMeta?.matches ?? []) as Array<{ source_url: string; target_url: string | null }>;

  const redirectBySource = new Map<string, boolean>();
  if (redirectVer) {
    const verMeta = await loadArtifactMetadata(client, redirectVer.id);
    const results = (verMeta?.results ?? []) as Array<{ source_url: string; redirect_ok: boolean }>;
    for (const r of results) {
      redirectBySource.set(r.source_url, r.redirect_ok);
    }
  }

  const contentBySource = new Map<string, "pass" | "warning" | "fail">();
  if (contentParity) {
    const parityMeta = await loadArtifactMetadata(client, contentParity.id);
    const comparisons = (parityMeta?.comparisons ?? []) as Array<{ source_url: string; result: "pass" | "warning" | "fail" }>;
    for (const c of comparisons) {
      contentBySource.set(c.source_url, c.result);
    }
  }

  const technicalBySource = new Map<string, "critical" | "high" | "medium" | "low" | "ok">();
  if (technicalDiff) {
    const diffMeta = await loadArtifactMetadata(client, technicalDiff.id);
    const comparisons = (diffMeta?.comparisons ?? []) as Array<{ source_url: string; severity: string }>;
    for (const c of comparisons) {
      technicalBySource.set(c.source_url, c.severity as "critical" | "high" | "medium" | "low" | "ok");
    }
  }

  let gscByUrl: Map<string, { clicks: number; impressions: number }> = new Map();
  let gaByUrl: Map<string, number> = new Map();
  let maxClicks = 0;
  let maxImpressions = 0;
  let maxSessions = 0;
  if (gscSnapshot) {
    const gscMeta = await loadArtifactMetadata(client, gscSnapshot.id);
    const pages = (gscMeta?.pages ?? []) as Array<{ url: string; clicks?: number; impressions?: number }>;
    for (const p of pages) {
      const c = p.clicks ?? 0;
      const i = p.impressions ?? 0;
      gscByUrl.set(p.url, { clicks: c, impressions: i });
      if (c > maxClicks) maxClicks = c;
      if (i > maxImpressions) maxImpressions = i;
    }
  }
  if (ga4Snapshot) {
    const gaMeta = await loadArtifactMetadata(client, ga4Snapshot.id);
    const pages = (gaMeta?.pages ?? []) as Array<{ page_path?: string; full_page_url?: string; sessions?: number }>;
    for (const p of pages) {
      const url = (p.full_page_url as string) ?? (p.page_path as string) ?? "";
      const s = p.sessions ?? 0;
      gaByUrl.set(url, s);
      if (s > maxSessions) maxSessions = s;
    }
  }

  const urls = matches.map((m) => {
    const gsc = gscByUrl.get(m.source_url);
    const gaSessions = gaByUrl.get(m.source_url) ?? gaByUrl.get(m.target_url ?? "");
    const redirectOk = m.target_url ? (redirectBySource.get(m.source_url) ?? null) : false;
    const contentResult = contentBySource.get(m.source_url) ?? undefined;
    const technicalSeverity = technicalBySource.get(m.source_url) ?? undefined;

    const result = computeRiskScore(
      {
        source_url: m.source_url,
        target_url: m.target_url,
        redirect_ok: m.target_url ? (redirectOk ?? true) : undefined,
        content_result: contentResult,
        technical_severity: technicalSeverity,
        gsc_clicks: gsc?.clicks,
        gsc_impressions: gsc?.impressions,
        ga_sessions: gaSessions,
      },
      { clicks: maxClicks || 1, impressions: maxImpressions || 1, sessions: maxSessions || 1 },
    );
    return {
      source_url: m.source_url,
      target_url: m.target_url,
      ...result,
    };
  });

  const stats = {
    critical: urls.filter((u) => u.risk_level === "critical").length,
    high: urls.filter((u) => u.risk_level === "high").length,
    medium: urls.filter((u) => u.risk_level === "medium").length,
    low: urls.filter((u) => u.risk_level === "low").length,
  };

  const payload = { urls, stats };
  const uri = `mem://seo_ranking_risk_report/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_ranking_risk_report', 'build_outputs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
