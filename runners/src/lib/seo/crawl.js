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
/**
 * Fetch sitemap index or single sitemap and extract all <loc> URLs.
 */
async function fetchSitemapUrls(sitemapUrl, options) {
    const res = await axios.get(sitemapUrl, {
        timeout: 15000,
        maxRedirects: 3,
        validateStatus: (s) => s === 200,
        responseType: "text",
    });
    const xml = res.data;
    const parsed = await parseStringPromise(xml);
    const out = [];
    // Sitemap index: <sitemapindex><sitemap><loc>...
    const sitemapIndex = parsed?.sitemapindex?.sitemap;
    if (Array.isArray(sitemapIndex)) {
        const childLocs = sitemapIndex
            .map((s) => s?.loc?.[0])
            .filter(Boolean);
        for (const loc of childLocs.slice(0, 20)) {
            try {
                const child = await fetchSitemapUrls(loc, options);
                for (const c of child)
                    out.push(c);
            }
            catch {
                // skip failed child sitemap
            }
        }
        return out;
    }
    // URL set: <urlset><url><loc>...
    const urlset = parsed?.urlset?.url;
    if (Array.isArray(urlset)) {
        const urls = urlset
            .map((u) => u?.loc?.[0])
            .filter(Boolean);
        out.push({ urls: urls.slice(0, options.maxUrls), parent: sitemapUrl });
        return out;
    }
    return out;
}
/**
 * Try common sitemap URLs for a base URL (generic + WordPress 5.5+).
 */
function sitemapCandidates(baseUrl) {
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
function extractInternalLinks(html, origin) {
    const out = [];
    const hrefRe = /<a\s[^>]*\bhref=["']([^"'#]+)(?:#|["'])/gi;
    let m;
    while ((m = hrefRe.exec(html)) !== null) {
        const raw = m[1].trim();
        if (!raw || /^(?:mailto|tel|javascript):/i.test(raw))
            continue;
        try {
            const u = new URL(raw, origin);
            if (u.origin !== origin || !/^https?:$/i.test(u.protocol))
                continue;
            const norm = normalizeUrl(u.href, origin);
            out.push(norm);
        }
        catch {
            // skip invalid
        }
    }
    return out;
}
/**
 * BFS link-following crawl: start from seed URLs, fetch each page, extract same-origin links, add to queue; stop at maxUrls or when queue is empty.
 * Returns HTTP status for every URL we actually requested so the second pass can skip duplicate HEAD/GET when not fetching page details.
 */
async function linkCrawlDiscover(seedUrls, origin, maxUrls, crawlDelayMs) {
    const pauseMs = crawlDelayMs <= 0 ? 0 : Math.min(crawlDelayMs, LINK_CRAWL_DELAY_CAP_MS);
    const discovered = new Set(seedUrls.map((u) => normalizeUrl(u, origin)));
    const statusByUrl = new Map();
    const queue = [...discovered];
    let head = 0;
    while (head < queue.length && discovered.size < maxUrls) {
        const url = queue[head++];
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                maxRedirects: 3,
                validateStatus: () => true,
                responseType: "text",
            });
            statusByUrl.set(url, res.status);
            if (res.status === 200 && typeof res.data === "string") {
                const links = extractInternalLinks(res.data, origin);
                for (const link of links) {
                    if (discovered.size >= maxUrls)
                        break;
                    try {
                        if (new URL(link).origin === origin && !discovered.has(link)) {
                            discovered.add(link);
                            queue.push(link);
                        }
                    }
                    catch {
                        // skip
                    }
                }
            }
        }
        catch {
            statusByUrl.set(url, 0);
        }
        if (pauseMs > 0)
            await new Promise((r) => setTimeout(r, pauseMs));
    }
    return { discovered, statusByUrl };
}
/**
 * Crawl site: sitemap-first, collect URLs, optionally fetch each for status and basic metadata.
 */
export async function crawlSite(options) {
    const { baseUrl, crawlDelayMs = DEFAULT_DELAY_MS, maxUrls = DEFAULT_MAX_URLS, useSitemapsFirst = true, useLinkCrawl = false, fetchPageDetails = false, } = options;
    const origin = new URL(baseUrl).origin;
    const allUrls = [];
    const sitemapUrlSet = new Set();
    let crawl_mode = "sitemap";
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
                        }
                        catch {
                            // skip invalid
                        }
                    }
                }
                if (allUrls.length > 0)
                    break;
            }
            catch {
                continue;
            }
        }
    }
    let linkCrawlSet = null;
    /** Status from link-phase GET; reused below to avoid a second HEAD/GET per URL when fetchPageDetails is false. */
    let linkPhaseStatusByUrl = null;
    if (useLinkCrawl) {
        const seeds = allUrls.length > 0 ? [baseUrl, ...allUrls.slice(0, 30)] : [baseUrl];
        const linkResult = await linkCrawlDiscover(seeds, origin, maxUrls, crawlDelayMs);
        linkCrawlSet = linkResult.discovered;
        linkPhaseStatusByUrl = linkResult.statusByUrl;
        for (const u of linkCrawlSet) {
            if (!sitemapUrlSet.has(u))
                allUrls.push(u);
        }
        if (sitemapUrlSet.size > 0 && linkCrawlSet.size > 0)
            crawl_mode = "hybrid";
        else if (linkCrawlSet.size > 0)
            crawl_mode = "crawl";
    }
    const uniqueUrls = [...new Set(allUrls)].slice(0, maxUrls);
    if (uniqueUrls.length === 0) {
        uniqueUrls.push(normalizeUrl(baseUrl));
        crawl_mode = "crawl";
    }
    const records = [];
    const byType = {};
    const statusCounts = {};
    for (let i = 0; i < uniqueUrls.length; i++) {
        const url = uniqueUrls[i];
        const path = getPath(url);
        const type = classifyUrlType(path, new URL(baseUrl).pathname);
        let status = 200;
        let title = null;
        let meta = null;
        let h1 = null;
        let canonical = null;
        let indexable = true;
        let wordCount = null;
        let schemaTypes = [];
        let imageCount = null;
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
                    if (html.includes('noindex') || html.includes("noindex"))
                        indexable = false;
                    wordCount = (html.replace(/<[^>]+>/g, " ").match(/\S+/g) || []).length;
                    const schemaMatches = html.matchAll(/application\/ld\+json[^>]*>([^<]+)</gi);
                    for (const m of schemaMatches) {
                        try {
                            const j = JSON.parse(m[1]);
                            const t = j["@type"] ?? j["@graph"]?.[0]?.["@type"];
                            if (t)
                                schemaTypes.push(t);
                        }
                        catch {
                            // ignore
                        }
                    }
                    imageCount = (html.match(/<img\s/gi) || []).length;
                }
            }
            catch {
                status = 0;
                statusCounts["0"] = (statusCounts["0"] ?? 0) + 1;
            }
            if (i < uniqueUrls.length - 1 && crawlDelayMs > 0) {
                await new Promise((r) => setTimeout(r, crawlDelayMs));
            }
        }
        else if (linkPhaseStatusByUrl?.has(url)) {
            status = linkPhaseStatusByUrl.get(url) ?? 0;
            statusCounts[String(status)] = (statusCounts[String(status)] ?? 0) + 1;
        }
        else {
            try {
                const res = await axios.head(url, { timeout: 8000, maxRedirects: 3, validateStatus: () => true });
                status = res.status;
            }
            catch {
                try {
                    const res = await axios.get(url, { timeout: 8000, maxRedirects: 3, validateStatus: () => true });
                    status = res.status;
                }
                catch {
                    status = 0;
                }
            }
            statusCounts[String(status)] = (statusCounts[String(status)] ?? 0) + 1;
        }
        byType[type] = (byType[type] ?? 0) + 1;
        const fromSitemap = sitemapUrlSet.has(url);
        const fromLinkCrawl = linkCrawlSet?.has(url) ?? false;
        const source = fromSitemap && fromLinkCrawl ? "both" : fromLinkCrawl ? "crawl" : "sitemap";
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
//# sourceMappingURL=crawl.js.map