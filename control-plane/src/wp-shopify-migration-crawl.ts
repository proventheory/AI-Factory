/**
 * WP → Shopify migration wizard — Step 1 crawl. Bundles runners crawlSite into control-plane (no runtime path).
 */
import { crawlSite } from "../../runners/src/lib/seo/crawl.js";

export interface MigrationCrawlOptions {
  source_url: string;
  use_link_crawl?: boolean;
  max_urls?: number;
  crawl_delay_ms?: number;
  fetch_page_details?: boolean;
}

export interface MigrationCrawlResult {
  source_url: string;
  urls: Array<{
    url: string;
    normalized_url: string;
    path: string;
    status: number;
    type: string;
    source: "sitemap" | "crawl" | "both";
    title?: string | null;
    meta_description?: string | null;
    h1?: string | null;
  }>;
  crawl_mode: "sitemap" | "crawl" | "hybrid";
  stats: { total_urls: number; by_type: Record<string, number>; status_counts: Record<string, number> };
}

export async function runMigrationCrawl(options: MigrationCrawlOptions): Promise<MigrationCrawlResult> {
  const {
    source_url,
    use_link_crawl = false,
    max_urls = 2000,
    crawl_delay_ms = 500,
    fetch_page_details = false,
  } = options;
  const baseUrl = source_url.replace(/\/$/, "") || "https://example.com";
  const result = await crawlSite({
    baseUrl,
    crawlDelayMs: Math.max(0, crawl_delay_ms),
    maxUrls: Math.min(5000, Math.max(1, max_urls)),
    useSitemapsFirst: true,
    useLinkCrawl: use_link_crawl,
    fetchPageDetails: fetch_page_details,
  });
  return {
    source_url: baseUrl,
    urls: result.urls,
    crawl_mode: result.crawl_mode,
    stats: result.stats,
  };
}
