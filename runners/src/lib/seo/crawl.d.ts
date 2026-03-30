export interface SeoUrlRecord {
    url: string;
    normalized_url: string;
    path: string;
    status: number;
    type: string;
    source: "sitemap" | "crawl" | "both";
    title?: string | null;
    meta_description?: string | null;
    h1?: string | null;
    canonical?: string | null;
    indexable?: boolean | null;
    word_count?: number | null;
    schema_types?: string[];
    image_count?: number | null;
    internal_links_out?: number | null;
    discovered_from?: string | null;
    sitemap_parent?: string | null;
    lastmod?: string | null;
}
export interface CrawlOptions {
    baseUrl: string;
    crawlDelayMs?: number;
    maxUrls?: number;
    useSitemapsFirst?: boolean;
    /** When true, discover URLs by following same-origin links from seed URLs (homepage + sitemap). Captures pages not listed in sitemap (e.g. some WordPress pages). */
    useLinkCrawl?: boolean;
    fetchPageDetails?: boolean;
}
/**
 * Crawl site: sitemap-first, collect URLs, optionally fetch each for status and basic metadata.
 */
export declare function crawlSite(options: CrawlOptions): Promise<{
    urls: SeoUrlRecord[];
    crawl_mode: "sitemap" | "crawl" | "hybrid";
    stats: {
        total_urls: number;
        by_type: Record<string, number>;
        status_counts: Record<string, number>;
    };
}>;
