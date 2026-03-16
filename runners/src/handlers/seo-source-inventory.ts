/**
 * SEO source inventory: crawl source_url from goal_metadata, write seo_url_inventory artifact.
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { crawlSite } from "../lib/seo/crawl.js";

export async function handleSeoSourceInventory(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const meta = context.goal_metadata ?? {};
  const sourceUrl = (meta.source_url as string) ?? (meta.source as string);
  if (!sourceUrl || typeof sourceUrl !== "string") {
    throw new Error("seo_source_inventory requires goal_metadata.source_url");
  }
  const baseUrl = sourceUrl.replace(/\/$/, "") || "https://example.com";
  const crawlDelayMs = Math.max(0, Number(meta.crawl_delay_ms) || 500);
  const maxUrls = Math.min(5000, Math.max(1, Number(meta.max_depth) || Number(meta.max_urls) || 2000));
  const fetchPageDetails = Boolean(meta.fetch_page_details);

  const result = await crawlSite({
    baseUrl,
    crawlDelayMs,
    maxUrls,
    useSitemapsFirst: true,
    fetchPageDetails,
  });

  const payload = {
    source_url: baseUrl,
    urls: result.urls,
    crawl_mode: result.crawl_mode,
    stats: result.stats,
  };
  const uri = `mem://seo_url_inventory/source/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'seo_url_inventory', 'data', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify(payload)],
  );
}
