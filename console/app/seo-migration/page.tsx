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

export default function SeoMigrationWizardPage() {
  const [step, setStep] = useState(1);

  // Brand (step 1): select brand so step 2 can use its Google/GA4
  const [brands, setBrands] = useState<BrandProfileRow[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [brandGoogle, setBrandGoogle] = useState<{ connected: boolean; ga4_property_id?: string } | null>(null);
  const ga4AutoFetchedRef = useRef(false);

  // Step 1: Crawl
  const [sourceUrl, setSourceUrl] = useState("https://stigmahemp.com");
  const [useLinkCrawl, setUseLinkCrawl] = useState(true);
  const [maxUrls, setMaxUrls] = useState(2000);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<SeoMigrationCrawlResult | null>(null);

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
  const [shopifyStore, setShopifyStore] = useState("");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [migrationEntities, setMigrationEntities] = useState<Set<string>>(new Set(["products", "categories", "redirects"]));
  const [migrationDryRunLoading, setMigrationDryRunLoading] = useState(false);
  const [migrationDryRunError, setMigrationDryRunError] = useState<string | null>(null);
  const [migrationDryRunResult, setMigrationDryRunResult] = useState<{ counts?: Record<string, number>; message?: string } | null>(null);
  const [migrationRunLoading, setMigrationRunLoading] = useState(false);
  const [migrationRunError, setMigrationRunError] = useState<string | null>(null);
  const [migrationRunResult, setMigrationRunResult] = useState<{ job_id?: string; message?: string } | null>(null);

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

  // When brand changes, load Google/GA4 status for step 2
  useEffect(() => {
    ga4AutoFetchedRef.current = false;
    if (!brandId) {
      setBrandGoogle(null);
      return;
    }
    api.getBrandGoogleConnected(brandId).then(setBrandGoogle).catch(() => setBrandGoogle(null));
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

  const runCrawl = async () => {
    setCrawlLoading(true);
    setCrawlError(null);
    setCrawlResult(null);
    try {
      const result = await api.seoMigrationCrawl({
        source_url: sourceUrl.trim(),
        use_link_crawl: useLinkCrawl,
        max_urls: maxUrls,
      });
      setCrawlResult(result);
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
    if (!shopifyStore.trim() || !shopifyAccessToken.trim()) {
      setMigrationRunError("Shopify store URL and access token are required for run.");
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
        shopify_store: shopifyStore.trim(),
        shopify_access_token: shopifyAccessToken.trim(),
        entities: Array.from(migrationEntities),
      });
      setMigrationRunResult(result);
    } catch (e) {
      setMigrationRunError(formatApiError(e));
    } finally {
      setMigrationRunLoading(false);
    }
  };

  const crawlColumns: Column<SeoMigrationCrawlResult["urls"][0]>[] = [
    { key: "path", header: "Path", render: (r) => <code className="text-body-small">{r.path || "/"}</code> },
    { key: "type", header: "Type", render: (r) => <Badge variant="neutral">{r.type}</Badge> },
    { key: "status", header: "Status", render: (r) => r.status },
    { key: "source", header: "Source", render: (r) => r.source },
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
              <div className="mt-4 flex gap-2">
                <Button
                  variant="primary"
                  onClick={runCrawl}
                  disabled={crawlLoading || !sourceUrl.trim()}
                >
                  {crawlLoading ? "Crawling…" : "Run crawl"}
                </Button>
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
                  <TableFrame>
                    <DataTable
                      columns={crawlColumns}
                      data={crawlResult.urls.slice(0, 100)}
                      keyExtractor={(r) => r.normalized_url}
                    />
                  </TableFrame>
                  {crawlResult.urls.length > 100 && (
                    <p className="mt-2 text-body-small text-fg-muted">Showing first 100 of {crawlResult.urls.length}.</p>
                  )}
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
                    <p className="text-body-small text-fg-muted">
                      {ga4Result.pages?.length ?? 0} pages.
                    </p>
                    {ga4Result.error && (
                      <p className="text-body-small text-state-warning mt-1">{ga4Result.error}</p>
                    )}
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
                  Create a custom app or use an existing app in Shopify Admin → Settings → Apps and sales channels → Develop apps. Store URL is your .myshopify.com domain.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-body-small font-medium">Store URL</label>
                    <Input
                      value={shopifyStore}
                      onChange={(e) => setShopifyStore(e.target.value)}
                      placeholder="your-store.myshopify.com"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-body-small font-medium">Admin API access token</label>
                    <Input
                      type="password"
                      value={shopifyAccessToken}
                      onChange={(e) => setShopifyAccessToken(e.target.value)}
                      placeholder="shpat_..."
                      className="w-full"
                    />
                  </div>
                </div>
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
                    disabled={migrationRunLoading || migrationEntities.size === 0}
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

        {step >= 4 && step <= 9 && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold">{STEPS[step - 1].title}</h3>
              <p className="text-body-small text-fg-muted mt-1">{STEPS[step - 1].description}</p>
            </CardHeader>
            <CardContent>
              <p className="text-body-small text-fg-muted">
                This step will be implemented in the pipeline (keyword mapping, redirect map, validation, internal linking plan, launch checklist).
                Use the crawl, GSC/GA4, and migration data from steps 1–3 to drive the strategy.
              </p>
              <p className="mt-2 text-body-small text-fg-muted">
                See <code className="rounded bg-fg-muted/20 px-1">docs/SEO_MIGRATION_WIZARD.md</code> for the full design.
              </p>
            </CardContent>
          </Card>
        )}
      </Stack>
    </PageFrame>
  );
}
