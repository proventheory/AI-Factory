/**
 * SEO internal graph diff: compare inlink counts for matched source vs target URLs.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { inlinkCounts } from "../lib/seo/internal-graph.js";
import { loadArtifactMetadata } from "./seo-utils.js";

export async function handleSeoInternalGraphDiff(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const matchReport = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_url_match_report");
  const graphArtifacts = (context.predecessor_artifacts ?? []).filter((a) => a.artifact_type === "seo_internal_link_graph");
  if (!matchReport || graphArtifacts.length === 0) {
    throw new Error("seo_internal_graph_diff requires seo_url_match_report and at least one seo_internal_link_graph");
  }

  const matchMeta = await loadArtifactMetadata(client, matchReport.id);
  const matches = (matchMeta?.matches ?? []) as Array<{ source_url: string; target_url: string | null }>;

  let sourceEdges: Array<{ from_url: string; to_url: string }> = [];
  let targetEdges: Array<{ from_url: string; to_url: string }> = [];
  for (const art of graphArtifacts) {
    const meta = await loadArtifactMetadata(client, art.id);
    if (meta?.source && meta?.target) {
      sourceEdges = ((meta.source as { edges?: unknown[] }).edges ?? []) as Array<{ from_url: string; to_url: string }>;
      targetEdges = ((meta.target as { edges?: unknown[] }).edges ?? []) as Array<{ from_url: string; to_url: string }>;
      break;
    }
    const edges = (meta?.edges ?? []) as Array<{ from_url: string; to_url: string }>;
    const role = (meta?.site_role as string) ?? "";
    if (role === "source") sourceEdges = edges;
    else if (role === "target") targetEdges = edges;
    else sourceEdges = edges;
  }

  const sourceInlinks = inlinkCounts(sourceEdges);
  const targetInlinks = inlinkCounts(targetEdges);

  const comparisons = matches
    .filter((m) => m.target_url)
    .slice(0, 500)
    .map((m) => {
      const srcUrl = m.source_url.replace(/\/$/, "");
      const tgtUrl = (m.target_url ?? "").replace(/\/$/, "");
      const oldIn = sourceInlinks.get(srcUrl) ?? 0;
      const newIn = targetInlinks.get(tgtUrl) ?? 0;
      const deltaPct = oldIn > 0 ? ((newIn - oldIn) / oldIn) * 100 : (newIn > 0 ? 100 : 0);
      const issueCodes: string[] = [];
      if (newIn < oldIn && oldIn > 2) issueCodes.push("inlink_loss");
      return {
        source_url: m.source_url,
        target_url: m.target_url,
        old_inlinks: oldIn,
        new_inlinks: newIn,
        inlink_delta_pct: Math.round(deltaPct * 100) / 100,
        issue_codes: issueCodes,
        severity: issueCodes.length ? "medium" as const : "ok" as const,
      };
    });

  const payload = { comparisons, stats: { total: comparisons.length, with_inlink_loss: comparisons.filter((c) => c.issue_codes.includes("inlink_loss")).length } };
  const uri = `mem://seo_internal_graph_diff_report/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_internal_graph_diff_report', 'build_outputs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
