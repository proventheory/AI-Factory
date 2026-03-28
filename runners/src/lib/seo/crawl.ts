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
/** Link-following BFS hits many URLs; uncapped delay × max_urls can exceed an hour. Cap politeness pause during discovery only. */
const LINK_CRAWL_DELAY_CAP_MS = 120;

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
 * Try common sitemap URLs for a base URL (generic + WordPress 5.5+).
 */
function sitemapCandidates(baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  return [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemap_products_1.xml`,
    `${origin}/sitemap_products.xml`,
    // WordPress 5.5+ default
    `${origin}/wp-sitemap.xml`,
    `${origin}/wp-sitemap-index.xml`,
    `${origin}/wp-sitemap-posts-post-1.xml`,
    `${origin}/wp-sitemap-pages-1.xml`,
    `${origin}/wp-sitemap-users-1.xml`,
  ];
}

/**
 * Extract same-origin absolute URLs from HTML <a href="...">. Skips hash-only, mailto:, tel:, javascript:, and non-http(s).
 */
function extractInternalLinks(html: string, origin: string): string[] {
  const out: string[] = [];
  const hrefRe = /<a\s[^>]*\bhref=["']([^"'#]+)(?:#|["'])/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || /^(?:mailto|tel|javascript):/i.test(raw)) continue;
    try {
      const u = new URL(raw, origin);
      if (u.origin !== origin || !/^https?:$/i.test(u.protocol)) continue;
      const norm = normalizeUrl(u.href, origin);
      out.push(norm);
    } catch {
      // skip invalid
    }
  }
  return out;
}

/**
 * BFS link-following crawl: start from seed URLs, fetch each page, extract same-origin links, add to queue; stop at maxUrls or when queue is empty.
 */
async function linkCrawlDiscover(
  seedUrls: string[],
  origin: string,
  maxUrls: number,
  crawlDelayMs: number,
): Promise<Set<string>> {
  const pauseMs =
    crawlDelayMs <= 0 ? 0 : Math.min(crawlDelayMs, LINK_CRAWL_DELAY_CAP_MS);
  const discovered = new Set<string>(seedUrls.map((u) => normalizeUrl(u, origin)));
  const queue = [...discovered];
  let head = 0;
  while (head < queue.length && discovered.size < maxUrls) {
    const url = queue[head++];
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 3,
        validateStatus: (s) => s === 200,
        responseType: "text",
      });
      if (typeof res.data !== "string") continue;
      const links = extractInternalLinks(res.data, origin);
      for (const link of links) {
        if (discovered.size >= maxUrls) break;
        try {
          if (new URL(link).origin === origin && !discovered.has(link)) {
            discovered.add(link);
            queue.push(link);
          }
        } catch {
          // skip
        }
      }
    } catch {
      // skip failed page
    }
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return discovered;
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
    useLinkCrawl = false,
    fetchPageDetails = false,
  } = options;

  const origin = new URL(baseUrl).origin;
  const allUrls: string[] = [];
  const sitemapUrlSet = new Set<string>();
  let crawl_mode: "sitemap" | "crawl" | "hybrid" = "sitemap";

  if (useSitemapsFirst) {
    for (const candidate of sitemapCandidates(baseUrl)) {
      try {
        const chunks = await fetchSitemapUrls(candidate, { maxUrls });
        for (const c of chunks) {
          for (const u of c.urls) {
            try {
              const norm = normalizeUrl(u, origin);
              if (new URL(norm).origin === origin) {
                allUrls.push(norm);
                sitemapUrlSet.add(norm);
              }
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

  let linkCrawlSet: Set<string> | null = null;
  if (useLinkCrawl) {
    const seeds = allUrls.length > 0 ? [baseUrl, ...allUrls.slice(0, 30)] : [baseUrl];
    linkCrawlSet = await linkCrawlDiscover(seeds, origin, maxUrls, crawlDelayMs);
    for (const u of linkCrawlSet) {
      if (!sitemapUrlSet.has(u)) allUrls.push(u);
    }
    if (sitemapUrlSet.size > 0 && linkCrawlSet.size > 0) crawl_mode = "hybrid";
    else if (linkCrawlSet.size > 0) crawl_mode = "crawl";
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
    const fromSitemap = sitemapUrlSet.has(url);
    const fromLinkCrawl = linkCrawlSet?.has(url) ?? false;
    const source: "sitemap" | "crawl" | "both" =
      fromSitemap && fromLinkCrawl ? "both" : fromLinkCrawl ? "crawl" : "sitemap";
    records.push({
      url,
      normalized_url: normalizeUrl(url, origin),
      path,
      status,
      type,
      source,
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
