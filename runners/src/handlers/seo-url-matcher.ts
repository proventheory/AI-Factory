/**
 * SEO URL matcher: read source + target seo_url_inventory from predecessors, match URLs, write seo_url_match_report.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import type { SeoUrlRecord } from "../lib/seo/crawl.js";
import { matchSourceToTarget, type MatchingRule } from "../lib/seo/matcher.js";

async function loadArtifactMetadata(
  client: pg.PoolClient,
  artifactIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  if (artifactIds.length === 0) return new Map();
  const r = await client.query<{ id: string; metadata_json: unknown }>(
    "SELECT id, metadata_json FROM artifacts WHERE id = ANY($1::uuid[])",
    [artifactIds],
  );
  const map = new Map<string, Record<string, unknown>>();
  for (const row of r.rows) {
    const meta = row.metadata_json;
    if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
      map.set(row.id, meta as Record<string, unknown>);
    }
  }
  return map;
}

async function getNodeKeysForPlanNodes(
  client: pg.PoolClient,
  planNodeIds: string[],
): Promise<Map<string, string>> {
  if (planNodeIds.length === 0) return new Map();
  const r = await client.query<{ id: string; node_key: string }>(
    "SELECT id::text, node_key FROM plan_nodes WHERE id = ANY($1::uuid[])",
    [planNodeIds],
  );
  const map = new Map<string, string>();
  for (const row of r.rows) {
    map.set(row.id, row.node_key);
  }
  return map;
}

export async function handleSeoUrlMatcher(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const invArtifacts = (context.predecessor_artifacts ?? []).filter((a) => a.artifact_type === "seo_url_inventory");
  if (invArtifacts.length < 2) {
    throw new Error("seo_url_matcher requires two predecessor seo_url_inventory artifacts (source + target)");
  }

  const nodeIds = [...new Set(invArtifacts.map((a) => a.producer_plan_node_id))];
  const nodeKeyByNodeId = await getNodeKeysForPlanNodes(client, nodeIds);
  const sourceArtifact = invArtifacts.find((a) => nodeKeyByNodeId.get(a.producer_plan_node_id) === "source_inventory");
  const targetArtifact = invArtifacts.find((a) => nodeKeyByNodeId.get(a.producer_plan_node_id) === "target_inventory");
  if (!sourceArtifact || !targetArtifact) {
    throw new Error("seo_url_matcher could not identify source_inventory and target_inventory predecessors");
  }

  const metaByArtifactId = await loadArtifactMetadata(client, [sourceArtifact.id, targetArtifact.id]);
  const sourceMeta = metaByArtifactId.get(sourceArtifact.id);
  const targetMeta = metaByArtifactId.get(targetArtifact.id);
  if (!sourceMeta?.urls || !Array.isArray(sourceMeta.urls) || !targetMeta?.urls || !Array.isArray(targetMeta.urls)) {
    throw new Error("seo_url_matcher: predecessor inventories missing urls array");
  }

  const targetUrl = (targetMeta.target_url as string) ?? (context.goal_metadata?.target_url as string) ?? "";
  const targetOrigin = targetUrl ? new URL(targetUrl).origin : new URL("https://example.com").origin;
  const rawRules = context.goal_metadata?.matching_rules as MatchingRule[] | undefined;
  const { matches, by_match_type, target_url_to_path } = matchSourceToTarget(
    sourceMeta.urls as SeoUrlRecord[],
    targetMeta.urls as SeoUrlRecord[],
    targetOrigin,
    rawRules?.length ? rawRules : undefined,
  );

  const payload = {
    source_url: sourceMeta.source_url,
    target_url: targetMeta.target_url ?? targetUrl,
    matches,
    by_match_type: by_match_type,
    target_url_to_path: Array.from(target_url_to_path.entries()).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, string>),
  };
  const uri = `mem://seo_url_match_report/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_url_match_report', 'data', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
