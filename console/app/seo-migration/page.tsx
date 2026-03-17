"use client";

import { useState } from "react";
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
import type { SeoMigrationCrawlResult, SeoGscReport, SeoGa4Report } from "@/lib/api";
import { formatApiError } from "@/lib/api";

const STEPS = [
  { id: 1, title: "Crawl source site", description: "Map every live URL (sitemap + optional link-following for WordPress)." },
  { id: 2, title: "GSC & analytics", description: "Pull Search Console and GA4 to see which pages drive traffic and rankings." },
  { id: 3, title: "Keyword strategy", description: "Map search demand; decide which pages to keep, consolidate, or elevate." },
  { id: 4, title: "Prioritize pages", description: "Define collections, products, and content for the new site and hierarchy." },
  { id: 5, title: "Redirect map", description: "Map every old URL to the best new destination (SEO priority)." },
  { id: 6, title: "Validate destinations", description: "Ensure high-value URLs don’t redirect to weak or irrelevant pages." },
  { id: 7, title: "Internal linking", description: "Plan homepage, header, footer, and contextual links to key pages." },
  { id: 8, title: "Launch", description: "Checklist and domain cutover only when redirects and pages are confirmed." },
] as const;

export default function SeoMigrationWizardPage() {
  const [step, setStep] = useState(1);

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
    setGscLoading(true);
    setGscError(null);
    setGscResult(null);
    try {
      const result = await api.seoGscReport({
        site_url: gscSiteUrl.trim(),
        date_range: "last28days",
        row_limit: 500,
      });
      setGscResult(result);
    } catch (e) {
      setGscError(formatApiError(e));
    } finally {
      setGscLoading(false);
    }
  };

  const runGa4 = async () => {
    if (!ga4PropertyId.trim()) {
      setGa4Error("Property ID is required.");
      return;
    }
    setGa4Loading(true);
    setGa4Error(null);
    setGa4Result(null);
    try {
      const result = await api.seoGa4Report({
        property_id: ga4PropertyId.trim(),
        row_limit: 500,
      });
      setGa4Result(result);
    } catch (e) {
      setGa4Error(formatApiError(e));
    } finally {
      setGa4Loading(false);
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
                <p className="text-body-small text-fg-muted mt-1">GA4 property ID (numeric). Requires OAuth for the property.</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={ga4PropertyId}
                    onChange={(e) => setGa4PropertyId(e.target.value)}
                    placeholder="123456789"
                    className="max-w-md"
                  />
                  <Button variant="primary" onClick={runGa4} disabled={ga4Loading}>
                    {ga4Loading ? "Fetching…" : "Fetch GA4 report"}
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

        {step >= 3 && step <= 8 && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold">{STEPS[step - 1].title}</h3>
              <p className="text-body-small text-fg-muted mt-1">{STEPS[step - 1].description}</p>
            </CardHeader>
            <CardContent>
              <p className="text-body-small text-fg-muted">
                This step will be implemented in the pipeline (keyword mapping, redirect map, validation, internal linking plan, launch checklist).
                Use the crawl and GSC/GA4 data from steps 1–2 to drive the strategy.
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
