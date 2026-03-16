/**
 * SEO crawl: sitemap-first URL discovery. Fetches sitemap index or sitemap, parses <loc>, optionally fetches each URL for status.
 */
import axios from "axios";
// @ts-expect-error no declaration file for xml2js
import { parseStringPromise } from "xml2js";
import { normalizeUrl, getPath } from "./normalize-url.js";
import { classifyUrlType } from "./classify-url.js";

const DEFAULT_DELAY_MS = 500;
const DEFAULT_MAX_URLS = 2000;

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
  fetchPageDetails?: boolean;
}

/**
 * Fetch sitemap index or single sitemap and extract all <loc> URLs.
 */
async function fetchSitemapUrls(
  sitemapUrl: string,
  options: { maxUrls: number }
): Promise<{ urls: string[]; parent?: string }[]> {
  const res = await axios.get(sitemapUrl, {
    timeout: 15000,
    maxRedirects: 3,
    validateStatus: (s) => s === 200,
    responseType: "text",
  });
  const xml = res.data as string;
  const parsed = await parseStringPromise(xml);

  const out: { urls: string[]; parent?: string }[] = [];

  // Sitemap index: <sitemapindex><sitemap><loc>...
  const sitemapIndex = parsed?.sitemapindex?.sitemap;
  if (Array.isArray(sitemapIndex)) {
    const childLocs = sitemapIndex
      .map((s: { loc?: string[] }) => s?.loc?.[0])
      .filter(Boolean) as string[];
    for (const loc of childLocs.slice(0, 20)) {
      try {
        const child = await fetchSitemapUrls(loc, options);
        for (const c of child) out.push(c);
      } catch {
        // skip failed child sitemap
      }
    }
    return out;
  }

  // URL set: <urlset><url><loc>...
  const urlset = parsed?.urlset?.url;
  if (Array.isArray(urlset)) {
    const urls = urlset
      .map((u: { loc?: string[] }) => u?.loc?.[0])
      .filter(Boolean) as string[];
    out.push({ urls: urls.slice(0, options.maxUrls), parent: sitemapUrl });
    return out;
  }

  return out;
}

/**
 * Try common sitemap URLs for a base URL.
 */
function sitemapCandidates(baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  return [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap_products_1.xml`,
    `${origin}/sitemap_products.xml`,
  ];
}

/**
 * Crawl site: sitemap-first, collect URLs, optionally fetch each for status and basic metadata.
 */
export async function crawlSite(options: CrawlOptions): Promise<{
  urls: SeoUrlRecord[];
  crawl_mode: "sitemap" | "crawl" | "hybrid";
  stats: { total_urls: number; by_type: Record<string, number>; status_counts: Record<string, number> };
}> {
  const {
    baseUrl,
    crawlDelayMs = DEFAULT_DELAY_MS,
    maxUrls = DEFAULT_MAX_URLS,
    useSitemapsFirst = true,
    fetchPageDetails = false,
  } = options;

  const origin = new URL(baseUrl).origin;
  const allUrls: string[] = [];
  let crawl_mode: "sitemap" | "crawl" | "hybrid" = "sitemap";

  if (useSitemapsFirst) {
    for (const candidate of sitemapCandidates(baseUrl)) {
      try {
        const chunks = await fetchSitemapUrls(candidate, { maxUrls });
        for (const c of chunks) {
          for (const u of c.urls) {
            try {
              const norm = normalizeUrl(u, origin);
              if (new URL(norm).origin === origin) allUrls.push(norm);
            } catch {
              // skip invalid
            }
          }
        }
        if (allUrls.length > 0) break;
      } catch {
        continue;
      }
    }
  }

  const uniqueUrls = [...new Set(allUrls)].slice(0, maxUrls);
  if (uniqueUrls.length === 0) {
    uniqueUrls.push(normalizeUrl(baseUrl));
    crawl_mode = "crawl";
  }

  const records: SeoUrlRecord[] = [];
  const byType: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};

  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    const path = getPath(url);
    const type = classifyUrlType(path, new URL(baseUrl).pathname);

    let status = 200;
    let title: string | null = null;
    let meta: string | null = null;
    let h1: string | null = null;
    let canonical: string | null = null;
    let indexable = true;
    let wordCount: number | null = null;
    let schemaTypes: string[] = [];
    let imageCount: number | null = null;

    if (fetchPageDetails) {
      try {
        const res = await axios.get(url, {
          timeout: 10000,
          maxRedirects: 3,
          validateStatus: () => true,
          responseType: "text",
        });
        status = res.status;
        statusCounts[String(status)] = (statusCounts[String(status)] ?? 0) + 1;
        if (res.status === 200 && typeof res.data === "string") {
          const html = res.data;
          const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
          title = titleMatch ? titleMatch[1].trim().slice(0, 500) : null;
          const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
          meta = metaMatch ? metaMatch[1].trim().slice(0, 500) : null;
          const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
          h1 = h1Match ? h1Match[1].trim().slice(0, 500) : null;
          const canonMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
          canonical = canonMatch ? canonMatch[1].trim() : null;
          if (html.includes('noindex') || html.includes("noindex")) indexable = false;
          wordCount = (html.replace(/<[^>]+>/g, " ").match(/\S+/g) || []).length;
          const schemaMatches = html.matchAll(/application\/ld\+json[^>]*>([^<]+)</gi);
          for (const m of schemaMatches) {
            try {
              const j = JSON.parse(m[1]);
              const t = j["@type"] ?? j["@graph"]?.[0]?.["@type"];
              if (t) schemaTypes.push(t);
            } catch {
              // ignore
            }
          }
          imageCount = (html.match(/<img\s/gi) || []).length;
        }
      } catch {
        status = 0;
        statusCounts["0"] = (statusCounts["0"] ?? 0) + 1;
      }
      if (i < uniqueUrls.length - 1 && crawlDelayMs > 0) {
        await new Promise((r) => setTimeout(r, crawlDelayMs));
      }
    } else {
      try {
        const res = await axios.head(url, { timeout: 8000, maxRedirects: 3, validateStatus: () => true });
        status = res.status;
      } catch {
        try {
          const res = await axios.get(url, { timeout: 8000, maxRedirects: 3, validateStatus: () => true });
          status = res.status;
        } catch {
          status = 0;
        }
      }
      statusCounts[String(status)] = (statusCounts[String(status)] ?? 0) + 1;
    }

    byType[type] = (byType[type] ?? 0) + 1;
    records.push({
      url,
      normalized_url: normalizeUrl(url, origin),
      path,
      status,
      type,
      source: "sitemap",
      title: title ?? undefined,
      meta_description: meta ?? undefined,
      h1: h1 ?? undefined,
      canonical: canonical ?? undefined,
      indexable,
      word_count: wordCount ?? undefined,
      schema_types: schemaTypes.length ? schemaTypes : undefined,
      image_count: imageCount ?? undefined,
    });
  }

  return {
    urls: records,
    crawl_mode,
    stats: {
      total_urls: records.length,
      by_type: byType,
      status_counts: statusCounts,
    },
  };
}
