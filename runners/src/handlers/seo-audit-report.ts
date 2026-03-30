/**
 * WP → Shopify audit report: aggregate match report + redirect verification + optional risk_scorer into seo_audit_summary.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { loadArtifactMetadata } from "./seo-utils.js";

export async function handleSeoAuditReport(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const matchReport = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_url_match_report");
  const redirectVer = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_redirect_verification");
  const riskReport = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_ranking_risk_report");
  if (!matchReport) {
    throw new Error("seo_audit_report requires predecessor seo_url_match_report");
  }

  const matchMeta = await loadArtifactMetadata(client, matchReport.id);
  const byMatchType = (matchMeta?.by_match_type as Record<string, number>) ?? { exact: 0, rule: 0, none: 0 };
  const matches = (matchMeta?.matches as Array<{ source_url: string; target_url: string | null; match_type: string }>) ?? [];
  const unmatchedCount = matches.filter((m) => !m.target_url || m.match_type === "none").length;

  let verifiedCount = 0;
  let brokenCount = 0;
  let sampledCount = 0;
  if (redirectVer) {
    const verMeta = await loadArtifactMetadata(client, redirectVer.id);
    verifiedCount = Number(verMeta?.verified_count) ?? 0;
    brokenCount = Number(verMeta?.broken_count) ?? 0;
    sampledCount = Number(verMeta?.sampled_count) ?? 0;
  }

  let riskBuckets = {
    critical: unmatchedCount,
    high: brokenCount,
    medium: Math.max(0, (byMatchType.rule ?? 0) - verifiedCount),
    low: byMatchType.exact ?? 0,
  };
  let topPriorityUrls: Array<{ source_url: string; target_url: string | null; risk_level: string; risk_score: number }> = [];
  if (riskReport) {
    const riskMeta = await loadArtifactMetadata(client, riskReport.id);
    const stats = (riskMeta?.stats as Record<string, number>) ?? {};
    riskBuckets = {
      critical: stats.critical ?? riskBuckets.critical,
      high: stats.high ?? riskBuckets.high,
      medium: stats.medium ?? riskBuckets.medium,
      low: stats.low ?? riskBuckets.low,
    };
    const urls = (riskMeta?.urls ?? []) as Array<{ source_url: string; target_url: string | null; risk_level: string; risk_score: number }>;
    topPriorityUrls = urls
      .filter((u) => u.risk_level === "critical" || u.risk_level === "high")
      .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
      .slice(0, 50);
  }

  const recommendedActions = [
    unmatchedCount > 0 && "Add redirects or destination pages for unmatched source URLs",
    brokenCount > 0 && "Fix redirects that do not point to the expected target URL",
    (byMatchType.rule ?? 0) > 0 && "Confirm rule-based matches (e.g. /product/ → /products/) on target site",
  ].filter(Boolean) as string[];

  const summary = {
    source_url: matchMeta?.source_url,
    target_url: matchMeta?.target_url,
    url_match: {
      total: matches.length,
      exact: byMatchType.exact ?? 0,
      rule: byMatchType.rule ?? 0,
      none: byMatchType.none ?? 0,
      unmatched_count: unmatchedCount,
    },
    redirect_verification: {
      sampled: sampledCount,
      verified: verifiedCount,
      broken: brokenCount,
    },
    risk_buckets: riskBuckets,
    top_priority_urls: topPriorityUrls,
    recommended_actions: recommendedActions,
  };

  const uri = `mem://seo_audit_summary/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_audit_summary', 'docs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(summary)],
  );
}
