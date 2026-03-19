"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  PageFrame,
  Stack,
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Button,
  Input,
  Checkbox,
  Badge,
  DataTable,
  TableFrame,
  Select,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import * as api from "@/lib/api";
import type { SeoMigrationCrawlResult, SeoGscReport, SeoGa4Report, BrandProfileRow } from "@/lib/api";
import { formatApiError } from "@/lib/api";

const STEPS = [
  { id: 1, title: "Crawl source site", description: "Map every live URL (sitemap + optional link-following for WordPress)." },
  { id: 2, title: "GSC & analytics", description: "Pull Search Console and GA4 to see which pages drive traffic and rankings." },
  { id: 3, title: "Connect platforms & migrate data", description: "Connect WooCommerce (source) and Shopify (destination) APIs; migrate products, categories, customers, redirects, discounts, blogs & pages." },
  { id: 4, title: "Keyword strategy", description: "Map search demand; decide which pages to keep, consolidate, or elevate." },
  { id: 5, title: "Prioritize pages", description: "Define collections, products, and content for the new site and hierarchy." },
  { id: 6, title: "Redirect map", description: "Map every old URL to the best new destination (SEO priority)." },
  { id: 7, title: "Validate destinations", description: "Ensure high-value URLs don’t redirect to weak or irrelevant pages." },
  { id: 8, title: "Internal linking", description: "Plan homepage, header, footer, and contextual links to key pages." },
  { id: 9, title: "Launch", description: "Checklist and domain cutover only when redirects and pages are confirmed." },
] as const;

const MIGRATION_ENTITIES = [
  { id: "products", label: "Products", source: "from WooCommerce" },
  { id: "categories", label: "Categories (→ Collections)", source: "from WooCommerce" },
  { id: "customers", label: "Customers", source: "from WooCommerce" },
  { id: "redirects", label: "Redirects", source: "from product/category URLs" },
  { id: "discounts", label: "Discounts", source: "from WooCommerce coupons" },
  { id: "blogs", label: "Blog posts", source: "from WordPress" },
  { id: "pages", label: "Pages", source: "from WordPress" },
] as const;

// Steps 4–9: in-memory strategy state (driven by crawl + GSC/GA4 from 1–3)
type KeywordAction = "keep" | "consolidate" | "drop";
type KeywordRow = { path: string; type: string; clicks: number; sessions: number; primaryKeyword: string; action: KeywordAction; consolidateInto: string };
type PagePlanRow = { path: string; type: "collection" | "product" | "landing" | "blog" | "page"; priority: "high" | "medium" | "low"; placement: "nav" | "footer" | "deep" };
type RedirectStatus = "301" | "302" | "drop" | "consolidate";
type RedirectRow = { old_url: string; new_url: string; status: RedirectStatus; destinationOk?: boolean; issue?: string };
type InternalLinkRow = { from_url: string; to_url: string; anchor: string; placement: "homepage" | "header" | "footer" | "contextual" };

const CRAWL_CACHE_KEY = "seo-migration-crawl-cache";
function normalizeCrawlCacheKey(url: string): string {
  try {
    const u = url.trim().toLowerCase().replace(/\/+$/, "") || "https://";
    return new URL(u.startsWith("http") ? u : `https://${u}`).origin + new URL(u.startsWith("http") ? u : `https://${u}`).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Infer URL type from path when crawl didn't provide it or returned "page" (e.g. GA4-only rows, product-tag). */
function inferTypeFromPath(path: string): string {
  const p = path.toLowerCase().replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "") || "";
  if (/\/(product|prod)\//.test("/" + p) || /^product\//.test(p) || /^prod\//.test(p)) return "product";
  if (/\/(products)\//.test("/" + p) || /^products\//.test(p)) return "product";
  if (/\/(category|categories|product-category)\//.test("/" + p) || /^product-category\//.test(p)) return "category";
  if (/\/(tag|tags)\//.test("/" + p) || /^tag\//.test(p)) return "tag";
  if (/\/(blog|blogs|post|posts)\//.test("/" + p) || /^blog\//.test(p)) return "post";
  return "page";
}

/** Normalize full URL or path to pathname only (no query, no hash) so GA4/GSC rows match. */
function normalizeUrlToPath(urlOrPath: string, baseOrigin = "https://example.com"): string {
  const raw = (urlOrPath || "").trim();
  if (!raw) return "/";
  try {
    let url: URL;
    if (raw.startsWith("http")) {
      url = new URL(raw);
    } else if (raw.startsWith("/")) {
      url = new URL(raw, baseOrigin);
    } else {
      // GA4 fullPageUrl often returns "host.com/path" (no scheme) — treat as URL so pathname is /path not /host.com/path
      url = new URL("https://" + raw.replace(/^\/*/, ""));
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return path;
  } catch {
    const pathOnly = raw.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
    return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  }
}

/** Return true only if urlOrPath is same host as sourceOrigin (or is a path-only string, treated as same origin). */
function isSameOrigin(urlOrPath: string, sourceOrigin: string): boolean {
  const raw = (urlOrPath || "").trim();
  if (!raw) return false;
  if (!raw.startsWith("http")) return true; // path-only, assume same origin
  try {
    const sourceHost = new URL(sourceOrigin.startsWith("http") ? sourceOrigin : `https://${sourceOrigin}`).hostname.replace(/^www\./, "");
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    return host === sourceHost;
  } catch {
    return false;
  }
}

/** Collapse pagination and trailing segments like /page/2 so we dedupe e.g. /tag/foo and /tag/foo/page/2. */
function toCanonicalPath(path: string): string {
  let p = (path || "/").replace(/\/+$/, "") || "/";
  p = p.replace(/\/page\/\d+$/i, "").replace(/\/+$/, "") || "/";
  return p;
}
function getCrawlCache(): Record<string, { crawledAt: string; result: SeoMigrationCrawlResult }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CRAWL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function setCrawlCacheEntry(key: string, result: SeoMigrationCrawlResult): void {
  if (typeof window === "undefined") return;
  try {
    const cache = getCrawlCache();
    cache[key] = { crawledAt: new Date().toISOString(), result };
    localStorage.setItem(CRAWL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

export default function SeoMigrationWizardPage() {
  const [step, setStep] = useState(1);

  // Brand (step 1): select brand so step 2 can use its Google/GA4
  const [brands, setBrands] = useState<BrandProfileRow[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [brandGoogle, setBrandGoogle] = useState<{ connected: boolean; ga4_property_id?: string } | null>(null);
  const [brandShopify, setBrandShopify] = useState<{ connected: boolean; shop_domain?: string } | null>(null);
  const ga4AutoFetchedRef = useRef(false);

  // Step 1: Crawl (with cache per source URL)
  const [sourceUrl, setSourceUrl] = useState("https://stigmahemp.com");
  const [useLinkCrawl, setUseLinkCrawl] = useState(true);
  const [maxUrls, setMaxUrls] = useState(2000);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<SeoMigrationCrawlResult | null>(null);
  const [crawlCachedAt, setCrawlCachedAt] = useState<string | null>(null);

  // Step 2: GSC / GA4
  const [gscSiteUrl, setGscSiteUrl] = useState("https://stigmahemp.com");
  const [gscLoading, setGscLoading] = useState(false);
  const [gscError, setGscError] = useState<string | null>(null);
  const [gscResult, setGscResult] = useState<SeoGscReport | null>(null);
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Error, setGa4Error] = useState<string | null>(null);
  const [ga4Result, setGa4Result] = useState<SeoGa4Report | null>(null);

  // Step 3: Connect platforms & migrate data (WooCommerce → Shopify, Matrixify-style)
  const [wooServer, setWooServer] = useState("");
  const [wooConsumerKey, setWooConsumerKey] = useState("");
  const [wooConsumerSecret, setWooConsumerSecret] = useState("");
  const [migrationEntities, setMigrationEntities] = useState<Set<string>>(new Set(["products", "categories", "redirects"]));
  const [migrationDryRunLoading, setMigrationDryRunLoading] = useState(false);
  const [migrationDryRunError, setMigrationDryRunError] = useState<string | null>(null);
  const [migrationDryRunResult, setMigrationDryRunResult] = useState<{ counts?: Record<string, number>; message?: string } | null>(null);
  const [migrationRunLoading, setMigrationRunLoading] = useState(false);
  const [migrationRunError, setMigrationRunError] = useState<string | null>(null);
  const [migrationRunResult, setMigrationRunResult] = useState<{ job_id?: string; message?: string } | null>(null);

  // Step 4: Keyword strategy (merged URL list + theme/action)
  const [keywordRows, setKeywordRows] = useState<KeywordRow[]>([]);
  const [keywordVolumeMap, setKeywordVolumeMap] = useState<Record<string, number>>({});
  const [keywordVolumeLoading, setKeywordVolumeLoading] = useState(false);
  const [keywordVolumeError, setKeywordVolumeError] = useState<string | null>(null);
  const [targetBaseUrl, setTargetBaseUrl] = useState(""); // New site base URL for steps 5–6
  // Step 5: Page plan
  const [pagePlan, setPagePlan] = useState<PagePlanRow[]>([]);
  // Step 6–7: Redirect map (with optional validation flags)
  const [redirectMap, setRedirectMap] = useState<RedirectRow[]>([]);
  // Step 8: Internal linking
  const [internalLinkPlan, setInternalLinkPlan] = useState<InternalLinkRow[]>([]);
  // Step 9: Launch checklist
  const [launchChecklist, setLaunchChecklist] = useState({
    redirectsImplemented: false,
    pagesCreated: false,
    metadataSet: false,
    internalLinksInPlace: false,
    fourOhFoursHandled: false,
  });
  const [launchAcked, setLaunchAcked] = useState(false);

  const toggleMigrationEntity = (id: string) => {
    setMigrationEntities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Load brands for dropdown
  useEffect(() => {
    api.getBrandProfiles({ status: "active", limit: 200 }).then((r) => setBrands(r.items)).catch(() => setBrands([]));
  }, []);

  // Restore cached crawl for current source URL on load and when URL changes so the table shows without re-running crawl
  useLayoutEffect(() => {
    if (typeof window === "undefined" || !sourceUrl.trim()) return;
    const key = normalizeCrawlCacheKey(sourceUrl);
    const cache = getCrawlCache();
    const entry = cache[key];
    if (entry?.result) {
      setCrawlResult(entry.result);
      setCrawlCachedAt(entry.crawledAt);
      setCrawlError(null);
    } else {
      setCrawlResult(null);
      setCrawlCachedAt(null);
    }
  }, [sourceUrl]);

  // When brand changes, load Google/GA4 and Shopify status for steps 2 and 3
  useEffect(() => {
    ga4AutoFetchedRef.current = false;
    if (!brandId) {
      setBrandGoogle(null);
      setBrandShopify(null);
      return;
    }
    api.getBrandGoogleConnected(brandId).then(setBrandGoogle).catch(() => setBrandGoogle(null));
    api.getBrandShopifyConnected(brandId).then(setBrandShopify).catch(() => setBrandShopify(null));
  }, [brandId]);

  // When entering step 2, sync GSC site URL from crawl source so Fetch GSC uses same URL as crawl (required for keywords to match)
  useEffect(() => {
    if (step !== 2) return;
    const url = (sourceUrl || "").trim();
    if (url) setGscSiteUrl(url);
    if (!brandId || !brandGoogle?.connected || !brandGoogle?.ga4_property_id || ga4AutoFetchedRef.current) return;
    ga4AutoFetchedRef.current = true;
    setGa4Loading(true);
    setGa4Error(null);
    api
      .seoGa4Report({ brand_id: brandId, row_limit: 500 })
      .then(setGa4Result)
      .catch((e) => setGa4Error(formatApiError(e)))
      .finally(() => setGa4Loading(false));
  }, [step, brandId, brandGoogle?.connected, brandGoogle?.ga4_property_id, sourceUrl]);

  // Build keyword rows from crawl + GA4 union (no duplicates) with GSC/GA4 stats. Used by step 4 seed and Reset button.
  const buildKeywordRowsFromCrawlAndGa4 = (): KeywordRow[] => {
    const hasCrawl = (crawlResult?.urls?.length ?? 0) > 0;
    const hasGa4 = (ga4Result?.pages?.length ?? 0) > 0;
    if (!hasCrawl && !hasGa4) return [];
    const baseOrigin = (sourceUrl || "").trim().replace(/\/+$/, "") || "https://example.com";
    if (!baseOrigin.startsWith("http")) {
      try {
        new URL(baseOrigin);
      } catch {
        // leave as-is for path-only sourceUrl
      }
    }
    const safeBase = baseOrigin.startsWith("http") ? baseOrigin : "https://example.com";
    const gscByPath = new Map<string, { clicks: number; impressions: number }>();
    (gscResult?.pages ?? []).forEach((p) => {
      const path = toCanonicalPath(normalizeUrlToPath(p.url || "", safeBase));
      const existing = gscByPath.get(path);
      gscByPath.set(path, {
        clicks: (existing?.clicks ?? 0) + (p.clicks ?? 0),
        impressions: (existing?.impressions ?? 0) + (p.impressions ?? 0),
      });
    });
    const ga4ByPath = new Map<string, number>();
    (ga4Result?.pages ?? []).forEach((p) => {
      const raw = p.page_path ?? p.full_page_url ?? "";
      if (!raw || !isSameOrigin(raw, safeBase)) return;
      const path = normalizeUrlToPath(raw, safeBase);
      const canonical = toCanonicalPath(path);
      ga4ByPath.set(canonical, (ga4ByPath.get(canonical) ?? 0) + (p.sessions ?? 0));
    });
    const pathToType = new Map<string, string>();
    (crawlResult?.urls ?? []).forEach((u) => {
      const raw = u.path || "/";
      if (!isSameOrigin(raw, safeBase)) return;
      const p = toCanonicalPath(normalizeUrlToPath(raw, safeBase));
      const inferred = inferTypeFromPath(raw);
      pathToType.set(p, (u.type && u.type !== "page") ? u.type : inferred);
    });
    const pathsSeen = new Set<string>();
    const rows: KeywordRow[] = [];
    const addPath = (path: string, type: string) => {
      const norm = toCanonicalPath(path.replace(/\/+$/, "") || "/");
      if (pathsSeen.has(norm)) return;
      pathsSeen.add(norm);
      const gsc = gscByPath.get(norm);
      const sessions = ga4ByPath.get(norm) ?? 0;
      rows.push({
        path: norm,
        type,
        clicks: gsc?.clicks ?? 0,
        sessions,
        primaryKeyword: "",
        action: "keep" as KeywordAction,
        consolidateInto: "",
      });
    };
    (crawlResult?.urls ?? []).forEach((u) => {
      const raw = u.path || "/";
      if (!isSameOrigin(raw, safeBase)) return;
      const path = normalizeUrlToPath(raw, safeBase);
      const inferred = inferTypeFromPath(path);
      addPath(path, (u.type && u.type !== "page") ? u.type : inferred);
    });
    (ga4Result?.pages ?? []).forEach((p) => {
      const raw = p.page_path ?? p.full_page_url ?? "";
      if (!raw || !isSameOrigin(raw, safeBase)) return;
      const path = normalizeUrlToPath(raw, safeBase);
      const norm = toCanonicalPath(path);
      if (pathsSeen.has(norm)) return;
      addPath(norm, pathToType.get(norm) ?? inferTypeFromPath(norm));
    });
    rows.sort((a, b) => a.path.localeCompare(b.path));
    return rows;
  };

  // Step 4: Map path → list of GSC keywords (query + clicks/impressions) for Traffic keywords column. Use canonical path so /tag/foo and /tag/foo/page/2 merge.
  const pathToGscKeywords = useMemo(() => {
    const baseOrigin = (sourceUrl || "").trim().startsWith("http") ? (sourceUrl || "").trim().replace(/\/+$/, "") : "https://example.com";
    const m = new Map<string, Array<{ query: string; clicks: number; impressions: number }>>();
    (gscResult?.page_queries ?? []).forEach((pq) => {
      const path = normalizeUrlToPath(pq.page || "", baseOrigin);
      const norm = toCanonicalPath(path);
      if (!m.has(norm)) m.set(norm, []);
      m.get(norm)!.push({ query: pq.query, clicks: pq.clicks, impressions: pq.impressions });
    });
    return m;
  }, [gscResult?.page_queries, sourceUrl]);

  // Step 4: All unique keywords from GSC, GA4 Search Console, or Primary Keyword column (for volume fetch and display)
  const allUniqueGscKeywords = useMemo(() => {
    const set = new Set<string>();
    pathToGscKeywords.forEach((list) => list.forEach((k) => set.add((k.query || "").trim())));
    (ga4Result?.search_console_queries ?? []).forEach((q) => set.add((q.query || "").trim()));
    keywordRows.forEach((r) => {
      const kw = (r.primaryKeyword || "").trim();
      if (kw) set.add(kw);
    });
    return Array.from(set).filter(Boolean);
  }, [pathToGscKeywords, ga4Result?.search_console_queries, keywordRows]);

  const fetchKeywordVolumes = async () => {
    if (allUniqueGscKeywords.length === 0) return;
    setKeywordVolumeLoading(true);
    setKeywordVolumeError(null);
    try {
      const result = await api.seoKeywordVolume({ keywords: allUniqueGscKeywords });
      const map: Record<string, number> = {};
      (result.volumes ?? []).forEach((v) => {
        map[v.keyword] = v.monthly_search_volume;
      });
      setKeywordVolumeMap((prev) => ({ ...prev, ...map }));
      if (result.error) setKeywordVolumeError(result.error);
    } catch (e) {
      setKeywordVolumeError(formatApiError(e));
    } finally {
      setKeywordVolumeLoading(false);
    }
  };

  // Step 4: Seed keyword rows from crawl + GA4 union when entering step 4 (only if keywordRows empty)
  useEffect(() => {
    const hasCrawl = (crawlResult?.urls?.length ?? 0) > 0;
    const hasGa4 = (ga4Result?.pages?.length ?? 0) > 0;
    if (step !== 4 || (!hasCrawl && !hasGa4) || keywordRows.length > 0) return;
    setKeywordRows(buildKeywordRowsFromCrawlAndGa4());
  }, [step, crawlResult?.urls, gscResult?.pages, ga4Result?.pages]);

  // Build redirect map from crawl + GA4 union (no duplicates, same-origin only, canonical paths).
  const buildRedirectMapFromCrawlAndGa4 = (): RedirectRow[] => {
    const hasCrawl = (crawlResult?.urls?.length ?? 0) > 0;
    const hasGa4 = (ga4Result?.pages?.length ?? 0) > 0;
    if (!hasCrawl && !hasGa4) return [];
    const base = (sourceUrl || "").replace(/\/+$/, "");
    const safeBase = base.startsWith("http") ? base : "https://example.com";
    const normalize = (url: string): string => {
      const u = url.trim().toLowerCase().replace(/\/+$/, "") || "/";
      try {
        const full = u.startsWith("http") ? u : `${base || "https://example.com"}${u.startsWith("/") ? u : `/${u}`}`;
        const parsed = new URL(full);
        const path = toCanonicalPath(parsed.pathname || "/");
        return `${parsed.origin}${path}`;
      } catch {
        return u;
      }
    };
    const seen = new Map<string, string>();
    const add = (oldUrl: string) => {
      if (!isSameOrigin(oldUrl, safeBase)) return;
      const key = normalize(oldUrl);
      if (seen.has(key)) return;
      seen.set(key, oldUrl);
    };
    if (hasCrawl) {
      crawlResult!.urls.forEach((u) => {
        const raw = u.path || "/";
        const full = raw.startsWith("http") ? raw : base ? `${base}${raw.startsWith("/") ? raw : `/${raw}`}` : raw;
        add(full);
      });
    }
    if (hasGa4) {
      ga4Result!.pages.forEach((p) => {
        const raw = (p.full_page_url ?? p.page_path ?? "").trim();
        if (!raw) return;
        const fullUrl = raw.startsWith("http") ? raw : raw.startsWith("/") ? safeBase + raw : "https://" + raw;
        if (!isSameOrigin(fullUrl, safeBase)) return;
        add(fullUrl);
      });
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, old_url]) => ({ old_url, new_url: "", status: "301" as RedirectStatus }));
  };

  // Step 6: Seed redirect map from crawl + GA4 union when entering step 6 (only if redirectMap empty)
  useEffect(() => {
    if (step !== 6 || redirectMap.length > 0) return;
    const rows = buildRedirectMapFromCrawlAndGa4();
    if (rows.length === 0) return;
    setRedirectMap(rows);
  }, [step, crawlResult?.urls, ga4Result?.pages, sourceUrl]);

  const runCrawl = async () => {
    setCrawlLoading(true);
    setCrawlError(null);
    setCrawlResult(null);
    setCrawlCachedAt(null);
    try {
      const result = await api.seoMigrationCrawl({
        source_url: sourceUrl.trim(),
        use_link_crawl: useLinkCrawl,
        max_urls: maxUrls,
      });
      setCrawlResult(result);
      const cachedAt = new Date().toISOString();
      setCrawlCachedAt(cachedAt);
      setCrawlCacheEntry(normalizeCrawlCacheKey(sourceUrl.trim()), result);
    } catch (e) {
      setCrawlError(formatApiError(e));
    } finally {
      setCrawlLoading(false);
    }
  };

  const runGsc = async () => {
    if (!gscSiteUrl.trim()) {
      setGscError("Site URL is required.");
      return;
    }
    setGscLoading(true);
    setGscError(null);
    setGscResult(null);
    try {
      const result = await api.seoGscReport({
        site_url: gscSiteUrl.trim(),
        date_range: "last28days",
        row_limit: 500,
        ...(brandId ? { brand_id: brandId } : {}),
      });
      setGscResult(result);
    } catch (e) {
      setGscError(formatApiError(e));
    } finally {
      setGscLoading(false);
    }
  };

  const runGa4 = async () => {
    const useBrand = !!brandId;
    if (!brandId && !ga4PropertyId.trim()) {
      setGa4Error("Select a brand (with GA4 connected) in step 1, or enter a GA4 property ID.");
      return;
    }
    setGa4Loading(true);
    setGa4Error(null);
    setGa4Result(null);
    try {
      const result = await api.seoGa4Report(
        brandId ? { brand_id: brandId, row_limit: 500 } : { property_id: ga4PropertyId.trim(), row_limit: 500 },
      );
      setGa4Result(result);
    } catch (e) {
      setGa4Error(formatApiError(e));
    } finally {
      setGa4Loading(false);
    }
  };

  const runMigrationDryRun = async () => {
    if (!wooServer.trim() || !wooConsumerKey.trim() || !wooConsumerSecret.trim()) {
      setMigrationDryRunError("WooCommerce server URL, consumer key, and consumer secret are required.");
      return;
    }
    setMigrationDryRunLoading(true);
    setMigrationDryRunError(null);
    setMigrationDryRunResult(null);
    try {
      const result = await api.seoMigrationDryRun({
        woo_server: wooServer.trim(),
        woo_consumer_key: wooConsumerKey.trim(),
        woo_consumer_secret: wooConsumerSecret.trim(),
        entities: Array.from(migrationEntities),
      });
      setMigrationDryRunResult(result);
    } catch (e) {
      setMigrationDryRunError(formatApiError(e));
    } finally {
      setMigrationDryRunLoading(false);
    }
  };

  const runMigrationRun = async () => {
    if (!wooServer.trim() || !wooConsumerKey.trim() || !wooConsumerSecret.trim()) {
      setMigrationRunError("WooCommerce credentials are required.");
      return;
    }
    if (!brandId || !brandShopify?.connected) {
      setMigrationRunError("Select a brand in step 1 and connect Shopify for that brand in Brands → Edit brand → Shopify.");
      return;
    }
    setMigrationRunLoading(true);
    setMigrationRunError(null);
    setMigrationRunResult(null);
    try {
      const result = await api.seoMigrationRun({
        woo_server: wooServer.trim(),
        woo_consumer_key: wooConsumerKey.trim(),
        woo_consumer_secret: wooConsumerSecret.trim(),
        brand_id: brandId,
        entities: Array.from(migrationEntities),
      });
      setMigrationRunResult(result);
    } catch (e) {
      setMigrationRunError(formatApiError(e));
    } finally {
      setMigrationRunLoading(false);
    }
  };

  const shopifyCredentialsOk = Boolean(brandId && brandShopify?.connected);

  const crawlColumns: Column<SeoMigrationCrawlResult["urls"][0]>[] = [
    { key: "path", header: "Path", render: (r) => <code className="text-body-small">{r.path || "/"}</code> },
    { key: "type", header: "Type", render: (r) => <Badge variant="neutral">{r.type}</Badge> },
    { key: "status", header: "Status", render: (r) => r.status },
    { key: "source", header: "Source", render: (r) => r.source },
  ];

  type Ga4Page = SeoGa4Report["pages"][number];
  const ga4Columns: Column<Ga4Page>[] = [
    { key: "page_path", header: "Path", render: (r) => <code className="text-body-small">{r.page_path ?? r.full_page_url ?? "—"}</code> },
    { key: "sessions", header: "Sessions", render: (r) => r.sessions.toLocaleString() },
    { key: "screen_page_views", header: "Page views", render: (r) => (r.screen_page_views ?? "—").toString() },
    { key: "user_engagement_duration", header: "Engagement (s)", render: (r) => (r.user_engagement_duration != null ? Math.round(Number(r.user_engagement_duration)).toLocaleString() : "—") },
  ];

  return (
    <PageFrame className="min-w-0 overflow-x-hidden">
      <Stack className="min-w-0">
        <PageHeader
          title="SEO Migration Wizard"
          description="WordPress → Shopify (or any platform). Crawl source, pull GSC/GA4, then plan keyword strategy, redirects, and launch."
        />
        <p className="text-body-small text-fg-muted">
          <Link href="/initiatives" className="text-brand-600 hover:underline">Initiatives</Link>
          {" · "}
          <Link href="/runs?intent_type=seo_migration_audit" className="text-brand-600 hover:underline">SEO audit runs</Link>
        </p>

        {/* Stepper */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-4">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`rounded-lg border px-3 py-2 text-body-small font-medium transition ${
                step === s.id
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-border hover:bg-fg-muted/5"
              }`}
            >
              {s.id}. {s.title}
            </button>
          ))}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold">{STEPS[0].title}</h3>
              <p className="text-body-small text-fg-muted mt-1">{STEPS[0].description}</p>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label className="mb-1 block text-body-small font-medium">Brand</label>
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-border bg-bg px-3 py-2 text-body-small focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">— Select a brand (optional, for GSC/GA4 in step 2) —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-body-small text-fg-muted">
                  Selecting a brand with Google connected lets step 2 auto-fetch GA4 and use its OAuth for GSC.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-body-small font-medium">Source URL (e.g. WordPress)</label>
                  <Input
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://stigmahemp.com"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-body-small font-medium">Max URLs</label>
                  <Input
                    type="number"
                    value={maxUrls}
                    onChange={(e) => setMaxUrls(Number(e.target.value) || 2000)}
                    min={1}
                    max={5000}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Checkbox
                  id="use_link_crawl"
                  checked={useLinkCrawl}
                  onChange={(e) => setUseLinkCrawl((e.target as HTMLInputElement).checked)}
                />
                <label htmlFor="use_link_crawl" className="text-body-small">
                  Use link-following crawl (discovers pages not in sitemap, e.g. WordPress)
                </label>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={runCrawl}
                    disabled={crawlLoading || !sourceUrl.trim()}
                  >
                    {crawlLoading ? "Crawling…" : crawlResult ? "Refetch" : "Run crawl"}
                  </Button>
                  {crawlResult && crawlCachedAt && (
                    <span className="text-body-small text-fg-muted">
                      Cached {new Date(crawlCachedAt).toLocaleString()} — click Refetch for fresh data
                    </span>
                  )}
                  {crawlLoading && (
                    <span className="text-body-small text-fg-muted">
                      Crawl in progress — do not close this page
                    </span>
                  )}
                </div>
                {crawlLoading && (
                  <div className="w-full overflow-hidden rounded-full bg-fg-muted/20" role="progressbar" aria-label="Crawl in progress">
                    <div className="h-2 w-[30%] min-w-[30%] rounded-full bg-brand-500 animate-crawl-progress" />
                  </div>
                )}
                {crawlLoading && (
                  <p className="text-body-small text-fg-muted">
                    Fetching sitemaps and discovering URLs from <strong>{sourceUrl}</strong>. With link-following and {maxUrls} max URLs this can take <strong>1–5 minutes</strong>. The request is running on the server; you will see results when it finishes.
                  </p>
                )}
              </div>
              {crawlError && (
                <div className="mt-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                  {crawlError}
                </div>
              )}
              {crawlResult && (
                <div className="mt-4">
                  <p className="text-body-small text-fg-muted mb-2">
                    Found {crawlResult.stats.total_urls} URLs ({crawlResult.crawl_mode}). By type:{" "}
                    {Object.entries(crawlResult.stats.by_type)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ")}
                  </p>
                  <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
                    <TableFrame>
                      <DataTable
                        columns={crawlColumns}
                        data={crawlResult.urls}
                        keyExtractor={(r) => r.normalized_url}
                      />
                    </TableFrame>
                  </div>
                  <p className="mt-2 text-body-small text-fg-muted">
                    Showing all {crawlResult.urls.length} URLs. Scroll the table to see more.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Stack>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Google Search Console</h3>
                <p className="text-body-small text-fg-muted mt-1">Site URL (e.g. sc-domain:stigmahemp.com or https://stigmahemp.com/)</p>
              </CardHeader>
              <CardContent>
                <p className="text-body-small text-fg-muted mb-2">
                  Use the same site URL as your crawl (auto-filled below). Click <strong>Fetch GSC report</strong> to load pages, queries, and <strong>keywords per URL</strong> for Step 4. With a brand connected we use its Google account; otherwise the API uses service-account credentials (that account must have the site in Search Console).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={gscSiteUrl}
                    onChange={(e) => setGscSiteUrl(e.target.value)}
                    placeholder="https://stigmahemp.com"
                    className="max-w-md"
                  />
                  <Button variant="primary" onClick={runGsc} disabled={gscLoading}>
                    {gscLoading ? "Fetching…" : "Fetch GSC report"}
                  </Button>
                </div>
                {gscError && (
                  <div className="mt-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                    {gscError}
                  </div>
                )}
                {gscResult && (
                  <div className="mt-4">
                    <p className="text-body-small text-fg-muted">
                      {gscResult.pages?.length ?? 0} pages, {gscResult.queries?.length ?? 0} queries,{" "}
                      <strong>{(gscResult.page_queries?.length ?? 0)} keywords per URL</strong> (used in Step 4).
                      {gscResult.date_range && ` Range: ${gscResult.date_range.start} – ${gscResult.date_range.end}`}
                    </p>
                    {gscResult.error && (
                      <p className="text-body-small text-state-warning mt-1">{gscResult.error}</p>
                    )}
                    {!gscResult.error && (gscResult.page_queries?.length ?? 0) === 0 && (gscResult.pages?.length ?? 0) + (gscResult.queries?.length ?? 0) > 0 && (
                      <p className="text-body-small text-state-warning mt-1">No keywords per URL returned. Try the exact property URL from Search Console (e.g. <code className="bg-fg-muted/20 px-1">https://yoursite.com/</code> with or without trailing slash, or <code className="bg-fg-muted/20 px-1">sc-domain:yoursite.com</code> for domain property).</p>
                    )}
                    {!gscResult.error && (gscResult.pages?.length ?? 0) === 0 && (gscResult.queries?.length ?? 0) === 0 && (
                      <p className="text-body-small text-state-warning mt-1">No data. Check that the site URL matches your Search Console property exactly, and that the connected Google account (or service account) has access to this property in Search Console.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">GA4</h3>
                <p className="text-body-small text-fg-muted mt-1">
                  {brandGoogle?.connected && brandGoogle?.ga4_property_id
                    ? "Using the GA4 property connected for the selected brand. Data will load automatically or click to refresh."
                    : "Select a brand with Google + GA4 connected in step 1, or enter a GA4 property ID and use service-account OAuth."}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-2">
                  {!(brandGoogle?.connected && brandGoogle?.ga4_property_id) && (
                    <div className="min-w-[200px]">
                      <label className="mb-1 block text-body-small text-fg-muted">GA4 property ID (if no brand)</label>
                      <Input
                        value={ga4PropertyId}
                        onChange={(e) => setGa4PropertyId(e.target.value)}
                        placeholder="123456789"
                        className="w-full"
                      />
                    </div>
                  )}
                  <Button variant="primary" onClick={runGa4} disabled={ga4Loading}>
                    {ga4Loading ? "Fetching…" : brandGoogle?.connected && brandGoogle?.ga4_property_id ? "Fetch GA4 from brand" : "Fetch GA4 report"}
                  </Button>
                </div>
                {ga4Error && (
                  <div className="mt-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                    {ga4Error}
                  </div>
                )}
                {ga4Result && (
                  <div className="mt-4">
                    <p className="text-body-small text-fg-muted mb-2">
                      {ga4Result.pages?.length ?? 0} pages from GA4 property {ga4Result.property_id}.
                      {ga4Result.search_console_queries && ga4Result.search_console_queries.length > 0 && (
                        <> Search Console (via GA4): {ga4Result.search_console_queries.length} keywords.</>
                      )}
                    </p>
                    {ga4Result.search_console_error && (
                      <p className="text-body-small text-state-warning mt-1">GA4 keywords: {ga4Result.search_console_error} Link Search Console to this property (GA4 → Admin → Product links → Search Console) to pull keywords.</p>
                    )}
                    {ga4Result.error && (
                      <p className="text-body-small text-state-warning mb-2">{ga4Result.error}</p>
                    )}
                    {ga4Result.pages && ga4Result.pages.length > 0 && (
                      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
                        <TableFrame>
                          <DataTable
                            columns={ga4Columns}
                            data={ga4Result.pages}
                            keyExtractor={(r) => r.page_path ?? r.full_page_url ?? String(r.sessions)}
                          />
                        </TableFrame>
                      </div>
                    )}
                    <p className="mt-2 text-body-small text-fg-muted">
                      Showing all {ga4Result.pages?.length ?? 0} pages. Scroll the table to see more.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 3 && (
          <Stack>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">WordPress / WooCommerce (source)</h3>
                <p className="text-body-small text-fg-muted mt-1">
                  Use WooCommerce REST API v3. In WordPress: WooCommerce → Settings → Advanced → REST API → Add key (Read). Use the consumer key and secret below.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-body-small font-medium">Store URL (server)</label>
                    <Input
                      value={wooServer}
                      onChange={(e) => setWooServer(e.target.value)}
                      placeholder="https://your-woo-domain.com"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-body-small font-medium">Consumer key</label>
                    <Input
                      type="password"
                      value={wooConsumerKey}
                      onChange={(e) => setWooConsumerKey(e.target.value)}
                      placeholder="ck_..."
                      className="w-full"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-body-small font-medium">Consumer secret</label>
                    <Input
                      type="password"
                      value={wooConsumerSecret}
                      onChange={(e) => setWooConsumerSecret(e.target.value)}
                      placeholder="cs_..."
                      className="w-full"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Shopify (destination)</h3>
                <p className="text-body-small text-fg-muted mt-1">
                  Shopify is connected per brand. Each brand has its own app (Client ID + Secret) in <strong>Brands → Edit brand → Shopify</strong>. Select a brand in step 1 and connect its Shopify store there first.
                </p>
              </CardHeader>
              <CardContent>
                {brandId && brandShopify?.connected ? (
                  <div className="rounded-lg border border-border bg-fg-muted/5 p-3">
                    <p className="text-body-small font-medium text-fg">Using this brand’s Shopify</p>
                    <p className="text-body-small text-fg-muted mt-1">
                      {brandShopify.shop_domain ?? "Shopify connected"}. Credentials are stored and tokenized at the brand level. Run migration will use this connector.
                    </p>
                  </div>
                ) : brandId ? (
                  <p className="text-body-small text-fg-muted">
                    This brand has no Shopify connector.{" "}
                    <Link href={`/brands/${brandId}/edit`} className="text-brand-600 hover:underline">
                      Connect Shopify in Brands → Edit this brand → Shopify
                    </Link>{" "}
                    (enter shop domain, Client ID, and Client Secret from the app you created for this store). Then return here to run the migration.
                  </p>
                ) : (
                  <p className="text-body-small text-fg-muted">
                    Select a brand in step 1. Then connect Shopify for that brand in <strong>Brands → [Brand name] → Edit → Shopify</strong>. Shopify requires a separate app per store/partner; add the shop domain and app credentials there.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">What to migrate</h3>
                <p className="text-body-small text-fg-muted mt-1">
                  Select entities to migrate. Dry run first to preview counts, then run migration to Shopify.
                </p>
              </CardHeader>
              <CardContent>
                {/* Job-style metadata */}
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-fg-muted/20 px-3 py-1 text-body-small">Format: WordPress / WooCommerce API</span>
                  <span className="rounded-full bg-fg-muted/20 px-3 py-1 text-body-small">Destination: Shopify</span>
                  {migrationDryRunResult?.counts && (
                    <span className="rounded-full bg-brand-100 dark:bg-brand-900/30 px-3 py-1 text-body-small font-medium">Ready to import</span>
                  )}
                </div>

                {/* Sheets: entity cards (Matrixify-style) */}
                <p className="text-body-small font-medium text-fg-muted mb-2">Sheets</p>
                <div className="space-y-2">
                  {MIGRATION_ENTITIES.map((e) => {
                    const count = migrationDryRunResult?.counts?.[e.id];
                    const selected = migrationEntities.has(e.id);
                    const estimateSec = count != null ? Math.max(5, Math.ceil(count / 50) * 10) : null;
                    return (
                      <label
                        key={e.id}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                          selected ? "border-border bg-bg" : "border-border/50 bg-fg-muted/5 opacity-75"
                        } cursor-pointer hover:border-brand-500/50`}
                      >
                        <Checkbox
                          checked={selected}
                          onChange={() => toggleMigrationEntity(e.id)}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-fg">{e.label}</p>
                          <p className="text-body-small text-fg-muted">{e.source}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-body-small text-fg-muted">
                          {count != null ? (
                            <>
                              <span className="rounded-full bg-fg-muted/20 px-2 py-0.5">Total: {count}</span>
                              {estimateSec != null && (
                                <span className="rounded-full bg-fg-muted/20 px-2 py-0.5">
                                  Estimate: {estimateSec >= 60 ? `${Math.floor(estimateSec / 60)} min ${estimateSec % 60} sec` : `${estimateSec} sec`}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="rounded-full bg-fg-muted/20 px-2 py-0.5">Run dry run for counts</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Total estimate footer */}
                {migrationDryRunResult?.counts && (() => {
                  const totalItems = Object.entries(migrationDryRunResult.counts).reduce(
                    (sum, [k, v]) => sum + (migrationEntities.has(k) ? v : 0),
                    0
                  );
                  const totalSec = Math.max(10, Math.ceil(totalItems / 30) * 15);
                  return (
                    <p className="mt-3 text-right text-body-small text-fg-muted">
                      Total estimate: {totalSec >= 60 ? `${Math.floor(totalSec / 60)} min ${totalSec % 60} sec` : `${totalSec} sec`}
                    </p>
                  );
                })()}

                {/* Actions */}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={runMigrationDryRun}
                    disabled={migrationDryRunLoading || migrationEntities.size === 0}
                  >
                    {migrationDryRunLoading ? "Running…" : "Dry run (preview)"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={runMigrationRun}
                    disabled={migrationRunLoading || migrationEntities.size === 0 || !shopifyCredentialsOk}
                  >
                    {migrationRunLoading ? "Migrating…" : "Run migration"}
                  </Button>
                </div>

                {migrationDryRunError && (
                  <div className="mt-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                    {migrationDryRunError}
                  </div>
                )}
                {migrationRunError && (
                  <div className="mt-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                    {migrationRunError}
                  </div>
                )}
                {migrationRunResult && (
                  <div className="mt-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2 text-body-small">
                    {migrationRunResult.job_id
                      ? `Migration started. Job ID: ${migrationRunResult.job_id}`
                      : migrationRunResult.message ?? "Migration started."}
                  </div>
                )}
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 4 && (
          <Stack>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">{STEPS[3].title}</h3>
                <p className="text-body-small text-fg-muted mt-1">{STEPS[3].description}</p>
              </CardHeader>
              <CardContent>
                <p className="text-body-small text-fg-muted mb-3">
                  Use crawl + GSC/GA4 from steps 1–2. Assign a <strong>primary keyword</strong> and <strong>action</strong> (keep, consolidate into another URL, or drop) per page.
                </p>
                {!(crawlResult?.urls?.length || ga4Result?.pages?.length) ? (
                  <p className="text-body-small text-fg-muted">Run the crawl in step 1 and/or fetch GA4 in step 2 to populate this list (union of all URLs, no duplicates).</p>
                ) : (
                  <>
                    {(!gscResult?.page_queries?.length && !ga4Result?.search_console_queries?.length) && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2 text-body-small">
                        <strong>Traffic keywords</strong> and <strong>Monthly search volume</strong> come from Step 2. Use <strong>both</strong>: (1) <strong>Fetch GSC report</strong> for per-URL keywords (same site URL as crawl), or (2) <strong>Fetch GA4 report</strong> — if your GA4 property has Search Console linked (Admin → Product links), we pull site-level keywords from GA4 and show them below. Link Search Console to GA4 if you only have Analytics access.
                      </div>
                    )}
                    {!gscResult?.page_queries?.length && (ga4Result?.search_console_queries?.length ?? 0) > 0 && (
                      <div className="mb-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2 text-body-small">
                        <strong>Traffic keywords</strong> are from GA4 Search Console (site-level; {ga4Result?.search_console_queries?.length ?? 0} keywords). Per-URL keywords need GSC in Step 2. You can fetch monthly search volume for these keywords below.
                      </div>
                    )}
                    {(ga4Result?.search_console_queries?.length ?? 0) > 0 && (
                      <div className="mb-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2">
                        <p className="text-body-small font-medium mb-2">Keywords from GA4 Search Console (site-level) — use for monthly search volume</p>
                        <ul className="text-body-small space-y-1 max-h-[200px] overflow-y-auto list-disc list-inside">
                          {(ga4Result?.search_console_queries ?? []).slice(0, 50).map((q, idx) => (
                            <li key={idx}>{q.query} <span className="text-fg-muted">({q.clicks} clicks, {q.impressions} impr.)</span></li>
                          ))}
                        </ul>
                        {(ga4Result?.search_console_queries?.length ?? 0) > 50 && <p className="text-body-small text-fg-muted mt-1">+{(ga4Result?.search_console_queries?.length ?? 0) - 50} more</p>}
                      </div>
                    )}
                    {ga4Result?.search_console_error && !gscResult?.page_queries?.length && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2 text-body-small">
                        GA4 keyword data not available: {ga4Result.search_console_error}. Link Search Console to your GA4 property (GA4 → Admin → Product links → Search Console) or fetch GSC report in Step 2 for keywords.
                      </div>
                    )}
                    <div className="mb-2 flex flex-wrap gap-2 items-center">
                      <Button variant="secondary" size="sm" onClick={() => setKeywordRows([])} disabled={!keywordRows.length}>
                        Clear
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setKeywordRows(buildKeywordRowsFromCrawlAndGa4())}>
                        Reset from crawl + GSC/GA4 (union, no duplicates)
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={fetchKeywordVolumes}
                        disabled={keywordVolumeLoading || allUniqueGscKeywords.length === 0}
                        title={allUniqueGscKeywords.length === 0 ? "Enter primary keywords in the table and/or fetch GSC or GA4 in Step 2 to get keywords" : undefined}
                      >
                        {keywordVolumeLoading ? "Fetching…" : "Fetch monthly search volume (Google Ads)"}
                      </Button>
                    </div>
                    {keywordVolumeError && (
                      <p className="text-body-small text-state-danger mb-2">{keywordVolumeError}</p>
                    )}
                    <div className="w-full max-w-full overflow-auto max-h-[60vh] rounded-lg border border-border">
                      <table className="w-full min-w-[900px] border-collapse text-body-small">
                        <thead className="sticky top-0 z-10 bg-bg border-b border-border shadow-sm">
                          <tr>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Path</th>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Type</th>
                            <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Clicks</th>
                            <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Sessions</th>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Primary Keyword</th>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Traffic keywords (GSC/GA4)</th>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Monthly search volume</th>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Action</th>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Consolidate into</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keywordRows.map((r, i) => {
                            const keywords = pathToGscKeywords.get(r.path) ?? [];
                            return (
                            <tr key={`${r.path}-${i}`} className="border-b border-border/50">
                              <td className="px-2 py-1 whitespace-nowrap"><code className="text-body-small">{r.path}</code></td>
                              <td className="px-2 py-1 whitespace-nowrap"><Badge variant="neutral">{r.type}</Badge></td>
                              <td className="px-2 py-1 text-right">{r.clicks}</td>
                              <td className="px-2 py-1 text-right">{r.sessions}</td>
                              <td className="px-2 py-1">
                                <Input value={r.primaryKeyword} onChange={(e) => setKeywordRows((prev) => prev.map((row, j) => (j === i ? { ...row, primaryKeyword: e.target.value } : row)))} className="min-w-[120px]" placeholder="e.g. THC tonics" />
                              </td>
                              <td className="px-2 py-1 max-w-[220px]">
                                {keywords.length === 0 ? (
                                  <span className="text-fg-muted">—</span>
                                ) : (
                                  <ul className="list-disc list-inside text-body-small space-y-0.5">
                                    {keywords.slice(0, 8).map((k, ki) => {
                                      const vol = keywordVolumeMap[k.query];
                                      const volStr = vol !== undefined && vol > 0 ? (vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : String(vol)) : null;
                                      return (
                                        <li key={ki} title={`${k.clicks} clicks, ${k.impressions} impressions${volStr ? `, ${vol} monthly searches` : ""}`}>
                                          {k.query} <span className="text-fg-muted">({k.clicks}{volStr ? `, ${volStr} vol` : ""})</span>
                                        </li>
                                      );
                                    })}
                                    {keywords.length > 8 && <li className="text-fg-muted">+{keywords.length - 8} more</li>}
                                  </ul>
                                )}
                              </td>
                              <td className="px-2 py-1 text-body-small">
                                {(() => {
                                  const totalFromGsc = keywords.reduce((s, k) => s + (keywordVolumeMap[k.query] ?? 0), 0);
                                  const primaryKw = (r.primaryKeyword || "").trim();
                                  const primaryVol = primaryKw ? (keywordVolumeMap[primaryKw] ?? 0) : 0;
                                  const total = totalFromGsc || primaryVol;
                                  if (total === 0) return <span className="text-fg-muted">—</span>;
                                  return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total);
                                })()}
                              </td>
                              <td className="px-2 py-1">
                                <Select
                                  value={r.action}
                                  onChange={(e) => setKeywordRows((prev) => prev.map((row, j) => (j === i ? { ...row, action: e.target.value as KeywordAction } : row)))}
                                >
                                  <option value="keep">keep</option>
                                  <option value="consolidate">consolidate</option>
                                  <option value="drop">drop</option>
                                </Select>
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  value={r.consolidateInto}
                                  onChange={(e) => setKeywordRows((prev) => prev.map((row, j) => (j === i ? { ...row, consolidateInto: e.target.value } : row)))}
                                  placeholder={r.action === "consolidate" ? "/blogs/news" : "—"}
                                  disabled={r.action !== "consolidate"}
                                  className="min-w-[140px]"
                                />
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-body-small text-fg-muted">Showing all {keywordRows.length} URLs. Scroll to edit. Then go to step 5 to define the new site page list.</p>
                  </>
                )}
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 5 && (
          <Stack>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">{STEPS[4].title}</h3>
                <p className="text-body-small text-fg-muted mt-1">{STEPS[4].description}</p>
              </CardHeader>
              <CardContent>
                <p className="text-body-small text-fg-muted mb-2">New site base URL (for redirects in step 6)</p>
                <Input value={targetBaseUrl} onChange={(e) => setTargetBaseUrl(e.target.value)} placeholder="https://newsite.com" className="max-w-md mb-4" />
                <p className="text-body-small text-fg-muted mb-3">Define pages to create on the new site: path, type, priority, and placement (nav / footer / deep).</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Button variant="primary" size="sm" onClick={() => setPagePlan((prev) => [...prev, { path: "", type: "page", priority: "medium", placement: "deep" }])}>
                    Add page
                  </Button>
                  {keywordRows.filter((r) => r.action === "keep").length > 0 && pagePlan.length === 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const kept = keywordRows.filter((r) => r.action === "keep");
                        setPagePlan(
                          kept.slice(0, 50).map((r) => ({
                            path: r.path.replace(/^\//, "") || "home",
                            type: (r.type === "category" ? "collection" : r.type === "tag" ? "blog" : r.type === "product" ? "product" : "page") as PagePlanRow["type"],
                            priority: (r.clicks + r.sessions > 100 ? "high" : r.clicks + r.sessions > 10 ? "medium" : "low") as PagePlanRow["priority"],
                            placement: "deep" as const,
                          }))
                        );
                      }}
                    >
                      Suggest from &quot;keep&quot; pages (first 50)
                    </Button>
                  )}
                </div>
                <div className="w-full max-w-full overflow-auto max-h-[50vh] rounded-lg border border-border">
                  <table className="w-full border-collapse text-body-small">
                    <thead className="sticky top-0 z-10 bg-bg border-b border-border shadow-sm">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Path</th>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Type</th>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Priority</th>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Placement</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagePlan.map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-2 py-1">
                            <Input value={row.path} onChange={(e) => setPagePlan((prev) => prev.map((r, j) => (j === i ? { ...r, path: e.target.value } : r)))} placeholder="/collections/tonics" className="min-w-[180px]" />
                          </td>
                          <td className="px-2 py-1">
                            <Select value={row.type} onChange={(e) => setPagePlan((prev) => prev.map((r, j) => (j === i ? { ...r, type: e.target.value as PagePlanRow["type"] } : r)))}>
                              <option value="collection">collection</option>
                              <option value="product">product</option>
                              <option value="landing">landing</option>
                              <option value="blog">blog</option>
                              <option value="page">page</option>
                            </Select>
                          </td>
                          <td className="px-2 py-1">
                            <Select value={row.priority} onChange={(e) => setPagePlan((prev) => prev.map((r, j) => (j === i ? { ...r, priority: e.target.value as PagePlanRow["priority"] } : r)))}>
                              <option value="high">high</option>
                              <option value="medium">medium</option>
                              <option value="low">low</option>
                            </Select>
                          </td>
                          <td className="px-2 py-1">
                            <Select value={row.placement} onChange={(e) => setPagePlan((prev) => prev.map((r, j) => (j === i ? { ...r, placement: e.target.value as PagePlanRow["placement"] } : r)))}>
                              <option value="nav">nav</option>
                              <option value="footer">footer</option>
                              <option value="deep">deep</option>
                            </Select>
                          </td>
                          <td className="px-2 py-1">
                            <Button variant="secondary" size="sm" onClick={() => setPagePlan((prev) => prev.filter((_, j) => j !== i))}>Remove</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pagePlan.length === 0 && <p className="mt-2 text-body-small text-fg-muted">Add pages or suggest from step 4 &quot;keep&quot; list.</p>}
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 6 && (
          <Stack>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">{STEPS[5].title}</h3>
                <p className="text-body-small text-fg-muted mt-1">{STEPS[5].description}</p>
              </CardHeader>
              <CardContent>
                <p className="text-body-small text-fg-muted mb-3">Map every old URL to a new destination (path or full URL). Status: 301/302 permanent/temporary redirect, or drop/consolidate.</p>
                {(crawlResult?.urls?.length || ga4Result?.pages?.length) ? (
                  <Button type="button" variant="secondary" size="sm" className="mb-3" onClick={() => setRedirectMap(buildRedirectMapFromCrawlAndGa4())}>
                    Re-seed from crawl + GA4 (union, no duplicates)
                  </Button>
                ) : null}
                {redirectMap.length === 0 && !(crawlResult?.urls?.length || ga4Result?.pages?.length) && (
                  <p className="text-body-small text-fg-muted">Run the crawl in step 1 and/or fetch GA4 in step 2 to seed the redirect map (union of all URLs, no duplicates).</p>
                )}
                {redirectMap.length > 0 && (
                  <>
                    <div className="w-full max-w-full overflow-auto max-h-[60vh] rounded-lg border border-border">
                      <table className="w-full border-collapse text-body-small">
                        <thead className="sticky top-0 z-10 bg-bg border-b border-border shadow-sm">
                          <tr>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Old URL</th>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">New URL (path or full)</th>
                            <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {redirectMap.map((r, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-2 py-1"><code className="text-body-small break-all">{r.old_url}</code></td>
                              <td className="px-2 py-1">
                                <Input
                                  value={r.new_url}
                                  onChange={(e) => setRedirectMap((prev) => prev.map((row, j) => (j === i ? { ...row, new_url: e.target.value } : row)))}
                                  placeholder={targetBaseUrl ? "/products/x" : "https://newsite.com/products/x"}
                                  className="min-w-[200px]"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Select value={r.status} onChange={(e) => setRedirectMap((prev) => prev.map((row, j) => (j === i ? { ...row, status: e.target.value as RedirectStatus } : row)))}>
                                  <option value="301">301</option>
                                  <option value="302">302</option>
                                  <option value="consolidate">consolidate</option>
                                  <option value="drop">drop</option>
                                </Select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-body-small text-fg-muted">Showing all {redirectMap.length} redirects. In step 7 you can validate destinations.</p>
                  </>
                )}
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 7 && (
          <Stack>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">{STEPS[6].title}</h3>
                <p className="text-body-small text-fg-muted mt-1">{STEPS[6].description}</p>
              </CardHeader>
              <CardContent>
                <p className="text-body-small text-fg-muted mb-3">Confirm each redirect has a valid destination. Mark OK when verified (e.g. page exists on new site); add an issue note if not.</p>
                {redirectMap.length === 0 ? (
                  <p className="text-body-small text-fg-muted">Define redirects in step 6 first.</p>
                ) : (
                  <div className="w-full max-w-full overflow-auto max-h-[60vh] rounded-lg border border-border">
                    <table className="w-full border-collapse text-body-small">
                      <thead className="sticky top-0 z-10 bg-bg border-b border-border shadow-sm">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Old → New</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Status</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Destination OK</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {redirectMap.map((r, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-2 py-1">
                              <span className="text-body-small"><code>{r.old_url}</code> → <code>{r.new_url || "—"}</code></span>
                            </td>
                            <td className="px-2 py-1"><Badge variant="neutral">{r.status}</Badge></td>
                            <td className="px-2 py-1">
                              <label className="flex items-center gap-1">
                                <Checkbox
                                  checked={r.destinationOk ?? false}
                                  onChange={(e) => setRedirectMap((prev) => prev.map((row, j) => (j === i ? { ...row, destinationOk: e.target.checked } : row)))}
                                />
                                <span className="text-body-small">OK</span>
                              </label>
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                value={r.issue ?? ""}
                                onChange={(e) => setRedirectMap((prev) => prev.map((row, j) => (j === i ? { ...row, issue: e.target.value } : row)))}
                                placeholder="e.g. 404, wrong page"
                                className="min-w-[160px]"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-body-small text-fg-muted">Resolve any issues before launch. Step 9 will show a checklist.</p>
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 8 && (
          <Stack>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">{STEPS[7].title}</h3>
                <p className="text-body-small text-fg-muted mt-1">{STEPS[7].description}</p>
              </CardHeader>
              <CardContent>
                <p className="text-body-small text-fg-muted mb-3">Plan links from homepage, header, footer, and contextual content to key pages. Implement manually in Shopify theme or via apps.</p>
                <Button variant="primary" size="sm" className="mb-2" onClick={() => setInternalLinkPlan((prev) => [...prev, { from_url: "/", to_url: "", anchor: "", placement: "homepage" }])}>
                  Add link
                </Button>
                <div className="w-full max-w-full overflow-auto max-h-[50vh] rounded-lg border border-border">
                  <table className="w-full border-collapse text-body-small">
                    <thead className="sticky top-0 z-10 bg-bg border-b border-border shadow-sm">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">From URL</th>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">To URL</th>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Anchor</th>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Placement</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {internalLinkPlan.map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-2 py-1">
                            <Input value={row.from_url} onChange={(e) => setInternalLinkPlan((prev) => prev.map((r, j) => (j === i ? { ...r, from_url: e.target.value } : r)))} placeholder="/" className="min-w-[120px]" />
                          </td>
                          <td className="px-2 py-1">
                            <Input value={row.to_url} onChange={(e) => setInternalLinkPlan((prev) => prev.map((r, j) => (j === i ? { ...r, to_url: e.target.value } : r)))} placeholder="/collections/tonics" className="min-w-[140px]" />
                          </td>
                          <td className="px-2 py-1">
                            <Input value={row.anchor} onChange={(e) => setInternalLinkPlan((prev) => prev.map((r, j) => (j === i ? { ...r, anchor: e.target.value } : r)))} placeholder="Tonics" className="min-w-[100px]" />
                          </td>
                          <td className="px-2 py-1">
                            <Select value={row.placement} onChange={(e) => setInternalLinkPlan((prev) => prev.map((r, j) => (j === i ? { ...r, placement: e.target.value as InternalLinkRow["placement"] } : r)))}>
                              <option value="homepage">homepage</option>
                              <option value="header">header</option>
                              <option value="footer">footer</option>
                              <option value="contextual">contextual</option>
                            </Select>
                          </td>
                          <td className="px-2 py-1">
                            <Button variant="secondary" size="sm" onClick={() => setInternalLinkPlan((prev) => prev.filter((_, j) => j !== i))}>Remove</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {internalLinkPlan.length === 0 && <p className="mt-2 text-body-small text-fg-muted">Add links to push authority to high-value pages.</p>}
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 9 && (
          <Stack>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">{STEPS[8].title}</h3>
                <p className="text-body-small text-fg-muted mt-1">{STEPS[8].description}</p>
              </CardHeader>
              <CardContent>
                <p className="text-body-small text-fg-muted mb-4">Only switch domain to the new site when everything below is confirmed.</p>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-center gap-2">
                    <Checkbox
                      id="chk-redirects"
                      checked={launchChecklist.redirectsImplemented}
                      onChange={(e) => setLaunchChecklist((c) => ({ ...c, redirectsImplemented: e.target.checked }))}
                    />
                    <label htmlFor="chk-redirects" className="text-body-small">Redirect map implemented in Shopify (or CDN)</label>
                  </li>
                  <li className="flex items-center gap-2">
                    <Checkbox
                      id="chk-pages"
                      checked={launchChecklist.pagesCreated}
                      onChange={(e) => setLaunchChecklist((c) => ({ ...c, pagesCreated: e.target.checked }))}
                    />
                    <label htmlFor="chk-pages" className="text-body-small">All planned pages created on new site</label>
                  </li>
                  <li className="flex items-center gap-2">
                    <Checkbox
                      id="chk-metadata"
                      checked={launchChecklist.metadataSet}
                      onChange={(e) => setLaunchChecklist((c) => ({ ...c, metadataSet: e.target.checked }))}
                    />
                    <label htmlFor="chk-metadata" className="text-body-small">Metadata (titles, descriptions) set for key pages</label>
                  </li>
                  <li className="flex items-center gap-2">
                    <Checkbox
                      id="chk-links"
                      checked={launchChecklist.internalLinksInPlace}
                      onChange={(e) => setLaunchChecklist((c) => ({ ...c, internalLinksInPlace: e.target.checked }))}
                    />
                    <label htmlFor="chk-links" className="text-body-small">Critical internal links in place (homepage, header, footer)</label>
                  </li>
                  <li className="flex items-center gap-2">
                    <Checkbox
                      id="chk-404"
                      checked={launchChecklist.fourOhFoursHandled}
                      onChange={(e) => setLaunchChecklist((c) => ({ ...c, fourOhFoursHandled: e.target.checked }))}
                    />
                    <label htmlFor="chk-404" className="text-body-small">404s for dropped URLs handled (or redirect to parent)</label>
                  </li>
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <Checkbox checked={launchAcked} onChange={(e) => setLaunchAcked(e.target.checked)} />
                    <span className="text-body-small">I have completed the checklist and will update DNS/domain in Shopify myself</span>
                  </label>
                </div>
                <div className="mt-4">
                  <Button
                    variant="primary"
                    disabled={!launchChecklist.redirectsImplemented || !launchChecklist.pagesCreated || !launchChecklist.metadataSet || !launchChecklist.internalLinksInPlace || !launchChecklist.fourOhFoursHandled || !launchAcked}
                    onClick={() => {
                      alert("Launch checklist complete. Update your domain/DNS in Shopify (or your CDN) to point to the new site. Redirects and pages must already be live on the new platform.");
                    }}
                  >
                    Go live (checklist complete)
                  </Button>
                </div>
                <p className="mt-2 text-body-small text-fg-muted">This wizard does not change DNS. After clicking Go live, complete the domain cutover in your hosting/Shopify settings.</p>
              </CardContent>
            </Card>
          </Stack>
        )}
      </Stack>
    </PageFrame>
  );
}
