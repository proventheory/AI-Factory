/**
 * SEO internal graph builder: from one seo_url_inventory artifact, produce seo_internal_link_graph (nodes + edges).
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { buildGraphFromInventory } from "../lib/seo/internal-graph.js";
import { loadArtifactMetadata, getNodeKeysForPlanNodes } from "./seo-utils.js";

export async function handleSeoInternalGraphBuilder(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const invArtifacts = (context.predecessor_artifacts ?? []).filter((a) => a.artifact_type === "seo_url_inventory");
  if (invArtifacts.length === 0) {
    throw new Error("seo_internal_graph_builder requires at least one seo_url_inventory artifact");
  }

  const nodeKeyByNodeId = await getNodeKeysForPlanNodes(
    client,
    [...new Set(invArtifacts.map((a) => a.producer_plan_node_id))],
  );
  const sourceArtifact = invArtifacts.find((a) => nodeKeyByNodeId.get(a.producer_plan_node_id) === "source_inventory");
  const targetArtifact = invArtifacts.find((a) => nodeKeyByNodeId.get(a.producer_plan_node_id) === "target_inventory");

  const graphs: Array<{ site_role: "source" | "target"; graph: ReturnType<typeof buildGraphFromInventory> }> = [];
  for (const art of invArtifacts) {
    const meta = await loadArtifactMetadata(client, art.id);
    const urls = (meta?.urls ?? []) as Array<Record<string, unknown>>;
    const baseUrl = (meta?.source_url ?? meta?.target_url ?? "") as string;
    const role = art.id === sourceArtifact?.id ? "source" : art.id === targetArtifact?.id ? "target" : "source";
    const graph = buildGraphFromInventory(
      urls as Array<{ url: string; normalized_url: string; path?: string; type?: string; discovered_from?: string | null }>,
      role,
      baseUrl || "https://example.com",
    );
    graphs.push({ site_role: role, graph });
  }

  const payload = graphs.length === 1
    ? graphs[0].graph
    : { source: graphs.find((g) => g.site_role === "source")?.graph ?? null, target: graphs.find((g) => g.site_role === "target")?.graph ?? null };
  const uri = `mem://seo_internal_link_graph/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_internal_link_graph', 'build_outputs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
