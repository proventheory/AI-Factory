/**
 * SEO technical diff: compare status, canonical, indexable, title/meta/H1, schema for matched source vs target URLs.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import {
  loadArtifactMetadata,
  getNodeKeysForPlanNodes,
  findRecordByUrl,
} from "./seo-utils.js";

export interface TechnicalDiffComparison {
  source_url: string;
  target_url: string;
  source_status: number;
  target_status: number;
  canonical_match: boolean;
  indexable_ok: boolean;
  title_present: boolean;
  meta_present: boolean;
  h1_present: boolean;
  schema_preserved: boolean;
  issue_codes: string[];
  severity: "critical" | "high" | "medium" | "low" | "ok";
}

function compareTechnical(
  src: Record<string, unknown> | undefined,
  tgt: Record<string, unknown> | undefined,
  sourceUrl: string,
  targetUrl: string,
): TechnicalDiffComparison {
  const issues: string[] = [];
  let severity: TechnicalDiffComparison["severity"] = "ok";

  const srcStatus = Number(src?.status ?? 0);
  const tgtStatus = Number(tgt?.status ?? 0);
  if (tgtStatus >= 400) {
    issues.push("target_4xx");
    severity = "critical";
  }
  if (srcStatus === 200 && tgtStatus !== 200 && tgtStatus < 400) {
    issues.push("status_regression");
    if (severity === "ok") severity = "high";
  }

  const srcCanon = (src?.canonical as string)?.replace(/\/$/, "") ?? "";
  const tgtCanon = (tgt?.canonical as string)?.replace(/\/$/, "") ?? "";
  const canonicalMatch = !tgtCanon || srcCanon === tgtCanon || tgtUrlNorm(targetUrl) === tgtCanon.replace(/\/$/, "");
  if (!canonicalMatch && tgtCanon) {
    issues.push("canonical_mismatch");
    if (severity === "ok") severity = "high";
  }

  const indexable = tgt?.indexable !== false;
  if (!indexable) {
    issues.push("target_noindex");
    if (severity === "ok") severity = "critical";
  }

  const titlePresent = Boolean(tgt?.title);
  const metaPresent = Boolean(tgt?.meta_description);
  const h1Present = Boolean(tgt?.h1);
  if (!titlePresent) {
    issues.push("missing_title");
    if (severity === "ok") severity = "medium";
  }
  if (!metaPresent) {
    issues.push("missing_meta_description");
    if (severity === "ok") severity = "low";
  }

  const srcSchema = new Set((src?.schema_types as string[]) ?? []);
  const tgtSchema = new Set((tgt?.schema_types as string[]) ?? []);
  const schemaPreserved = srcSchema.size === 0 || (tgtSchema.size > 0 && [...srcSchema].every((t) => tgtSchema.has(t)));
  if (!schemaPreserved && srcSchema.size > 0) {
    issues.push("schema_loss");
    if (severity === "ok") severity = "medium";
  }

  return {
    source_url: sourceUrl,
    target_url: targetUrl,
    source_status: srcStatus,
    target_status: tgtStatus,
    canonical_match: canonicalMatch,
    indexable_ok: indexable,
    title_present: titlePresent,
    meta_present: metaPresent,
    h1_present: h1Present,
    schema_preserved: schemaPreserved,
    issue_codes: issues,
    severity,
  };
}

function tgtUrlNorm(u: string): string {
  try {
    const p = new URL(u).pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    return p;
  } catch {
    return u;
  }
}

export async function handleSeoTechnicalDiff(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const invArtifacts = (context.predecessor_artifacts ?? []).filter((a) => a.artifact_type === "seo_url_inventory");
  const matchReportArtifact = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_url_match_report");
  if (invArtifacts.length < 2 || !matchReportArtifact) {
    throw new Error("seo_technical_diff requires two seo_url_inventory artifacts and seo_url_match_report");
  }

  const nodeKeyByNodeId = await getNodeKeysForPlanNodes(
    client,
    [...new Set(invArtifacts.map((a) => a.producer_plan_node_id))],
  );
  const sourceArtifact = invArtifacts.find((a) => nodeKeyByNodeId.get(a.producer_plan_node_id) === "source_inventory");
  const targetArtifact = invArtifacts.find((a) => nodeKeyByNodeId.get(a.producer_plan_node_id) === "target_inventory");
  if (!sourceArtifact || !targetArtifact) {
    throw new Error("seo_technical_diff could not identify source_inventory and target_inventory");
  }

  const [sourceMeta, targetMeta, matchMeta] = await Promise.all([
    loadArtifactMetadata(client, sourceArtifact.id),
    loadArtifactMetadata(client, targetArtifact.id),
    loadArtifactMetadata(client, matchReportArtifact.id),
  ]);
  const sourceUrls = (sourceMeta?.urls ?? []) as Array<Record<string, unknown>>;
  const targetUrls = (targetMeta?.urls ?? []) as Array<Record<string, unknown>>;
  const matches = (matchMeta?.matches ?? []) as Array<{ source_url: string; target_url: string | null }>;
  const matchedPairs = matches.filter((m) => m.target_url);

  const comparisons = matchedPairs.slice(0, 500).map((m) => {
    const srcRec = findRecordByUrl(sourceUrls, m.source_url);
    const tgtRec = findRecordByUrl(targetUrls, m.target_url!);
    return compareTechnical(
      srcRec as Record<string, unknown>,
      tgtRec as Record<string, unknown>,
      m.source_url,
      m.target_url!,
    );
  });

  const stats = {
    total: comparisons.length,
    critical: comparisons.filter((c) => c.severity === "critical").length,
    high: comparisons.filter((c) => c.severity === "high").length,
    medium: comparisons.filter((c) => c.severity === "medium").length,
    low: comparisons.filter((c) => c.severity === "low").length,
    ok: comparisons.filter((c) => c.severity === "ok").length,
  };

  const payload = { comparisons, stats };
  const uri = `mem://seo_technical_diff_report/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_technical_diff_report', 'build_outputs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
