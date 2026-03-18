"use client";

import { useState, useEffect, useRef } from "react";
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
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories (→ Collections)" },
  { id: "customers", label: "Customers" },
  { id: "redirects", label: "Redirects (from product/category URLs)" },
  { id: "discounts", label: "Discounts (coupons)" },
  { id: "blogs", label: "Blog posts" },
  { id: "pages", label: "Pages" },
] as const;

// Steps 4–9: in-memory strategy state (driven by crawl + GSC/GA4 from 1–3)
type KeywordAction = "keep" | "consolidate" | "drop";
type KeywordRow = { path: string; type: string; clicks: number; sessions: number; theme: string; action: KeywordAction; consolidateInto: string };
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

  // Restore cached crawl for current source URL when URL or step changes (so switching back to step 1 or changing URL shows cache)
  useEffect(() => {
    if (step !== 1 || !sourceUrl.trim()) return;
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
  }, [step, sourceUrl]);

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

  // When entering step 2, sync GSC site URL from crawl source and auto-fetch GA4 if brand has it
  useEffect(() => {
    if (step !== 2) return;
    setGscSiteUrl((prev) => (prev || sourceUrl) || prev);
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

  // Step 4: Seed keyword rows from crawl + GSC + GA4 when entering step 4 (only if keywordRows empty and we have crawl)
  useEffect(() => {
    if (step !== 4 || !crawlResult?.urls?.length || keywordRows.length > 0) return;
    const gscByPath = new Map<string, { clicks: number; impressions: number }>();
    (gscResult?.pages ?? []).forEach((p) => {
      const path = (p.url || "").replace(/^https?:\/\/[^/]+/, "") || "/";
      gscByPath.set(path, { clicks: p.clicks ?? 0, impressions: p.impressions ?? 0 });
    });
    const ga4ByPath = new Map<string, number>();
    (ga4Result?.pages ?? []).forEach((p) => {
      const path = (p.page_path ?? p.full_page_url ?? "").replace(/^https?:\/\/[^/]+/, "") || "/";
      ga4ByPath.set(path, (ga4ByPath.get(path) ?? 0) + (p.sessions ?? 0));
    });
    const rows: KeywordRow[] = crawlResult.urls.map((u) => {
      const path = u.path || "/";
      const gsc = gscByPath.get(path);
      const sessions = ga4ByPath.get(path) ?? 0;
      return {
        path,
        type: u.type ?? "page",
        clicks: gsc?.clicks ?? 0,
        sessions,
        theme: "",
        action: "keep" as KeywordAction,
        consolidateInto: "",
      };
    });
    setKeywordRows(rows);
  }, [step, crawlResult?.urls, gscResult?.pages, ga4Result?.pages]);

  // Step 6: Seed redirect map from crawl when entering step 6 (only if redirectMap empty)
  useEffect(() => {
    if (step !== 6 || !crawlResult?.urls?.length || redirectMap.length > 0) return;
    const base = (sourceUrl || "").replace(/\/+$/, "");
    const rows: RedirectRow[] = crawlResult.urls.map((u) => ({
      old_url: base ? `${base}${(u.path || "/").startsWith("/") ? u.path : `/${u.path}`}` : (u.path || "/"),
      new_url: "",
      status: "301" as RedirectStatus,
    }));
    setRedirectMap(rows);
  }, [step, crawlResult?.urls, sourceUrl]);

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
      setCrawlCachedAt(null);
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
    <PageFrame>
      <Stack>
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
                      {gscResult.pages?.length ?? 0} pages, {gscResult.queries?.length ?? 0} queries.
                      {gscResult.date_range && ` Range: ${gscResult.date_range.start} – ${gscResult.date_range.end}`}
                    </p>
                    {gscResult.error && (
                      <p className="text-body-small text-state-warning mt-1">{gscResult.error}</p>
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
                    </p>
                    {ga4Result.error && (
                      <p className="text-body-small text-state-warning mb-2">{ga4Result.error}</p>
                    )}
                    {ga4Result.pages && ga4Result.pages.length > 0 && (
                      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
                        <TableFrame>
                          <DataTable
                            columns={ga4Columns}
                            data={ga4Result.pages}
                            keyExtractor={(r, i) => r.page_path ?? r.full_page_url ?? String(i)}
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
                  Select entities to migrate (like Matrixify: products, categories → collections, redirects, customers, discounts, blogs, pages). Dry run first to preview counts.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {MIGRATION_ENTITIES.map((e) => (
                    <label key={e.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={migrationEntities.has(e.id)}
                        onChange={() => toggleMigrationEntity(e.id)}
                      />
                      <span className="text-body-small">{e.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={runMigrationDryRun}
                    disabled={migrationDryRunLoading || migrationEntities.size === 0}
                  >
                    {migrationDryRunLoading ? "Running…" : "Dry run (preview)"}
                  </Button>
                  <Button
                    variant="secondary"
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
                {migrationDryRunResult && (
                  <div className="mt-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2 text-body-small">
                    {migrationDryRunResult.counts
                      ? `Preview: ${Object.entries(migrationDryRunResult.counts).map(([k, v]) => `${k}: ${v}`).join(", ")}`
                      : migrationDryRunResult.message ?? "Dry run complete."}
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
                  Use crawl + GSC/GA4 from steps 1–2. Assign a <strong>theme</strong> and <strong>action</strong> (keep, consolidate into another URL, or drop) per page.
                </p>
                {!crawlResult?.urls?.length ? (
                  <p className="text-body-small text-fg-muted">Run the crawl in step 1 first to populate this list.</p>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setKeywordRows([])} disabled={!keywordRows.length}>
                        Clear
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const gscByPath = new Map<string, number>();
                          (gscResult?.pages ?? []).forEach((p) => {
                            const path = (p.url || "").replace(/^https?:\/\/[^/]+/, "") || "/";
                            gscByPath.set(path, (gscByPath.get(path) ?? 0) + (p.clicks ?? 0));
                          });
                          const ga4ByPath = new Map<string, number>();
                          (ga4Result?.pages ?? []).forEach((p) => {
                            const path = (p.page_path ?? p.full_page_url ?? "").replace(/^https?:\/\/[^/]+/, "") || "/";
                            ga4ByPath.set(path, (ga4ByPath.get(path) ?? 0) + (p.sessions ?? 0));
                          });
                          setKeywordRows(
                            (crawlResult?.urls ?? []).map((u) => {
                              const path = u.path || "/";
                              const gsc = gscByPath.get(path);
                              const sessions = ga4ByPath.get(path) ?? 0;
                              return {
                                path,
                                type: u.type ?? "page",
                                clicks: gsc ?? 0,
                                sessions,
                                theme: "",
                                action: "keep" as KeywordAction,
                                consolidateInto: "",
                              };
                            })
                          );
                        }}
                      >
                        Reset from crawl + GSC/GA4
                      </Button>
                    </div>
                    <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
                      <table className="w-full border-collapse text-body-small">
                        <thead className="sticky top-0 bg-fg-muted/10">
                          <tr>
                            <th className="border-b border-border px-2 py-2 text-left font-medium">Path</th>
                            <th className="border-b border-border px-2 py-2 text-left font-medium">Type</th>
                            <th className="border-b border-border px-2 py-2 text-right font-medium">Clicks</th>
                            <th className="border-b border-border px-2 py-2 text-right font-medium">Sessions</th>
                            <th className="border-b border-border px-2 py-2 text-left font-medium">Theme</th>
                            <th className="border-b border-border px-2 py-2 text-left font-medium">Action</th>
                            <th className="border-b border-border px-2 py-2 text-left font-medium">Consolidate into</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keywordRows.map((r, i) => (
                            <tr key={`${r.path}-${i}`} className="border-b border-border/50">
                              <td className="px-2 py-1"><code className="text-body-small">{r.path}</code></td>
                              <td className="px-2 py-1">{r.type}</td>
                              <td className="px-2 py-1 text-right">{r.clicks}</td>
                              <td className="px-2 py-1 text-right">{r.sessions}</td>
                              <td className="px-2 py-1">
                                <Input value={r.theme} onChange={(e) => setKeywordRows((prev) => prev.map((row, j) => (j === i ? { ...row, theme: e.target.value } : row)))} className="min-w-[120px]" placeholder="e.g. THC tonics" />
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
                          ))}
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
                            type: (r.type === "category" ? "collection" : r.type === "tag" ? "blog" : "page") as PagePlanRow["type"],
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
                <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
                  <table className="w-full border-collapse text-body-small">
                    <thead className="sticky top-0 bg-fg-muted/10">
                      <tr>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">Path</th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">Type</th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">Priority</th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">Placement</th>
                        <th className="border-b border-border px-2 py-2 w-8"></th>
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
                {redirectMap.length === 0 && !crawlResult?.urls?.length && (
                  <p className="text-body-small text-fg-muted">Run the crawl in step 1 first to seed the redirect map.</p>
                )}
                {redirectMap.length > 0 && (
                  <>
                    <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
                      <table className="w-full border-collapse text-body-small">
                        <thead className="sticky top-0 bg-fg-muted/10">
                          <tr>
                            <th className="border-b border-border px-2 py-2 text-left font-medium">Old URL</th>
                            <th className="border-b border-border px-2 py-2 text-left font-medium">New URL (path or full)</th>
                            <th className="border-b border-border px-2 py-2 text-left font-medium">Status</th>
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
                  <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
                    <table className="w-full border-collapse text-body-small">
                      <thead className="sticky top-0 bg-fg-muted/10">
                        <tr>
                          <th className="border-b border-border px-2 py-2 text-left font-medium">Old → New</th>
                          <th className="border-b border-border px-2 py-2 text-left font-medium">Status</th>
                          <th className="border-b border-border px-2 py-2 text-left font-medium">Destination OK</th>
                          <th className="border-b border-border px-2 py-2 text-left font-medium">Issue</th>
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
                <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
                  <table className="w-full border-collapse text-body-small">
                    <thead className="sticky top-0 bg-fg-muted/10">
                      <tr>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">From URL</th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">To URL</th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">Anchor</th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">Placement</th>
                        <th className="border-b border-border px-2 py-2 w-8"></th>
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
