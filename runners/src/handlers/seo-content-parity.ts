/**
 * SEO content parity: compare source vs target page content (title, H1, meta, word count, schema) for matched URLs.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { compareContentParity } from "../lib/seo/content-similarity.js";
import {
  loadArtifactMetadata,
  getNodeKeysForPlanNodes,
  findRecordByUrl,
} from "./seo-utils.js";

export async function handleSeoContentParity(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const invArtifacts = (context.predecessor_artifacts ?? []).filter((a) => a.artifact_type === "seo_url_inventory");
  const matchReportArtifact = (context.predecessor_artifacts ?? []).find((a) => a.artifact_type === "seo_url_match_report");
  if (invArtifacts.length < 2 || !matchReportArtifact) {
    throw new Error("seo_content_parity requires two seo_url_inventory artifacts and seo_url_match_report");
  }

  const nodeKeyByNodeId = await getNodeKeysForPlanNodes(
    client,
    [...new Set(invArtifacts.map((a) => a.producer_plan_node_id))],
  );
  const sourceArtifact = invArtifacts.find((a) => nodeKeyByNodeId.get(a.producer_plan_node_id) === "source_inventory");
  const targetArtifact = invArtifacts.find((a) => nodeKeyByNodeId.get(a.producer_plan_node_id) === "target_inventory");
  if (!sourceArtifact || !targetArtifact) {
    throw new Error("seo_content_parity could not identify source_inventory and target_inventory");
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
    return compareContentParity(
      srcRec as { title?: string; meta_description?: string; h1?: string; word_count?: number; schema_types?: string[] },
      tgtRec as { title?: string; meta_description?: string; h1?: string; word_count?: number; schema_types?: string[] },
      m.source_url,
      m.target_url!,
    );
  });

  const stats = {
    total_compared: comparisons.length,
    pass: comparisons.filter((c) => c.result === "pass").length,
    warning: comparisons.filter((c) => c.result === "warning").length,
    fail: comparisons.filter((c) => c.result === "fail").length,
  };

  const payload = { comparisons, stats };
  const uri = `mem://seo_content_parity_report/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_content_parity_report', 'data', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
