/**
 * SEO migration wizard — Step 1 crawl. Loads runners crawlSite at runtime (same pattern as seo-gsc-ga-client).
 * CJS-safe: uses get-current-dir-cjs so esbuild --format=cjs does not warn.
 */
import path from "path";
import { existsSync } from "fs";
import { getCurrentDir } from "./get-current-dir-cjs.js";

const __dirname = getCurrentDir();

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

async function loadRunnersCrawl(): Promise<{
  crawlSite: (opts: {
    baseUrl: string;
    crawlDelayMs?: number;
    maxUrls?: number;
    useSitemapsFirst?: boolean;
    useLinkCrawl?: boolean;
    fetchPageDetails?: boolean;
  }) => Promise<{
    urls: MigrationCrawlResult["urls"];
    crawl_mode: MigrationCrawlResult["crawl_mode"];
    stats: MigrationCrawlResult["stats"];
  }>;
}> {
  const base = getCurrentDir();
  const relCrawl = path.join("runners", "src", "lib", "seo", "crawl.js");
  const candidates = [
    path.join(base, "runners", "src", "lib", "seo", "crawl.js"),
    path.join(base, "..", relCrawl),
    path.join(base, "..", "..", relCrawl),
  ];
  const modulePath = candidates.find((p) => existsSync(p)) ?? candidates[0];
  const mod = await import(modulePath);
  return { crawlSite: mod.crawlSite };
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
  const { crawlSite } = await loadRunnersCrawl();
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
