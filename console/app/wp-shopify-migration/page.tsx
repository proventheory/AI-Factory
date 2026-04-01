"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
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
import type {
  WpShopifyMigrationCrawlResult,
  SeoGscReport,
  SeoGa4Report,
  BrandProfileRow,
  MigrationPreviewItem,
  WpShopifyMigrationMigratePdfsResult,
  WpShopifyMigrationPdfRow,
  WpShopifyMigrationWooRestParams,
  WpShopifyMigrationRunResult,
  WpShopifyBlogMigrationRow,
} from "@/lib/api";
import { formatApiError } from "@/lib/api";
import { WP_SHOPIFY_MIGRATION_INTENT } from "@/config/intent-types";
import { useEnvironment } from "@/contexts/EnvironmentContext";

const STEPS = [
  { id: 1, title: "Crawl source site", description: "Map every live URL (sitemap + optional link-following for WordPress)." },
  { id: 2, title: "GSC & analytics", description: "Pull Search Console and GA4 to see which pages drive traffic and rankings." },
  { id: 3, title: "Connect platforms & migrate data", description: "Connect WooCommerce (source) and Shopify (destination) APIs; migrate products, categories, customers, redirects, discounts, blog posts, tags, pages, and PDFs (WordPress media → Shopify Files + optional redirects)." },
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
  { id: "blog_tags", label: "Blog tags", source: "from WordPress (taxonomy)" },
  { id: "pages", label: "Pages", source: "from WordPress" },
  { id: "pdfs", label: "PDFs (media files)", source: "from WordPress media library" },
] as const;

// Steps 4–9: in-memory strategy state (driven by crawl + GSC/GA4 from 1–3)
type KeywordAction = "keep" | "consolidate" | "drop";
type KeywordRow = { path: string; type: string; clicks: number; sessions: number; primaryKeyword: string; action: KeywordAction; consolidateInto: string };
type PagePlanRow = {
  path: string;
  type: "collection" | "product" | "landing" | "blog" | "page";
  priority: "high" | "medium" | "low";
  placement: "nav" | "footer" | "deep";
  /** GSC clicks + GA4 sessions + max monthly volume (primary + GSC queries); used for sorting. */
  demandScore?: number;
};
type RedirectStatus = "301" | "302" | "drop" | "consolidate";
type RedirectRow = { old_url: string; new_url: string; status: RedirectStatus; destinationOk?: boolean; issue?: string };
type InternalLinkRow = { from_url: string; to_url: string; anchor: string; placement: "homepage" | "header" | "footer" | "contextual" };

/** Minimal CSV row parser (handles quoted fields). */
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeRedirectStatus(s: string): RedirectStatus {
  const t = (s || "301").trim().toLowerCase();
  if (t === "302") return "302";
  if (t === "drop") return "drop";
  if (t === "consolidate") return "consolidate";
  return "301";
}

/**
 * Path-only key for “same source URL” (crawl vs WP media vs CSV). For uploads/static files, lowercases and
 * decodes %-encoding so the same PDF isn’t two rows (encoding/case/host-only differences).
 */
function canonicalOldUrlPathForMerge(oldUrl: string, siteBaseUrl: string): string {
  const base = (siteBaseUrl || "").trim();
  const safeBase = base.startsWith("http") ? base : base ? `https://${base.replace(/^\/+/, "")}` : "https://example.com";
  let path = normalizeUrlToPath(oldUrl, safeBase);
  path = toCanonicalPath(path);
  const looksStatic =
    /\.(pdf|zip|docx?|xlsx?|pptx?|csv|webp|jpe?g|png|gif|svg|mp4|mov|webm)(\?[^#]*)?$/i.test(path) ||
    /\/wp-content\/uploads\//i.test(path);
  if (looksStatic) {
    path = path.toLowerCase();
    try {
      path = decodeURIComponent(path.replace(/\+/g, "%20"));
    } catch {
      /* keep */
    }
  }
  return path;
}

/** Stable key so merge matches crawl full URLs with Shopify CSV path-only "Redirect from" values. */
function redirectMapOldUrlMergeKey(oldUrl: string, siteBaseUrl: string): string {
  return canonicalOldUrlPathForMerge(oldUrl, siteBaseUrl);
}

function redirectNewUrlStrength(url: string): number {
  const t = (url || "").trim();
  if (!t) return 0;
  const lower = t.toLowerCase();
  if (lower.includes("newsite.com/products/x")) return 1;
  if (/\/products\/x(\?|$|#)/i.test(t)) return 1;
  if (/^https?:\/\/example\.com\//i.test(t)) return 1;
  if (lower.includes("cdn.shopify.com") || lower.includes("/s/files/")) return 4;
  if (/^https?:\/\//i.test(t)) return 3;
  if (t.startsWith("/")) return 2;
  return 2;
}

/** 301/302/consolidate rows are expected to have a real “New URL” unless operator fills consolidate elsewhere. */
function redirectRowExpectsForwardTarget(r: RedirectRow): boolean {
  const s = r.status;
  return s === "301" || s === "302" || s === "consolidate";
}

function redirectRowHasUsableNewUrl(r: RedirectRow): boolean {
  return redirectNewUrlStrength(r.new_url) >= 2;
}

function summarizeRedirectDestinationCoverage(rows: RedirectRow[]): {
  total: number;
  expectsForward: number;
  withDestination: number;
  missingOrPlaceholder: number;
  drop: number;
} {
  let drop = 0;
  let expectsForward = 0;
  let withDestination = 0;
  let missingOrPlaceholder = 0;
  for (const r of rows) {
    if (!(r.old_url || "").trim()) continue;
    if (r.status === "drop") {
      drop += 1;
      continue;
    }
    if (!redirectRowExpectsForwardTarget(r)) continue;
    expectsForward += 1;
    if (redirectRowHasUsableNewUrl(r)) withDestination += 1;
    else missingOrPlaceholder += 1;
  }
  return {
    total: rows.filter((r) => (r.old_url || "").trim()).length,
    expectsForward,
    withDestination,
    missingOrPlaceholder,
    drop,
  };
}

/** Prefer real destinations over empty / UI placeholders; on tie prefer incoming. */
function pickStrongerNewUrl(prev: string, incoming: string): string {
  const a = (prev || "").trim();
  const b = (incoming || "").trim();
  const sa = redirectNewUrlStrength(a);
  const sb = redirectNewUrlStrength(b);
  if (sb > sa) return b;
  if (sa > sb) return a;
  return b || a;
}

/** Prefer a full absolute old URL for display when merging path-only vs https://… */
function preferOldUrlDisplay(a: string, b: string): string {
  const xa = (a || "").trim();
  const xb = (b || "").trim();
  if (!xb) return xa;
  if (!xa) return xb;
  const aFull = /^https?:\/\//i.test(xa);
  const bFull = /^https?:\/\//i.test(xb);
  if (aFull && !bFull) return xa;
  if (bFull && !aFull) return xb;
  return xa.length >= xb.length ? xa : xb;
}

function parseRedirectCsvToRows(text: string): RedirectRow[] {
  const lines = text.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (lines.length === 0) return [];
  const firstCells = parseCsvRow(lines[0]);
  const h = firstCells.map((c) => c.trim().toLowerCase());
  const looksHeader =
    firstCells.length >= 2 &&
    !/^https?:\/\//i.test(firstCells[0] || "") &&
    h.some((c) => /old|new|redirect|status|from|to|url|target/.test(c));
  let start = 0;
  let colOld = 0;
  let colNew = 1;
  let colStatus = 2;
  if (looksHeader) {
    start = 1;
    const idx = (pred: (s: string) => boolean) => h.findIndex(pred);
    const oi = idx((s) => /redirect from|^from$|old url|old_url|^source$/.test(s) || (s.includes("old") && !s.includes("new")));
    const ni = idx((s) => /redirect to|^to$|new url|new_url|target/.test(s) || (s.includes("new") && s.includes("url")));
    const si = idx((s) => s.includes("status") || s === "type");
    if (oi >= 0) colOld = oi;
    if (ni >= 0) colNew = ni;
    if (si >= 0) colStatus = si;
  }
  const rows: RedirectRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const oldU = cells[colOld]?.trim() ?? "";
    if (!oldU) continue;
    rows.push({
      old_url: oldU,
      new_url: cells[colNew]?.trim() ?? "",
      status: normalizeRedirectStatus(cells[colStatus] ?? "301"),
    });
  }
  return rows;
}

function mergeRedirectImports(
  existing: RedirectRow[],
  incoming: RedirectRow[],
  siteBaseUrl: string,
): RedirectRow[] {
  const byKey = new Map<string, RedirectRow>();
  const put = (row: RedirectRow) => {
    if (!(row.old_url || "").trim()) return;
    const key = redirectMapOldUrlMergeKey(row.old_url, siteBaseUrl);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row });
      return;
    }
    const nextUrl = pickStrongerNewUrl(prev.new_url, row.new_url);
    const sp = redirectNewUrlStrength(prev.new_url);
    const sr = redirectNewUrlStrength(row.new_url);
    const status = sr >= sp ? row.status : prev.status;
    byKey.set(key, {
      old_url: preferOldUrlDisplay(prev.old_url, row.old_url),
      new_url: nextUrl,
      status: normalizeRedirectStatus(status),
      destinationOk: prev.destinationOk ?? row.destinationOk,
      issue: prev.issue ?? row.issue,
    });
  };
  for (const r of existing) put(r);
  for (const r of incoming) put(r);
  return Array.from(byKey.values());
}

/** Collapse rows that map to the same canonical old path (e.g. after fixing merge keys or cleaning duplicates). */
function dedupeRedirectMapRows(rows: RedirectRow[], siteBaseUrl: string): RedirectRow[] {
  return mergeRedirectImports([], rows, siteBaseUrl);
}

function safeSiteBaseForRedirectMerge(sourceUrlRaw: string): string {
  const t = (sourceUrlRaw || "").trim();
  if (!t) return "https://example.com";
  return t.startsWith("http") ? t.replace(/\/+$/, "") : `https://${t.replace(/^\/+/, "").replace(/\/$/, "")}`;
}

function normalizedShopifyStoreBase(targetBaseUrl: string): string | null {
  const t = targetBaseUrl.trim();
  if (!t) return null;
  return t.startsWith("http") ? t.replace(/\/$/, "") : `https://${t.replace(/^\/+/, "").replace(/\/$/, "")}`;
}

/**
 * Public origin for redirect “New URL” targets: prefers step 5 / step 1 “New site base URL”,
 * then the brand’s connected Shopify shop domain (e.g. store.myshopify.com).
 */
function storefrontBaseForRedirects(targetBaseUrl: string, shopDomain: string | undefined | null): string | null {
  const explicit = normalizedShopifyStoreBase(targetBaseUrl);
  if (explicit) return explicit;
  const raw = (shopDomain ?? "").trim();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//i, "").split("/")[0]?.trim().toLowerCase();
  if (!host) return null;
  return `https://${host}`;
}

/**
 * Storefront origin only for “New URL” targets (/products, /collections, /blogs).
 * Strips any path the user pasted into “New site base URL” so targets are always `https://shop.myshopify.com/...`, not path-only `/collections/...`.
 */
function storefrontOriginForRedirectTargets(targetBaseUrl: string, shopDomain: string | undefined | null): string | null {
  const full = storefrontBaseForRedirects(targetBaseUrl, shopDomain);
  if (!full) return null;
  try {
    const u = new URL(full.startsWith("http") ? full : `https://${full}`);
    if (!u.hostname?.trim()) return null;
    return u.origin;
  } catch {
    return null;
  }
}

const storefrontBaseMissingHint =
  "Set “New site base URL” in step 5 (or step 1), or connect Shopify for this brand — we use the shop domain (e.g. your-store.myshopify.com) when the field is empty. Custom domains: paste your live storefront URL in that field.";

/** One row per blog post that has a storefront destination; keys merge with redirect map via pathname like CSV import. */
function buildBlogRedirectMergeRows(
  blogRows: WpShopifyBlogMigrationRow[],
  blogHandle: string,
  storeBase: string,
): RedirectRow[] {
  const incoming: RedirectRow[] = [];
  const h = blogHandle.trim();
  if (!h) return incoming;
  for (const br of blogRows) {
    const wu = br.wordpress_url?.trim();
    const slug = br.slug?.trim();
    if (!wu || !slug || !br.shopify_article_id?.trim()) continue;
    const dest = `${storeBase}/blogs/${encodeURIComponent(h)}/${encodeURIComponent(slug)}`;
    incoming.push({ old_url: wu, new_url: dest, status: "301" });
  }
  return incoming;
}

/** Blog redirects from WP REST preview (link + slug) — no migration artifact or Shopify article id required. */
function buildBlogRedirectRowsFromWpPreviewItems(items: MigrationPreviewItem[], blogHandle: string, storeBase: string): RedirectRow[] {
  const incoming: RedirectRow[] = [];
  const h = blogHandle.trim();
  if (!h) return incoming;
  for (const it of items) {
    const wu = it.url?.trim();
    const slug = it.slug?.trim();
    if (!wu || !slug) continue;
    incoming.push({
      old_url: wu.split("#")[0],
      new_url: `${storeBase}/blogs/${encodeURIComponent(h)}/${encodeURIComponent(slug)}`,
      status: "301",
    });
  }
  return incoming;
}

function buildPdfRedirectMergeRows(pdfRows: WpShopifyMigrationPdfRow[]): RedirectRow[] {
  const incoming: RedirectRow[] = [];
  for (const pr of pdfRows) {
    const su = pr.source_url?.trim();
    const cdn = pr.shopify_file_url?.trim();
    if (!su || !cdn) continue;
    incoming.push({ old_url: su, new_url: cdn, status: "301" });
  }
  return incoming;
}

/** Woo REST preview page size when building redirects (fewer round trips than step-3 table pages). */
const WOO_REDIRECT_PREVIEW_PER_PAGE = 100;

/** Prefer Woo slug; else last path segment from permalink. */
function wooHandleForShopifyProductOrCollection(item: MigrationPreviewItem): string | null {
  const slug = item.slug?.trim().toLowerCase().replace(/\.html?$/i, "");
  if (slug) return slug;
  const u = item.url?.trim();
  if (!u) return null;
  try {
    const url = new URL(u);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1]?.replace(/\.html?$/i, "").toLowerCase();
    return last || null;
  } catch {
    return null;
  }
}

function buildProductRedirectMergeRowsFromWooPreview(items: MigrationPreviewItem[], storeBase: string): RedirectRow[] {
  const incoming: RedirectRow[] = [];
  for (const it of items) {
    const oldU = it.url?.trim();
    const handle = wooHandleForShopifyProductOrCollection(it);
    if (!oldU || !handle) continue;
    incoming.push({
      old_url: oldU.split("#")[0],
      new_url: `${storeBase}/products/${encodeURIComponent(handle)}`,
      status: "301",
    });
  }
  return incoming;
}

function buildCollectionRedirectMergeRowsFromWooPreview(items: MigrationPreviewItem[], storeBase: string): RedirectRow[] {
  const incoming: RedirectRow[] = [];
  for (const it of items) {
    const oldU = it.url?.trim();
    const handle = wooHandleForShopifyProductOrCollection(it);
    if (!oldU || !handle) continue;
    incoming.push({
      old_url: oldU.split("#")[0],
      new_url: `${storeBase}/collections/${encodeURIComponent(handle)}`,
      status: "301",
    });
  }
  return incoming;
}

function effectiveCrawlRowType(row: { type: string; path: string }): string {
  const t = (row.type || "").trim().toLowerCase();
  if (t && t !== "page") return t;
  return inferTypeFromPath(row.path || "/");
}

/** Map crawl URLs classified as product vs category/collection to Shopify storefront paths (handle = last segment). */
function buildProductCollectionRedirectRowsFromCrawl(
  crawl: WpShopifyMigrationCrawlResult | null,
  sourceUrlForOrigin: string,
  storeBase: string,
  kind: "product" | "collection",
): RedirectRow[] {
  if (!crawl?.urls?.length) return [];
  let sourceOrigin: string;
  try {
    const raw = sourceUrlForOrigin.trim();
    sourceOrigin = new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
  } catch {
    return [];
  }
  const incoming: RedirectRow[] = [];
  for (const row of crawl.urls) {
    const eff = effectiveCrawlRowType(row);
    if (kind === "product" && eff !== "product") continue;
    if (kind === "collection" && eff !== "category" && eff !== "collection") continue;
    const rawUrl = row.url || row.normalized_url;
    if (!rawUrl?.trim() || !isSameOrigin(rawUrl, sourceOrigin)) continue;
    let pathname: string;
    try {
      pathname = new URL(rawUrl).pathname;
    } catch {
      pathname = row.path || "/";
    }
    const parts = pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1]?.replace(/\.html?$/i, "").toLowerCase();
    if (!last) continue;
    const destPath =
      kind === "product" ? `/products/${encodeURIComponent(last)}` : `/collections/${encodeURIComponent(last)}`;
    incoming.push({ old_url: rawUrl.split("#")[0], new_url: `${storeBase}${destPath}`, status: "301" });
  }
  return incoming;
}

/** Handle segment from rows built by product/category merge (expects /products/{h} or /collections/{h} in new_url). */
function redirectRowShopifyProductOrCollectionHandle(row: RedirectRow, kind: "product" | "collection"): string | null {
  const nu = row.new_url?.trim() ?? "";
  if (!nu) return null;
  try {
    const u = nu.startsWith("http") ? new URL(nu) : new URL(nu, "https://placeholder.invalid");
    const parts = u.pathname.split("/").filter(Boolean);
    const seg = kind === "product" ? "products" : "collections";
    const idx = parts.indexOf(seg);
    if (idx < 0 || !parts[idx + 1]) return null;
    return decodeURIComponent(parts[idx + 1]).toLowerCase();
  } catch {
    return null;
  }
}

function filterRedirectRowsByShopifyHandles(
  rows: RedirectRow[],
  kind: "product" | "collection",
  allowedLower: Set<string>,
): RedirectRow[] {
  return rows.filter((r) => {
    const h = redirectRowShopifyProductOrCollectionHandle(r, kind);
    return h != null && allowedLower.has(h);
  });
}

function slugifyFromNameForTagRedirect(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "tag";
}

function tagHandleFromPreviewItem(item: MigrationPreviewItem): string {
  const slug = (item.slug ?? "").trim().toLowerCase();
  if (slug) return slug;
  return slugifyFromNameForTagRedirect(item.title || item.id || "tag");
}

function encodeTagPathSegmentForRedirect(handle: string): string {
  if (/^[a-z0-9][a-z0-9_-]*$/i.test(handle)) return handle;
  return encodeURIComponent(handle);
}

/** Tag archive redirects from WP REST tag preview (same idea as server-side blog_tags CSV). */
function buildTagRedirectRowsFromWpPreviewItems(items: MigrationPreviewItem[], blogHandle: string, storeBase: string): RedirectRow[] {
  const incoming: RedirectRow[] = [];
  const h = blogHandle.trim().toLowerCase();
  if (!h) return incoming;
  const base = storeBase.replace(/\/$/, "");
  for (const t of items) {
    const from = t.url?.trim();
    if (!from) continue;
    const tagHandle = tagHandleFromPreviewItem(t);
    const seg = encodeTagPathSegmentForRedirect(tagHandle);
    incoming.push({
      old_url: from.split("#")[0],
      new_url: `${base}/blogs/${encodeURIComponent(h)}/tagged/${seg}`,
      status: "301",
    });
  }
  return incoming;
}

function escapeCsvField(val: string): string {
  if (/[",\r\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

function buildRedirectMapCsv(rows: RedirectRow[]): string {
  const header = "old_url,new_url,status";
  const body = rows.map((r) =>
    [escapeCsvField(r.old_url), escapeCsvField(r.new_url), escapeCsvField(r.status)].join(","),
  );
  return [header, ...body].join("\n");
}

const CRAWL_CACHE_KEY = "wp-shopify-migration-crawl-cache";
const WIZARD_SESSION_KEY = "wp-shopify-migration-wizard-session";
/** Small snapshot so brand / step / URLs survive even if the full session JSON fails (quota) or predates session feature. */
const WIZARD_LITE_KEY = "wp-shopify-migration-wizard-lite";
/** Redirect map (step 6–7): separate from main session so mappings survive localStorage quota failures on large GSC/crawl payloads. */
const REDIRECT_MAP_SIDE_KEY = "wp-shopify-migration-redirect-map-side";

function normalizeWooServerForPdfCache(s: string): string {
  return s.trim().replace(/\/+$/, "").toLowerCase();
}

function pdfImportCacheStorageKey(brandId: string, wooNorm: string): string {
  return `ai-factory.wpShopifyPdfImport.v1:${brandId}:${wooNorm}`;
}

type PdfImportBrowserCache = {
  savedAt: string;
  dryPdfCount?: number;
  rows: WpShopifyMigrationPdfRow[];
  summary?: WpShopifyMigrationMigratePdfsResult["summary"];
  truncated?: boolean;
  redirect_csv: string;
};

/** Last migration artifact slice (blog rows, tag redirect CSV) per brand — survives refresh; not in the main wizard JSON (quota). */
type MigrationRunBrowserCache = {
  v: 1;
  savedAt: string;
  run_id: string;
  message?: string;
  parallel_migration_jobs?: boolean;
  blog_migration?: NonNullable<WpShopifyMigrationRunResult["blog_migration"]>;
  blog_tag_redirect_csv?: string;
  blog_tag_redirect_csv_rows?: number;
};

function migrationRunCacheStorageKey(brandId: string): string {
  return `ai-factory.wpShopifyMigrationRun.v1:${brandId.trim()}`;
}

function migrationRunResultFromCache(o: MigrationRunBrowserCache): WpShopifyMigrationRunResult {
  return {
    run_id: o.run_id,
    message: o.message,
    parallel_migration_jobs: o.parallel_migration_jobs,
    blog_migration: o.blog_migration,
    blog_tag_redirect_csv: o.blog_tag_redirect_csv,
    blog_tag_redirect_csv_rows: o.blog_tag_redirect_csv_rows,
  };
}

function migrationRunResultToCache(r: WpShopifyMigrationRunResult): MigrationRunBrowserCache {
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    run_id: r.run_id,
    message: r.message,
    parallel_migration_jobs: r.parallel_migration_jobs,
    blog_migration: r.blog_migration,
    blog_tag_redirect_csv: r.blog_tag_redirect_csv,
    blog_tag_redirect_csv_rows: r.blog_tag_redirect_csv_rows,
  };
}

/** Merge "Redirect from,Redirect to" CSV bodies (dedupe lines). */
function mergeShopifyPdfRedirectCsv(a: string, b: string): string {
  const lines = (s: string) => s.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  const la = lines(a);
  const lb = lines(b);
  if (la.length === 0) return b.trim();
  if (lb.length === 0) return a.trim();
  const header = la[0];
  const seen = new Set<string>();
  const body: string[] = [];
  for (const ln of [...la.slice(1), ...lb.slice(1)]) {
    if (seen.has(ln)) continue;
    seen.add(ln);
    body.push(ln);
  }
  return [header, ...body].join("\n");
}

type WizardLite = {
  brandId: string;
  step: number;
  sourceUrl: string;
  gscSiteUrl: string;
  useLinkCrawl: boolean;
  maxUrls: number;
};

/** Persisted wizard state so leaving the page doesn't lose brand, crawl, keywords, etc. Cleared when user changes brand. */
type WizardSession = {
  brandId: string;
  sourceUrl: string;
  useLinkCrawl: boolean;
  maxUrls: number;
  step: number;
  gscSiteUrl: string;
  gscResult: SeoGscReport | null;
  ga4PropertyId: string;
  ga4Result: SeoGa4Report | null;
  keywordRows: KeywordRow[];
  keywordVolumeMap: Record<string, number>;
  targetBaseUrl: string;
  pagePlan: PagePlanRow[];
  redirectMap: RedirectRow[];
  internalLinkPlan: InternalLinkRow[];
  launchChecklist: { redirectsImplemented: boolean; pagesCreated: boolean; metadataSet: boolean; internalLinksInPlace: boolean; fourOhFoursHandled: boolean };
  launchAcked: boolean;
  migrationEntities: string[];
  wooServer?: string;
  /** Shopify blog handle for /blogs/{handle}/tagged/... suggestions in tag redirect CSV. */
  migrationTagBlogHandle?: string;
};

function getWizardSession(): WizardSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WIZARD_SESSION_KEY);
    return raw ? (JSON.parse(raw) as WizardSession) : null;
  } catch {
    return null;
  }
}

function setWizardSession(session: WizardSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WIZARD_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn("WP → Shopify migration: could not save full wizard session (localStorage quota?). Lite backup still has brand & URLs.", e);
  }
}

function clearWizardSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(WIZARD_SESSION_KEY);
    localStorage.removeItem(WIZARD_LITE_KEY);
    localStorage.removeItem(REDIRECT_MAP_SIDE_KEY);
  } catch {
    // ignore
  }
}

function getWizardLite(): WizardLite | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WIZARD_LITE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<WizardLite>;
    if (typeof o.sourceUrl !== "string") return null;
    return {
      brandId: typeof o.brandId === "string" ? o.brandId : "",
      step: typeof o.step === "number" && o.step >= 1 && o.step <= 9 ? o.step : 1,
      sourceUrl: o.sourceUrl,
      gscSiteUrl: typeof o.gscSiteUrl === "string" ? o.gscSiteUrl : o.sourceUrl,
      useLinkCrawl: typeof o.useLinkCrawl === "boolean" ? o.useLinkCrawl : true,
      maxUrls: typeof o.maxUrls === "number" && o.maxUrls > 0 ? Math.min(5000, o.maxUrls) : 2000,
    };
  } catch {
    return null;
  }
}

function setWizardLite(lite: WizardLite): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WIZARD_LITE_KEY, JSON.stringify(lite));
  } catch {
    // ignore
  }
}

type RedirectMapSidecarV1 = {
  v: 1;
  brandId: string;
  sourceNorm: string;
  rows: RedirectRow[];
};

function redirectSourceNorm(sourceUrl: string): string {
  return normalizeCrawlCacheKey(sourceUrl.trim() || "https://");
}

/** null = no sidecar or wrong migration context; use wizard session. Array (possibly empty) = authoritative snapshot for this brand + source. */
function getRedirectMapSidecar(brandId: string, sourceUrl: string): RedirectRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(REDIRECT_MAP_SIDE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<RedirectMapSidecarV1>;
    if (o.v !== 1 || typeof o.sourceNorm !== "string") return null;
    const b = (o.brandId ?? "").trim();
    const wantB = (brandId ?? "").trim();
    if (b !== wantB) return null;
    if (o.sourceNorm !== redirectSourceNorm(sourceUrl)) return null;
    if (!Array.isArray(o.rows)) return null;
    return o.rows as RedirectRow[];
  } catch {
    return null;
  }
}

function setRedirectMapSidecar(brandId: string, sourceUrl: string, rows: RedirectRow[]): void {
  if (typeof window === "undefined") return;
  if (!sourceUrl.trim()) return;
  const b = (brandId ?? "").trim();
  if (!b && rows.length === 0) return;
  const payload: RedirectMapSidecarV1 = {
    v: 1,
    brandId: b,
    sourceNorm: redirectSourceNorm(sourceUrl),
    rows,
  };
  try {
    localStorage.setItem(REDIRECT_MAP_SIDE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("WP → Shopify migration: could not save redirect map sidecar (quota?).", e);
  }
}

/** Crawl cache key: site origin only so trailing slashes / extra path on the same host still hit the same cache. */
function normalizeCrawlCacheKey(url: string): string {
  try {
    const u = url.trim().toLowerCase().replace(/\/+$/, "") || "https://";
    const parsed = new URL(u.startsWith("http") ? u : `https://${u}`);
    return parsed.origin;
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

/** Match step 5 table path input to the same key used in keyword rows / GSC maps. */
function pagePlanPathToCanonicalKey(planPath: string): string {
  const t = (planPath || "").trim();
  if (!t || t === "home") return "/";
  return toCanonicalPath(t.startsWith("/") ? t : `/${t}`);
}

/** Search demand: actual traffic (GSC + GA4) plus optional Keyword Planner volumes for primary + GSC queries on this URL. */
function computeDemandScoreForKeywordRow(
  r: KeywordRow,
  volumeMap: Record<string, number>,
  pathToGscKeywords: Map<string, Array<{ query: string }>>,
): number {
  let maxVol = 0;
  const bump = (kw: string) => {
    const v = volumeMap[(kw || "").trim()] ?? 0;
    if (v > maxVol) maxVol = v;
  };
  bump(r.primaryKeyword);
  const pathKey = toCanonicalPath(r.path.startsWith("/") ? r.path : `/${r.path}`);
  const gscList = pathToGscKeywords.get(pathKey) ?? [];
  for (const k of gscList) bump(k.query);
  const traffic = r.clicks + r.sessions;
  return traffic * 10 + maxVol;
}

function priorityPlacementFromDemandRank(index: number, total: number): {
  priority: PagePlanRow["priority"];
  placement: PagePlanRow["placement"];
} {
  if (total <= 0) return { priority: "medium", placement: "deep" };
  const highCut = Math.max(1, Math.ceil(total * 0.25));
  const medCut = Math.max(highCut + 1, Math.ceil(total * 0.65));
  const priority: PagePlanRow["priority"] = index < highCut ? "high" : index < medCut ? "medium" : "low";
  const navCut = Math.max(1, Math.ceil(total * 0.1));
  const footCut = Math.max(navCut + 1, Math.ceil(total * 0.3));
  const placement: PagePlanRow["placement"] = index < navCut ? "nav" : index < footCut ? "footer" : "deep";
  return { priority, placement };
}
function getCrawlCache(): Record<string, { crawledAt: string; result: WpShopifyMigrationCrawlResult }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CRAWL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function setCrawlCacheEntry(key: string, result: WpShopifyMigrationCrawlResult): void {
  if (typeof window === "undefined") return;
  try {
    const cache = getCrawlCache();
    cache[key] = { crawledAt: new Date().toISOString(), result };
    localStorage.setItem(CRAWL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

export default function WpShopifyMigrationWizardPage() {
  const { environment: pipelineEnvironment } = useEnvironment();
  const [step, setStep] = useState(1);

  // Brand (step 1): select brand so step 2 can use its Google/GA4
  const [brands, setBrands] = useState<BrandProfileRow[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [brandGoogle, setBrandGoogle] = useState<{ connected: boolean; ga4_property_id?: string } | null>(null);
  const [brandShopify, setBrandShopify] = useState<{ connected: boolean; shop_domain?: string } | null>(null);
  const [brandWoo, setBrandWoo] = useState<{ connected: boolean; store_url?: string } | null>(null);
  /** True while fetching Woo/Shopify/Google connector status after brand change. */
  const [platformStatusLoading, setPlatformStatusLoading] = useState(false);
  const ga4AutoFetchedRef = useRef(false);

  // Step 1: Crawl (with cache per source URL)
  const [sourceUrl, setSourceUrl] = useState("https://stigmahemp.com");
  const [useLinkCrawl, setUseLinkCrawl] = useState(true);
  const [maxUrls, setMaxUrls] = useState(2000);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlPollHint, setCrawlPollHint] = useState<string | null>(null);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<WpShopifyMigrationCrawlResult | null>(null);
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
  /** Woo store URL (synced from brand connector; used for PDF import cache keys). */
  const [wooServer, setWooServer] = useState("");
  const [migrationEntities, setMigrationEntities] = useState<Set<string>>(new Set(["products", "categories", "redirects"]));
  const [migrationDryRunLoading, setMigrationDryRunLoading] = useState(false);
  const [migrationDryRunError, setMigrationDryRunError] = useState<string | null>(null);
  /** After a successful dry run: Shopify handle overlap vs Woo preview (auto-uncheck when safe). */
  const [migrationShopifyOverlapHint, setMigrationShopifyOverlapHint] = useState<string | null>(null);
  const [migrationDryRunResult, setMigrationDryRunResult] = useState<{
    counts: Record<string, number>;
    run_id: string;
  } | null>(null);
  const [migrationRunLoading, setMigrationRunLoading] = useState(false);
  const [migrationRunError, setMigrationRunError] = useState<string | null>(null);
  const [migrationRunResult, setMigrationRunResult] = useState<WpShopifyMigrationRunResult | null>(null);
  /** Pipeline run id while “Run migration” is polling (link to /runs/:id). */
  const [migrationPipelineRunId, setMigrationPipelineRunId] = useState<string | null>(null);
  const [migrationRunPollHint, setMigrationRunPollHint] = useState("");
  /** Filled from wizard_progress job_events so the bar matches Blog posts / PDFs / Blog tags counts (not the batch cap). */
  const [migrationRunProgress, setMigrationRunProgress] = useState<{ current: number; total: number } | null>(null);
  const [pdfImportLoading, setPdfImportLoading] = useState(false);
  const [pdfImportError, setPdfImportError] = useState<string | null>(null);
  const [pdfImportResult, setPdfImportResult] = useState<WpShopifyMigrationMigratePdfsResult | null>(null);
  const [pdfImportProgress, setPdfImportProgress] = useState<{
    current: number;
    total: number;
    title?: string;
    phase?: string;
  } | null>(null);
  const [pdfImportCreateRedirects, setPdfImportCreateRedirects] = useState(true);
  const [pdfImportSkipIfExists, setPdfImportSkipIfExists] = useState(true);
  /** When blog tags are migrated, optional pin for Shopify blog handle (multi-blog stores). */
  const [migrationTagBlogHandle, setMigrationTagBlogHandle] = useState("");
  const [pdfResolveLoading, setPdfResolveLoading] = useState(false);
  /** Latest PDF import/resolve pipeline run (for link while job runs). */
  const [pdfActivePipelineRunId, setPdfActivePipelineRunId] = useState<string | null>(null);

  // Step 4: Keyword strategy (merged URL list + theme/action)
  const [keywordRows, setKeywordRows] = useState<KeywordRow[]>([]);
  const [keywordVolumeMap, setKeywordVolumeMap] = useState<Record<string, number>>({});
  const [keywordVolumeLoading, setKeywordVolumeLoading] = useState(false);
  const [keywordVolumeError, setKeywordVolumeError] = useState<string | null>(null);
  /** Step 4: per-row expand for full GSC keyword list (Airtable-style). */
  const [expandedKeywordRowKeys, setExpandedKeywordRowKeys] = useState<Set<string>>(() => new Set());
  const [ga4ScQueriesExpanded, setGa4ScQueriesExpanded] = useState(false);
  const [redirectCsvImportError, setRedirectCsvImportError] = useState<string | null>(null);
  const [redirectMergeHint, setRedirectMergeHint] = useState<string | null>(null);
  const [redirectAutoFetchLoading, setRedirectAutoFetchLoading] = useState<
    null | "products" | "categories" | "blogs" | "pdfs" | "tags"
  >(null);
  /** When set, product/category fetch keeps rows only if Woo slug matches a handle already on Shopify (read-only Admin list). */
  /** Default true: only add rows whose handle exists on Shopify (Admin API). Unchecking guesses from Woo/crawl and will 404 for mismatched handles. */
  const [redirectProductsOnlyExistingShopify, setRedirectProductsOnlyExistingShopify] = useState(true);
  const [redirectCategoriesOnlyExistingShopify, setRedirectCategoriesOnlyExistingShopify] = useState(true);
  const redirectCsvInputRef = useRef<HTMLInputElement>(null);
  const redirectCsvImportModeRef = useRef<"merge" | "replace">("merge");
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

  /** Step 3: expanded sheet + paginated preview + per-item exclusions (excluded IDs are omitted from effective migrate count). */
  const [migrationExpandedEntity, setMigrationExpandedEntity] = useState<string | null>(null);
  const [migrationPreviewPageByEntity, setMigrationPreviewPageByEntity] = useState<Record<string, number>>({});
  const [migrationPreviewLoadingEntity, setMigrationPreviewLoadingEntity] = useState<string | null>(null);
  const [migrationPreviewErrorByEntity, setMigrationPreviewErrorByEntity] = useState<Record<string, string | null>>({});
  const [migrationPreviewRows, setMigrationPreviewRows] = useState<Record<string, MigrationPreviewItem[]>>({});
  const [migrationPreviewMeta, setMigrationPreviewMeta] = useState<Record<string, { total: number; scope_note?: string; per_page: number }>>({});
  const [migrationExcludedIds, setMigrationExcludedIds] = useState<Record<string, string[]>>({});
  const [wpPreviewUser, setWpPreviewUser] = useState("");
  const [wpPreviewAppPassword, setWpPreviewAppPassword] = useState("");
  const migrationPreviewRequestSeq = useRef(0);

  const wooCredentialsOk = Boolean(brandId && brandWoo?.connected === true);
  const shopifyCredentialsOk = Boolean(brandId && brandShopify?.connected);
  const platformsConnected = Boolean(wooCredentialsOk && shopifyCredentialsOk && !platformStatusLoading);

  const wooApiBase = useCallback((): WpShopifyMigrationWooRestParams => {
    if (!brandId) {
      return { woo_server: "", woo_consumer_key: "", woo_consumer_secret: "" };
    }
    return { brand_id: brandId };
  }, [brandId]);

  const toggleMigrationEntity = (id: string) => {
    setMigrationEntities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    setMigrationExcludedIds((ex) => {
      let changed = false;
      const next = { ...ex };
      for (const k of Object.keys(next)) {
        if (!migrationEntities.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : ex;
    });
    if (migrationExpandedEntity && !migrationEntities.has(migrationExpandedEntity)) {
      setMigrationExpandedEntity(null);
    }
  }, [migrationEntities, migrationExpandedEntity]);

  /** Restore last PDF import rows from localStorage (per brand + Woo base URL). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const b = brandId.trim();
    const w = normalizeWooServerForPdfCache(wooServer);
    if (!b || !w) return;
    try {
      const raw = localStorage.getItem(pdfImportCacheStorageKey(b, w));
      if (!raw) {
        setPdfImportResult(null);
        return;
      }
      const o = JSON.parse(raw) as PdfImportBrowserCache;
      if (!Array.isArray(o.rows) || o.rows.length === 0) return;
      setPdfImportResult({
        rows: o.rows,
        redirect_csv: o.redirect_csv ?? "",
        truncated: Boolean(o.truncated),
        summary: o.summary,
        hint: o.savedAt ? `Restored from this browser (${new Date(o.savedAt).toLocaleString()}).` : undefined,
      });
    } catch {
      /* ignore */
    }
  }, [brandId, wooServer]);

  /** Persist PDF import results for cross-session comparison and “fetch URLs” without re-uploading. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const b = brandId.trim();
    const w = normalizeWooServerForPdfCache(wooServer);
    if (!b || !w || !pdfImportResult?.rows?.length) return;
    const payload: PdfImportBrowserCache = {
      savedAt: new Date().toISOString(),
      dryPdfCount: migrationDryRunResult?.counts?.pdfs,
      rows: pdfImportResult.rows,
      summary: pdfImportResult.summary,
      truncated: pdfImportResult.truncated,
      redirect_csv: pdfImportResult.redirect_csv ?? "",
    };
    try {
      localStorage.setItem(pdfImportCacheStorageKey(b, w), JSON.stringify(payload));
    } catch {
      /* quota */
    }
  }, [brandId, wooServer, pdfImportResult, migrationDryRunResult?.counts?.pdfs]);

  /** Restore last migration summary (blog table + tag redirect CSV) per brand so step 6 fetch/map works after refresh. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const b = brandId.trim();
    if (!b) return;
    try {
      const raw = localStorage.getItem(migrationRunCacheStorageKey(b));
      if (!raw) {
        setMigrationRunResult(null);
        return;
      }
      const o = JSON.parse(raw) as MigrationRunBrowserCache;
      if (o.v !== 1) {
        setMigrationRunResult(null);
        return;
      }
      setMigrationRunResult(migrationRunResultFromCache({ ...o, run_id: typeof o.run_id === "string" ? o.run_id : "" }));
    } catch {
      setMigrationRunResult(null);
    }
  }, [brandId]);

  /** Persist migration artifact slice when a run finishes (or updates); skipping when null keeps the previous snapshot on disk during a new run until success. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const b = brandId.trim();
    if (!b || !migrationRunResult) return;
    try {
      localStorage.setItem(migrationRunCacheStorageKey(b), JSON.stringify(migrationRunResultToCache(migrationRunResult)));
    } catch {
      /* quota */
    }
  }, [brandId, migrationRunResult]);

  const hasRestoredSessionRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  /** False until restore layout has finished; avoids persisting empty Woo fields before state hydrates from localStorage. */
  const wooPersistEnabledRef = useRef(false);

  // Load brands for dropdown
  useEffect(() => {
    api.getBrandProfiles({ status: "active", limit: 200 }).then((r) => setBrands(r.items)).catch(() => setBrands([]));
  }, []);

  // Restore wizard session once on mount so leaving the page doesn't lose brand, crawl, keywords, etc.
  useLayoutEffect(() => {
    if (typeof window === "undefined" || hasRestoredSessionRef.current) return;
    const session = getWizardSession();
    const lite = getWizardLite();
    try {
      if (!session && !lite) {
        hasRestoredSessionRef.current = true;
        return;
      }
      hasRestoredSessionRef.current = true;
      skipNextPersistRef.current = true;
      const brandFromLite = lite?.brandId ?? "";
      const stepFromLite = lite?.step ?? 1;
      const sourceFromLite = lite?.sourceUrl ?? "https://stigmahemp.com";
      const gscFromLite = lite?.gscSiteUrl ?? sourceFromLite;

      if (session) {
        const nextBrand = (session.brandId ?? "").trim() || brandFromLite;
        const nextStep = Math.min(Math.max(1, session.step ?? stepFromLite), 9);
        const nextSource = session.sourceUrl ?? sourceFromLite;
        const nextUseLink = session.useLinkCrawl ?? lite?.useLinkCrawl ?? true;
        const nextMax = session.maxUrls ?? lite?.maxUrls ?? 2000;
        const nextGsc = session.gscSiteUrl ?? session.sourceUrl ?? gscFromLite;
        setBrandId(nextBrand);
        setSourceUrl(nextSource);
        setUseLinkCrawl(nextUseLink);
        setMaxUrls(nextMax);
        setStep(nextStep);
        setGscSiteUrl(nextGsc);
        setGscResult(session.gscResult ?? null);
        setGa4PropertyId(session.ga4PropertyId ?? "");
        setGa4Result(session.ga4Result ?? null);
        setKeywordRows(Array.isArray(session.keywordRows) ? session.keywordRows : []);
        setKeywordVolumeMap(session.keywordVolumeMap && typeof session.keywordVolumeMap === "object" ? session.keywordVolumeMap : {});
        setTargetBaseUrl(session.targetBaseUrl ?? "");
        setPagePlan(Array.isArray(session.pagePlan) ? session.pagePlan : []);
        {
          const sessionRm = Array.isArray(session.redirectMap) ? session.redirectMap : [];
          const diskRm = getRedirectMapSidecar(nextBrand, nextSource);
          const rawRm = diskRm !== null ? diskRm : sessionRm;
          setRedirectMap(dedupeRedirectMapRows(rawRm, safeSiteBaseForRedirectMerge(nextSource)));
        }
        setInternalLinkPlan(Array.isArray(session.internalLinkPlan) ? session.internalLinkPlan : []);
        setLaunchChecklist(
          session.launchChecklist && typeof session.launchChecklist === "object"
            ? {
                redirectsImplemented: !!session.launchChecklist.redirectsImplemented,
                pagesCreated: !!session.launchChecklist.pagesCreated,
                metadataSet: !!session.launchChecklist.metadataSet,
                internalLinksInPlace: !!session.launchChecklist.internalLinksInPlace,
                fourOhFoursHandled: !!session.launchChecklist.fourOhFoursHandled,
              }
            : { redirectsImplemented: false, pagesCreated: false, metadataSet: false, internalLinksInPlace: false, fourOhFoursHandled: false }
        );
        setLaunchAcked(!!session.launchAcked);
        if (Array.isArray(session.migrationEntities)) setMigrationEntities(new Set(session.migrationEntities));
        ga4AutoFetchedRef.current = (session.ga4Result?.pages?.length ?? 0) > 0;
        setWooServer(typeof session.wooServer === "string" ? session.wooServer : "");
        setMigrationTagBlogHandle(typeof session.migrationTagBlogHandle === "string" ? session.migrationTagBlogHandle : "");
        setWizardLite({
          brandId: nextBrand,
          step: nextStep,
          sourceUrl: nextSource,
          gscSiteUrl: nextGsc,
          useLinkCrawl: nextUseLink,
          maxUrls: nextMax,
        });
      } else if (lite) {
        setBrandId(lite.brandId);
        setSourceUrl(lite.sourceUrl);
        setUseLinkCrawl(lite.useLinkCrawl);
        setMaxUrls(lite.maxUrls);
        setStep(Math.min(Math.max(1, lite.step), 9));
        setGscSiteUrl(lite.gscSiteUrl);
        ga4AutoFetchedRef.current = false;
        setWooServer("");
        setWizardLite(lite);
        {
          const diskRm = getRedirectMapSidecar(lite.brandId, lite.sourceUrl);
          if (diskRm !== null) {
            setRedirectMap(dedupeRedirectMapRows(diskRm, safeSiteBaseForRedirectMerge(lite.sourceUrl)));
          }
        }
      }
    } finally {
      wooPersistEnabledRef.current = true;
    }
  }, []);

  // After hydration, keep the lite snapshot in sync (small write; avoids losing brand when full JSON hits localStorage quota).
  useEffect(() => {
    if (typeof window === "undefined" || !hasRestoredSessionRef.current) return;
    setWizardLite({
      brandId,
      step,
      sourceUrl,
      gscSiteUrl,
      useLinkCrawl,
      maxUrls,
    });
  }, [brandId, step, sourceUrl, gscSiteUrl, useLinkCrawl, maxUrls]);

  // When the selected brand has WooCommerce saved, sync store URL for PDF cache keys.
  useEffect(() => {
    if (!brandId || brandWoo?.connected !== true) return;
    if (brandWoo.store_url) setWooServer(brandWoo.store_url);
  }, [brandId, brandWoo?.connected, brandWoo?.store_url]);

  // Redirect map: dedicated sidecar so new_url / status edits survive reload even when the full wizard JSON is too large to store.
  useEffect(() => {
    if (typeof window === "undefined" || !hasRestoredSessionRef.current) return;
    if (!sourceUrl.trim()) return;
    if (!brandId.trim() && redirectMap.length === 0) return;
    setRedirectMapSidecar(brandId, sourceUrl, redirectMap);
  }, [brandId, sourceUrl, redirectMap]);

  // When user changes brand in step 1: clear persisted session and reset derived state so they start fresh for the new brand
  const handleBrandChange = useCallback((newBrandId: string) => {
    if (newBrandId === brandId) return;
    clearWizardSession();
    setCrawlResult(null);
    setCrawlCachedAt(null);
    setGscResult(null);
    setGa4Result(null);
    setKeywordRows([]);
    setKeywordVolumeMap({});
    setRedirectMap([]);
    setPagePlan([]);
    setInternalLinkPlan([]);
    setLaunchChecklist({ redirectsImplemented: false, pagesCreated: false, metadataSet: false, internalLinksInPlace: false, fourOhFoursHandled: false });
    setLaunchAcked(false);
    setMigrationTagBlogHandle("");
    setMigrationRunResult(null);
    setMigrationDryRunResult(null);
    setMigrationRunError(null);
    setBrandId(newBrandId);
  }, [brandId]);

  // Persist wizard session when state changes (debounced) so leaving the page preserves progress
  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      setWizardLite({
        brandId,
        step,
        sourceUrl,
        gscSiteUrl,
        useLinkCrawl,
        maxUrls,
      });
      setWizardSession({
        brandId,
        sourceUrl,
        useLinkCrawl,
        maxUrls,
        step,
        gscSiteUrl,
        gscResult,
        ga4PropertyId,
        ga4Result,
        keywordRows,
        keywordVolumeMap,
        targetBaseUrl,
        pagePlan,
        redirectMap,
        internalLinkPlan,
        launchChecklist,
        launchAcked,
        migrationEntities: Array.from(migrationEntities),
        wooServer,
        migrationTagBlogHandle,
      });
    }, 800);
    return () => clearTimeout(t);
  }, [brandId, sourceUrl, useLinkCrawl, maxUrls, step, gscSiteUrl, gscResult, ga4PropertyId, ga4Result, keywordRows, keywordVolumeMap, targetBaseUrl, pagePlan, redirectMap, internalLinkPlan, launchChecklist, launchAcked, migrationEntities, wooServer, migrationTagBlogHandle]);

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

  // When brand changes, load Google/GA4 and Shopify/Woo status for steps 2 and 3
  useEffect(() => {
    ga4AutoFetchedRef.current = false;
    if (!brandId) {
      setBrandGoogle(null);
      setBrandShopify(null);
      setBrandWoo(null);
      setPlatformStatusLoading(false);
      return;
    }
    setPlatformStatusLoading(true);
    setBrandGoogle(null);
    setBrandShopify(null);
    setBrandWoo(null);
    let cancelled = false;
    Promise.all([
      api.getBrandGoogleConnected(brandId).then(setBrandGoogle).catch(() => setBrandGoogle(null)),
      api.getBrandShopifyConnected(brandId).then(setBrandShopify).catch(() => setBrandShopify(null)),
      api.getBrandWooCommerceConnected(brandId).then(setBrandWoo).catch(() => setBrandWoo(null)),
    ]).finally(() => {
      if (!cancelled) setPlatformStatusLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  /** Push URL fields to initiative goal_metadata without enqueueing wizard_state_snapshot (snapshot jobs were flooding the runner and starving crawls). */
  const urlSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!brandId) return;
    if (urlSyncDebounceRef.current) clearTimeout(urlSyncDebounceRef.current);
    urlSyncDebounceRef.current = setTimeout(() => {
      urlSyncDebounceRef.current = null;
      void api
        .wpShopifyMigrationSyncGoalMetadata({
          brand_id: brandId,
          environment: pipelineEnvironment,
          ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}),
          ...(targetBaseUrl.trim() ? { target_store_url: targetBaseUrl.trim() } : {}),
          ...(gscSiteUrl.trim() ? { gsc_site_url: gscSiteUrl.trim() } : {}),
          ...(ga4PropertyId.trim() ? { ga4_property_id: ga4PropertyId.trim() } : {}),
        })
        .catch(() => {
          /* non-blocking */
        });
    }, 1600);
    return () => {
      if (urlSyncDebounceRef.current) clearTimeout(urlSyncDebounceRef.current);
    };
  }, [brandId, sourceUrl, targetBaseUrl, gscSiteUrl, ga4PropertyId, pipelineEnvironment]);

  /** Artifact snapshot only when the user changes wizard step (not on every summary tick). */
  const prevStepForSnapshotRef = useRef<number | null>(null);
  useEffect(() => {
    if (!brandId) return;
    if (prevStepForSnapshotRef.current === null) {
      prevStepForSnapshotRef.current = step;
      return;
    }
    if (prevStepForSnapshotRef.current === step) return;
    prevStepForSnapshotRef.current = step;
    const tid = setTimeout(() => {
      void api
        .wpShopifyWizardStateSnapshotEnqueue({
          brand_id: brandId,
          environment: pipelineEnvironment,
          wizard_step: step,
          summary: {
            keyword_rows: keywordRows.length,
            page_plan: pagePlan.length,
            redirects: redirectMap.length,
            internal_links: internalLinkPlan.length,
            crawl_urls: crawlResult?.urls?.length ?? 0,
            has_gsc: Boolean(gscResult),
            has_ga4: Boolean(ga4Result),
            source_url_preview: (sourceUrl || "").trim().slice(0, 240),
          },
        })
        .catch(() => {
          /* non-blocking */
        });
    }, 600);
    return () => clearTimeout(tid);
  }, [
    brandId,
    step,
    pipelineEnvironment,
    keywordRows.length,
    pagePlan.length,
    redirectMap.length,
    internalLinkPlan.length,
    crawlResult?.urls?.length,
    gscResult,
    ga4Result,
    sourceUrl,
  ]);

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
      .seoGa4Report({ brand_id: brandId, row_limit: 500, environment: pipelineEnvironment })
      .then(setGa4Result)
      .catch((e) => setGa4Error(formatApiError(e)))
      .finally(() => setGa4Loading(false));
  }, [step, brandId, brandGoogle?.connected, brandGoogle?.ga4_property_id, sourceUrl, pipelineEnvironment]);

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

  const suggestPagePlanFromKeep = useCallback(() => {
    const kept = keywordRows.filter((r) => r.action === "keep");
    if (kept.length === 0) return;
    const scored = kept
      .map((r) => ({ r, s: computeDemandScoreForKeywordRow(r, keywordVolumeMap, pathToGscKeywords) }))
      .sort((a, b) => b.s - a.s);
    const n = scored.length;
    setPagePlan(
      scored.map(({ r, s }, i) => {
        const { priority, placement } = priorityPlacementFromDemandRank(i, n);
        return {
          path: r.path.replace(/^\//, "") || "home",
          type: (r.type === "category" ? "collection" : r.type === "tag" ? "blog" : r.type === "product" ? "product" : "page") as PagePlanRow["type"],
          priority,
          placement,
          demandScore: Math.round(s),
        };
      }),
    );
  }, [keywordRows, keywordVolumeMap, pathToGscKeywords]);

  const rerankPagePlanByDemand = useCallback(() => {
    if (pagePlan.length === 0) return;
    const keepByPath = new Map(
      keywordRows
        .filter((r) => r.action === "keep")
        .map((r) => [toCanonicalPath(r.path.startsWith("/") ? r.path : `/${r.path}`), r]),
    );
    const enriched = pagePlan.map((row) => {
      const kr = keepByPath.get(pagePlanPathToCanonicalKey(row.path));
      const s = kr
        ? computeDemandScoreForKeywordRow(kr, keywordVolumeMap, pathToGscKeywords)
        : row.demandScore ?? 0;
      return { row, s };
    });
    enriched.sort((a, b) => b.s - a.s);
    const n = enriched.length;
    setPagePlan(
      enriched.map(({ row, s }, i) => {
        const { priority, placement } = priorityPlacementFromDemandRank(i, n);
        return { ...row, demandScore: Math.round(s), priority, placement };
      }),
    );
  }, [pagePlan, keywordRows, keywordVolumeMap, pathToGscKeywords]);

  const fetchKeywordVolumes = async () => {
    if (allUniqueGscKeywords.length === 0) return;
    if (!brandId.trim()) {
      setKeywordVolumeError("Select a brand in step 1 so keyword volume runs on your initiative.");
      return;
    }
    setKeywordVolumeLoading(true);
    setKeywordVolumeError(null);
    try {
      const result = await api.seoKeywordVolume({
        brand_id: brandId,
        keywords: allUniqueGscKeywords,
        environment: pipelineEnvironment,
      });
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

  const toggleKeywordTrafficExpanded = (rowKey: string) => {
    setExpandedKeywordRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const downloadRedirectCsv = () => {
    if (redirectMap.length === 0) return;
    const blob = new Blob([buildRedirectMapCsv(redirectMap)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-redirect-map-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const triggerRedirectCsvImport = (mode: "merge" | "replace") => {
    redirectCsvImportModeRef.current = mode;
    redirectCsvInputRef.current?.click();
  };

  const onRedirectCsvFileChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const incoming = parseRedirectCsvToRows(text);
        if (incoming.length === 0) {
          setRedirectCsvImportError(
            "No valid rows found. Use a header row with old_url, new_url, status (or Redirect from / Redirect to), or three columns in that order.",
          );
          return;
        }
        const mode = redirectCsvImportModeRef.current;
        if (mode === "replace") {
          if (!window.confirm(`Replace all redirects with ${incoming.length} rows from this file?`)) return;
          setRedirectMap(dedupeRedirectMapRows(incoming, safeSiteBaseForRedirectMerge(sourceUrl)));
        } else {
          setRedirectMap((prev) =>
            mergeRedirectImports(prev, incoming, safeSiteBaseForRedirectMerge(sourceUrl)),
          );
        }
        setRedirectCsvImportError(null);
      } catch (e) {
        setRedirectCsvImportError(formatApiError(e));
      }
    };
    reader.readAsText(f);
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
    if (crawlLoading) return;
    if (!brandId.trim()) {
      setCrawlError("Select a brand in step 1 so the crawl is recorded on your WP → Shopify initiative.");
      return;
    }
    setCrawlLoading(true);
    setCrawlPollHint(null);
    setCrawlError(null);
    setCrawlResult(null);
    setCrawlCachedAt(null);
    try {
      const result = await api.wpShopifyMigrationCrawl(
        {
          brand_id: brandId,
          source_url: sourceUrl.trim(),
          use_link_crawl: useLinkCrawl,
          max_urls: maxUrls,
          environment: pipelineEnvironment,
        },
        {
          onRunEnqueued: (rid) => {
            setCrawlPollHint(`Queued pipeline run ${rid.slice(0, 8)}… — waiting for worker`);
          },
          onStatus: (s) => {
            const short = s.length > 48 ? `${s.slice(0, 45)}…` : s;
            setCrawlPollHint(`Run status: ${short}`);
          },
          onWizardProgress: (pl) => {
            const cr = pl.crawl as { current?: number; total?: number; detail?: string } | undefined;
            if (cr && typeof cr.current === "number" && typeof cr.total === "number") {
              const det = typeof cr.detail === "string" && cr.detail.trim() ? `${cr.detail.trim()}: ` : "";
              setCrawlPollHint(`${det}${cr.current}/${cr.total} URLs`);
            }
          },
        },
      );
      setCrawlResult(result);
      const cachedAt = new Date().toISOString();
      setCrawlCachedAt(cachedAt);
      setCrawlCacheEntry(normalizeCrawlCacheKey(sourceUrl.trim()), result);
    } catch (e) {
      setCrawlError(formatApiError(e));
    } finally {
      setCrawlLoading(false);
      setCrawlPollHint(null);
    }
  };

  const runGsc = async () => {
    if (!gscSiteUrl.trim()) {
      setGscError("Site URL is required.");
      return;
    }
    if (!brandId.trim()) {
      setGscError("Select a brand in step 1 so GSC data is recorded on your initiative.");
      return;
    }
    setGscLoading(true);
    setGscError(null);
    setGscResult(null);
    try {
      const result = await api.seoGscReport({
        brand_id: brandId,
        site_url: gscSiteUrl.trim(),
        date_range: "last28days",
        row_limit: 500,
        environment: pipelineEnvironment,
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
        brandId
          ? { brand_id: brandId, row_limit: 500, environment: pipelineEnvironment }
          : { property_id: ga4PropertyId.trim(), row_limit: 500 },
      );
      setGa4Result(result);
    } catch (e) {
      setGa4Error(formatApiError(e));
    } finally {
      setGa4Loading(false);
    }
  };

  const fetchMigrationPreview = useCallback(
    async (entity: string, page: number) => {
      if (!wooCredentialsOk) return;
      const seq = ++migrationPreviewRequestSeq.current;
      setMigrationPreviewLoadingEntity(entity);
      setMigrationPreviewErrorByEntity((prev) => ({ ...prev, [entity]: null }));
      try {
        const needsWpAuth = entity === "blogs" || entity === "pages" || entity === "blog_tags" || entity === "pdfs";
        const result = await api.wpShopifyMigrationPreviewItems({
          ...wooApiBase(),
          brand_id: brandId!,
          entity,
          page,
          per_page: 50,
          environment: pipelineEnvironment,
          ...(needsWpAuth && wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        });
        if (seq !== migrationPreviewRequestSeq.current) return;
        setMigrationPreviewRows((r) => ({ ...r, [entity]: result.items }));
        setMigrationPreviewMeta((m) => ({
          ...m,
          [entity]: { total: result.total, scope_note: result.scope_note, per_page: result.per_page },
        }));
        setMigrationPreviewPageByEntity((p) => ({ ...p, [entity]: page }));
      } catch (e) {
        if (seq !== migrationPreviewRequestSeq.current) return;
        setMigrationPreviewErrorByEntity((prev) => ({ ...prev, [entity]: formatApiError(e) }));
        setMigrationPreviewRows((r) => ({ ...r, [entity]: [] }));
      } finally {
        if (seq === migrationPreviewRequestSeq.current) setMigrationPreviewLoadingEntity(null);
      }
    },
    [wooApiBase, wooCredentialsOk, brandId, wpPreviewUser, wpPreviewAppPassword, pipelineEnvironment],
  );

  const toggleMigrationItemExcluded = (entity: string, itemId: string) => {
    setMigrationExcludedIds((prev) => {
      const set = new Set(prev[entity] ?? []);
      if (set.has(itemId)) set.delete(itemId);
      else set.add(itemId);
      return { ...prev, [entity]: Array.from(set) };
    });
  };

  const migrationEffectiveCount = (entityId: string, dryTotal: number | undefined): number | null => {
    if (dryTotal == null) return null;
    const ex = migrationExcludedIds[entityId]?.length ?? 0;
    return Math.max(0, dryTotal - ex);
  };

  const runMigrationRun = async () => {
    if (!wooCredentialsOk) {
      setMigrationRunError(
        "Connect WooCommerce for this brand under Brands → Edit brand → WooCommerce.",
      );
      return;
    }
    if (!brandId) {
      setMigrationRunError("Select a brand in step 1.");
      return;
    }
    if (migrationEntities.has("pdfs") && !brandShopify?.connected) {
      setMigrationRunError(
        "Connect Shopify for this brand (Brands → Edit brand → Shopify) when PDFs are included—Shopify Files and redirects need the connector.",
      );
      return;
    }
    if (migrationEntities.has("blogs")) {
      if (!brandShopify?.connected) {
        setMigrationRunError(
          "Connect Shopify for this brand when Blog posts are included—articles are created via the Shopify Admin API.",
        );
        return;
      }
    }
    setMigrationRunLoading(true);
    setMigrationRunError(null);
    setMigrationPipelineRunId(null);
    setMigrationRunPollHint("");
    setMigrationRunProgress(null);
    try {
      const result = await api.wpShopifyMigrationRun(
        {
          ...wooApiBase(),
          brand_id: brandId,
          entities: Array.from(migrationEntities),
          excluded_ids_by_entity: migrationExcludedIds,
          max_files: 2000,
          create_redirects: pdfImportCreateRedirects,
          skip_if_exists_in_shopify: pdfImportSkipIfExists,
          environment: pipelineEnvironment,
          ...(targetBaseUrl.trim() ? { target_store_url: targetBaseUrl.trim() } : {}),
          ...(migrationTagBlogHandle.trim() ? { shopify_blog_handle: migrationTagBlogHandle.trim() } : {}),
          ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        },
        {
          onRunEnqueued: (runId) => {
            setMigrationPipelineRunId(runId);
            setMigrationRunPollHint("Queued — waiting for runner…");
          },
          onStatus: (st) => {
            if (st === "running") setMigrationRunPollHint("Running — importing to Shopify (this can take several minutes)…");
            else if (st === "queued") setMigrationRunPollHint("Queued…");
            else setMigrationRunPollHint(`Status: ${st}`);
          },
          onWizardProgress: (pl) => {
            const banner =
              typeof pl.phase_banner === "string" && pl.phase_banner.trim() ? pl.phase_banner.trim() : "";
            const blogs = pl.blogs as {
              current?: number;
              total?: number;
              created?: number;
              skipped?: number;
              failed?: number;
            } | undefined;
            const pdfs = pl.pdfs as { current?: number; total?: number } | undefined;
            const blogTags = pl.blog_tags as { current?: number; total?: number } | undefined;
            const bits: string[] = [];
            if (blogs && typeof blogs.current === "number" && typeof blogs.total === "number") {
              const hasCounts =
                typeof blogs.created === "number" &&
                typeof blogs.skipped === "number" &&
                typeof blogs.failed === "number";
              bits.push(
                hasCounts
                  ? `Blog posts ${blogs.current}/${blogs.total} processed — created ${blogs.created}, skipped ${blogs.skipped}, failed ${blogs.failed}`
                  : `Blog posts ${blogs.current}/${blogs.total}`,
              );
            }
            if (pdfs && typeof pdfs.current === "number" && typeof pdfs.total === "number") {
              bits.push(`PDFs ${pdfs.current}/${pdfs.total}`);
            }
            if (blogTags && typeof blogTags.current === "number" && typeof blogTags.total === "number") {
              bits.push(`Blog tags ${blogTags.current}/${blogTags.total}`);
            }
            const suffix = bits.join(" · ");
            if (banner && suffix) setMigrationRunPollHint(`${banner} · ${suffix}`);
            else if (suffix) setMigrationRunPollHint(suffix);
            else if (banner) setMigrationRunPollHint(banner);

            if (pdfs && typeof pdfs.current === "number" && typeof pdfs.total === "number" && pdfs.total > 0) {
              setMigrationRunProgress({ current: pdfs.current, total: pdfs.total });
            } else if (blogs && typeof blogs.current === "number" && typeof blogs.total === "number" && blogs.total > 0) {
              setMigrationRunProgress({ current: blogs.current, total: blogs.total });
            } else if (
              blogTags &&
              typeof blogTags.current === "number" &&
              typeof blogTags.total === "number" &&
              blogTags.total > 0
            ) {
              setMigrationRunProgress({ current: blogTags.current, total: blogTags.total });
            }
          },
        },
      );
      setMigrationRunResult(result);
    } catch (e) {
      setMigrationRunError(formatApiError(e));
    } finally {
      setMigrationRunLoading(false);
      setMigrationRunPollHint("");
      setMigrationRunProgress(null);
    }
  };

  const runPdfImport = async () => {
    if (!wooCredentialsOk) {
      setPdfImportError(
        "Connect WooCommerce for this brand under Brands → Edit brand → WooCommerce.",
      );
      return;
    }
    if (!brandId || !brandShopify?.connected) {
      setPdfImportError("Select a brand in step 1 and connect Shopify for that brand.");
      return;
    }
    if (!migrationEntities.has("pdfs")) {
      setPdfImportError('Enable the "PDFs (media files)" sheet first.');
      return;
    }
    setPdfImportLoading(true);
    setPdfImportError(null);
    setPdfImportResult(null);
    setPdfImportProgress(null);
    setPdfActivePipelineRunId(null);
    try {
      setPdfImportProgress({ current: 0, total: 1, phase: "Loading PDF IDs from WordPress (step 3 preview)…" });
      const excluded = new Set(migrationExcludedIds.pdfs ?? []);
      const pdfIdsForImport: string[] = [];
      const perPage = 100;
      const maxPages = 25;
      let p = 1;
      for (;;) {
        const r = await api.wpShopifyMigrationPreviewItems({
          ...wooApiBase(),
          brand_id: brandId,
          entity: "pdfs",
          page: p,
          per_page: perPage,
          environment: pipelineEnvironment,
          ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        });
        for (const it of r.items) {
          if (!excluded.has(it.id)) pdfIdsForImport.push(it.id);
        }
        const totalPages = Math.max(1, Math.ceil(r.total / r.per_page));
        if (p >= totalPages || p >= maxPages) break;
        p += 1;
      }
      setPdfImportProgress({ current: 0, total: 1, phase: "Enqueueing pipeline job…" });
      const result = await api.wpShopifyMigrationMigratePdfs(
        {
          ...wooApiBase(),
          brand_id: brandId,
          excluded_ids: migrationExcludedIds.pdfs ?? [],
          max_files: 2000,
          create_redirects: pdfImportCreateRedirects,
          skip_if_exists_in_shopify: pdfImportSkipIfExists,
          environment: pipelineEnvironment,
          ...(pdfIdsForImport.length > 0 ? { wordpress_ids: pdfIdsForImport } : {}),
          ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        },
        {
          onRunEnqueued: (runId) => {
            setPdfActivePipelineRunId(runId);
            setPdfImportProgress({ current: 0, total: 1, phase: "Runner executing…" });
          },
          onStatus: (status) => {
            setPdfImportProgress((prev) => ({
              current: prev?.current ?? 0,
              total: prev?.total ?? 1,
              phase: `Run status: ${status}`,
            }));
          },
          onWizardProgress: (pl) => {
            const pdfs = pl.pdfs as { current?: number; total?: number } | undefined;
            if (pdfs && typeof pdfs.current === "number" && typeof pdfs.total === "number") {
              setPdfImportProgress({
                current: pdfs.current,
                total: pdfs.total,
                phase: `PDFs ${pdfs.current} / ${pdfs.total}`,
              });
            }
          },
        },
      );
      setPdfImportResult(result);
    } catch (e) {
      setPdfImportError(formatApiError(e));
    } finally {
      setPdfImportLoading(false);
      setPdfImportProgress(null);
    }
  };

  const runFetchPdfUrlsFromShopify = async () => {
    if (!wooCredentialsOk) {
      setPdfImportError(
        "Connect WooCommerce for this brand under Brands → Edit brand → WooCommerce.",
      );
      return;
    }
    if (!brandId || !brandShopify?.connected) {
      setPdfImportError("Select a brand in step 1 and connect Shopify for that brand.");
      return;
    }
    if (!migrationEntities.has("pdfs")) {
      setPdfImportError('Enable the "PDFs (media files)" sheet first.');
      return;
    }
    const prev = pdfImportResult;
    const excluded = new Set(migrationExcludedIds.pdfs ?? []);
    let wordpress_ids = (prev?.rows ?? [])
      .filter((r) => !r.shopify_file_url?.trim())
      .map((r) => r.wordpress_id)
      .filter((id) => !excluded.has(id));

    /** No saved import table (other browser, cleared storage, preview URL) — use same PDF list as step 3 Details. */
    if (wordpress_ids.length === 0) {
      const dryEff = migrationEffectiveCount("pdfs", migrationDryRunResult?.counts?.pdfs);
      if (dryEff === 0) {
        setPdfImportError(
          "No PDF rows without a URL in the table, and the dry-run count for PDFs after exclusions is 0. Run a dry run, or expand PDFs and un-exclude attachments you want to resolve.",
        );
        return;
      }
      setPdfImportProgress({
        current: 0,
        total: 1,
        phase: "Loading PDF media IDs from WordPress (same API as Details)…",
      });
      const collected: string[] = [];
      const perPage = 100;
      const maxPages = 25;
      let page = 1;
      for (;;) {
        const r = await api.wpShopifyMigrationPreviewItems({
          ...wooApiBase(),
          brand_id: brandId!,
          entity: "pdfs",
          page,
          per_page: perPage,
          environment: pipelineEnvironment,
          ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        });
        for (const it of r.items) {
          if (!excluded.has(it.id)) collected.push(it.id);
        }
        const totalPages = Math.max(1, Math.ceil(r.total / r.per_page));
        if (page >= totalPages || page >= maxPages) break;
        page += 1;
      }
      wordpress_ids = collected.slice(0, 2000);
      if (wordpress_ids.length === 0) {
        setPdfImportProgress(null);
        setPdfImportError(
          "Could not list any PDF attachments from WordPress. Check the Woo URL and keys, add a WordPress app password if media is private, then try again.",
        );
        return;
      }
    }

    if (wordpress_ids.length === 0) {
      setPdfImportError("Every row already has a Shopify file URL.");
      return;
    }
    setPdfResolveLoading(true);
    setPdfImportError(null);
    setPdfImportProgress(null);
    setPdfActivePipelineRunId(null);
    try {
      setPdfImportProgress({ current: 0, total: 1, phase: "Enqueueing resolve job…" });
      const resolved = await api.wpShopifyMigrationResolvePdfUrls(
        {
          ...wooApiBase(),
          brand_id: brandId,
          create_redirects: pdfImportCreateRedirects,
          wordpress_ids,
          environment: pipelineEnvironment,
          ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        },
        {
          onRunEnqueued: (runId) => {
            setPdfActivePipelineRunId(runId);
            setPdfImportProgress({ current: 0, total: 1, phase: "Resolving in runner…" });
          },
          onStatus: (status) => {
            setPdfImportProgress({ current: 0, total: 1, phase: `Run status: ${status}` });
          },
        },
      );
      setPdfImportResult((before) => {
        const base =
          before ??
          prev ?? {
            rows: [] as WpShopifyMigrationPdfRow[],
            redirect_csv: "",
            truncated: false,
          };
        const byId = new Map((base.rows ?? []).map((r) => [r.wordpress_id, { ...r }]));
        for (const r of resolved.rows) {
          const cur = byId.get(r.wordpress_id);
          if (!cur) {
            byId.set(r.wordpress_id, r);
            continue;
          }
          byId.set(r.wordpress_id, {
            ...cur,
            shopify_file_url: r.shopify_file_url ?? cur.shopify_file_url,
            redirect_path: r.redirect_path ?? cur.redirect_path,
            redirect_created: r.redirect_created ?? cur.redirect_created,
            note: r.note ?? cur.note,
            error: r.shopify_file_url ? r.error || undefined : r.error ?? cur.error,
          });
        }
        const rows = Array.from(byId.values());
        const uploaded = rows.filter((x) => x.shopify_file_url).length;
        const failed = rows.filter((x) => x.error && !x.shopify_file_url).length;
        const warnings = rows.filter((x) => x.shopify_file_url && x.error).length;
        return {
          ...base,
          rows,
          redirect_csv: mergeShopifyPdfRedirectCsv(base.redirect_csv ?? "", resolved.redirect_csv ?? ""),
          truncated: base.truncated || resolved.truncated,
          summary: {
            uploaded,
            failed,
            warnings,
            truncated: base.truncated || resolved.truncated,
          },
          hint: resolved.hint ?? base.hint,
        };
      });
    } catch (e) {
      setPdfImportError(formatApiError(e));
    } finally {
      setPdfResolveLoading(false);
      setPdfImportProgress(null);
    }
  };

  const downloadPdfRedirectCsv = () => {
    if (!pdfImportResult?.redirect_csv) return;
    const blob = new Blob([pdfImportResult.redirect_csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shopify-pdf-redirects.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchWooPreviewAllPages = useCallback(
    async (entity: "products" | "categories" | "blogs" | "blog_tags"): Promise<MigrationPreviewItem[]> => {
      const b = brandId.trim();
      if (!b) throw new Error("Select a brand in step 1.");
      const perPage = WOO_REDIRECT_PREVIEW_PER_PAGE;
      const needsWpAuth = entity === "blogs" || entity === "blog_tags";
      const wpOpts =
        needsWpAuth && wpPreviewUser.trim() && wpPreviewAppPassword.trim()
          ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
          : {};
      const fetchPage = (page: number) =>
        api.wpShopifyMigrationPreviewItems({
          ...wooApiBase(),
          brand_id: b,
          entity,
          page,
          per_page: perPage,
          environment: pipelineEnvironment,
          ...wpOpts,
        });
      const first = await fetchPage(1);
      const out = [...first.items];
      const total = first.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      for (let p = 2; p <= totalPages; p++) {
        const r = await fetchPage(p);
        out.push(...r.items);
      }
      return out;
    },
    [brandId, wooApiBase, pipelineEnvironment, wpPreviewUser, wpPreviewAppPassword],
  );

  const runMigrationDryRun = async () => {
    if (!wooCredentialsOk) {
      setMigrationDryRunError("Connect WooCommerce for this brand under Brands → Edit brand → WooCommerce.");
      return;
    }
    const entitiesAtDryRun = new Set(migrationEntities);
    setMigrationDryRunLoading(true);
    setMigrationDryRunError(null);
    setMigrationShopifyOverlapHint(null);
    setMigrationDryRunResult(null);
    try {
      const result = await api.wpShopifyMigrationDryRun({
        ...wooApiBase(),
        entities: Array.from(migrationEntities),
        environment: pipelineEnvironment,
        ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
          ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
          : {}),
      });
      setMigrationDryRunResult(result);
      setMigrationExcludedIds({});
      setMigrationPreviewRows({});
      setMigrationPreviewMeta({});
      setMigrationPreviewPageByEntity({});
      setMigrationPreviewErrorByEntity({});
      setMigrationExpandedEntity(null);

      const bid = brandId.trim();
      const wantsOverlap =
        entitiesAtDryRun.has("products") || entitiesAtDryRun.has("categories");
      if (!wantsOverlap) {
        /* nothing */
      } else if (!bid) {
        setMigrationShopifyOverlapHint(
          "Select a brand in step 1 to compare Woo preview handles with Shopify after a dry run (auto-uncheck Products/Categories when every preview row already exists on the store).",
        );
      } else if (!brandShopify?.connected) {
        setMigrationShopifyOverlapHint(
          "Connect Shopify for this brand to auto-uncheck Products and Categories when every previewed Woo row already exists on Shopify (same handle check as redirect verification in step 6).",
        );
      } else {
        try {
          const hints: string[] = [];
          const toUncheck: string[] = [];

          if (entitiesAtDryRun.has("products")) {
            const [items, shopifyRes] = await Promise.all([
              fetchWooPreviewAllPages("products"),
              api.wpShopifyMigrationShopifyHandles({
                brand_id: bid,
                entity: "products",
                environment: pipelineEnvironment,
              }),
            ]);
            const allowed = new Set(shopifyRes.handles.map((h) => h.toLowerCase()));
            const withSlug = items
              .map((it) => ({ h: wooHandleForShopifyProductOrCollection(it) }))
              .filter((x): x is { h: string } => Boolean(x.h));
            const noSlugCount = items.length - withSlug.length;
            const matched = withSlug.filter((x) => allowed.has(x.h)).length;
            const allDerivedMatch = withSlug.length > 0 && matched === withSlug.length;
            const fullCoverage = items.length > 0 && withSlug.length === items.length;

            if (items.length === 0) {
              hints.push("Products: Woo preview returned no rows (Shopify overlap skipped).");
            } else if (withSlug.length === 0) {
              hints.push("Products: no slug/URL handle could be derived from preview rows — auto-uncheck skipped.");
            } else if (allDerivedMatch && fullCoverage) {
              toUncheck.push("products");
              hints.push(
                `Products: all ${items.length} previewed item(s) match a Shopify product handle — Products was unchecked to avoid duplicate imports.`,
              );
            } else if (allDerivedMatch && noSlugCount > 0) {
              hints.push(
                `Products: all ${withSlug.length} derived handle(s) exist on Shopify, but ${noSlugCount} preview row(s) had no slug — Products left checked.`,
              );
            } else if (matched > 0 && matched < withSlug.length) {
              hints.push(
                `Products: ${matched}/${withSlug.length} previewed handle(s) already exist on Shopify. Leave Products checked to migrate new items only, or use Details to exclude rows.`,
              );
              if (noSlugCount > 0) {
                hints.push(`${noSlugCount} row(s) had no slug and were not compared.`);
              }
            } else if (noSlugCount > 0 && !fullCoverage) {
              hints.push(
                `${noSlugCount} product preview row(s) had no slug — overlap counts use only rows with a derivable handle.`,
              );
            }
          }

          if (entitiesAtDryRun.has("categories")) {
            const [items, shopifyRes] = await Promise.all([
              fetchWooPreviewAllPages("categories"),
              api.wpShopifyMigrationShopifyHandles({
                brand_id: bid,
                entity: "collections",
                environment: pipelineEnvironment,
              }),
            ]);
            const allowed = new Set(shopifyRes.handles.map((h) => h.toLowerCase()));
            const withSlug = items
              .map((it) => ({ h: wooHandleForShopifyProductOrCollection(it) }))
              .filter((x): x is { h: string } => Boolean(x.h));
            const noSlugCount = items.length - withSlug.length;
            const matched = withSlug.filter((x) => allowed.has(x.h)).length;
            const allDerivedMatch = withSlug.length > 0 && matched === withSlug.length;
            const fullCoverage = items.length > 0 && withSlug.length === items.length;

            if (items.length === 0) {
              hints.push("Categories: Woo preview returned no rows (Shopify overlap skipped).");
            } else if (withSlug.length === 0) {
              hints.push("Categories: no slug/URL handle could be derived from preview rows — auto-uncheck skipped.");
            } else if (allDerivedMatch && fullCoverage) {
              toUncheck.push("categories");
              hints.push(
                `Categories (→ collections): all ${items.length} previewed item(s) match a Shopify collection handle — Categories was unchecked to avoid duplicate imports.`,
              );
            } else if (allDerivedMatch && noSlugCount > 0) {
              hints.push(
                `Categories: all ${withSlug.length} derived handle(s) exist on Shopify, but ${noSlugCount} preview row(s) had no slug — Categories left checked.`,
              );
            } else if (matched > 0 && matched < withSlug.length) {
              hints.push(
                `Categories: ${matched}/${withSlug.length} previewed handle(s) already exist on Shopify as collections. Leave Categories checked to migrate new ones only, or use Details to exclude rows.`,
              );
              if (noSlugCount > 0) {
                hints.push(`${noSlugCount} row(s) had no slug and were not compared.`);
              }
            } else if (noSlugCount > 0 && !fullCoverage) {
              hints.push(
                `${noSlugCount} category preview row(s) had no slug — overlap counts use only rows with a derivable handle.`,
              );
            }
          }

          if (toUncheck.length > 0) {
            setMigrationEntities((prev) => {
              const n = new Set(prev);
              for (const id of toUncheck) n.delete(id);
              return n;
            });
          }
          setMigrationShopifyOverlapHint(hints.length > 0 ? hints.join(" ") : null);
        } catch (overlapErr) {
          setMigrationShopifyOverlapHint(
            `Shopify/Woo overlap check after dry run failed: ${formatApiError(overlapErr)}`,
          );
        }
      }
    } catch (e) {
      setMigrationDryRunError(formatApiError(e));
    } finally {
      setMigrationDryRunLoading(false);
    }
  };

  /** Blog handle for /blogs/{handle}/… — migration artifact, step-3 field, or Shopify Admin blog list (no re-run). */
  const resolveBlogHandleForRedirectFetch = useCallback(
    async (): Promise<
      { ok: true; handle: string; hint?: string } | { ok: false; message: string }
    > => {
      const fromMigration = (migrationRunResult?.blog_migration?.shopify_blog_handle ?? "").trim();
      if (fromMigration) return { ok: true, handle: fromMigration };
      const fromField = migrationTagBlogHandle.trim();
      if (fromField) return { ok: true, handle: fromField };

      if (!brandShopify?.connected || !brandId.trim()) {
        return {
          ok: false,
          message:
            "Set the Shopify blog handle in step 3, or connect Shopify for this brand — we can list blogs from Admin (no migration re-run). If the store has several blogs, set the handle here so /blogs/{handle}/… is correct.",
        };
      }
      try {
        const res = await api.wpShopifyMigrationShopifyBlogs({
          brand_id: brandId,
          environment: pipelineEnvironment,
        });
        const blogs = res.blogs ?? [];
        if (blogs.length === 0) {
          return {
            ok: false,
            message:
              "Shopify returned no blogs for this store. Add a blog in Admin → Content → Blog posts, then retry — or type the blog handle in step 3.",
          };
        }
        const sorted = [...blogs].sort((a, b) => a.id - b.id);
        const chosen = sorted[0]!;
        setMigrationTagBlogHandle(chosen.handle);
        if (blogs.length === 1) {
          return { ok: true, handle: chosen.handle };
        }
        return {
          ok: true,
          handle: chosen.handle,
          hint: `${blogs.length} blogs on Shopify — using “${chosen.handle}” (oldest by id${chosen.title ? `: ${chosen.title}` : ""}). Change the handle in step 3 if your posts live on another blog.`,
        };
      } catch (e) {
        return { ok: false, message: formatApiError(e) };
      }
    },
    [
      migrationRunResult?.blog_migration?.shopify_blog_handle,
      migrationTagBlogHandle,
      brandShopify?.connected,
      brandId,
      pipelineEnvironment,
    ],
  );

  const mergeTagArchiveUrlsIntoRedirectMap = useCallback(async () => {
    setRedirectMergeHint(null);
    setRedirectCsvImportError(null);
    const base = sourceUrl.trim() || targetBaseUrl.trim();
    if (!base) {
      setRedirectMergeHint("Set WordPress source URL (step 1) or target base URL so old URLs match redirect rows.");
      return;
    }
    const safe = safeSiteBaseForRedirectMerge(base);
    const csv = migrationRunResult?.blog_tag_redirect_csv?.trim();
    if (csv) {
      const incoming = parseRedirectCsvToRows(csv);
      if (incoming.length === 0) {
        setRedirectMergeHint("Tag redirect CSV had no parseable rows.");
        return;
      }
      setRedirectMap((prev) => mergeRedirectImports(prev, incoming, safe));
      setRedirectMergeHint(
        `Updated ${incoming.length} redirect row(s) from saved tag export (WordPress tag URL → Shopify /blogs/…/tagged/…).`,
      );
      return;
    }
    const storeOrigin = storefrontOriginForRedirectTargets(targetBaseUrl, brandShopify?.shop_domain);
    if (!storeOrigin) {
      setRedirectMergeHint(`${storefrontBaseMissingHint} Or run “Blog tags” migration once for a CSV.`);
      return;
    }
    if (!wooCredentialsOk || !brandId.trim()) {
      setRedirectMergeHint("Connect WooCommerce and select a brand to load WordPress tags from the REST API.");
      return;
    }
    setRedirectAutoFetchLoading("tags");
    try {
      const resolved = await resolveBlogHandleForRedirectFetch();
      if (!resolved.ok) {
        setRedirectMergeHint(resolved.message);
        return;
      }
      const { handle, hint } = resolved;
      const items = await fetchWooPreviewAllPages("blog_tags");
      const incoming = buildTagRedirectRowsFromWpPreviewItems(items, handle, storeOrigin);
      if (incoming.length === 0) {
        setRedirectMergeHint(
          "No WordPress tags with link URLs returned. Open Blog tags preview in step 3, or run Blog tags migration for a CSV.",
        );
        return;
      }
      setRedirectMap((prev) => mergeRedirectImports(prev, incoming, safe));
      setRedirectMergeHint(
        `Updated ${incoming.length} redirect row(s) from live WordPress tags API (→ ${storeOrigin}/blogs/${handle}/tagged/…).${hint ? ` ${hint}` : ""}`,
      );
    } catch (e) {
      setRedirectMergeHint(formatApiError(e));
    } finally {
      setRedirectAutoFetchLoading(null);
    }
  }, [
    sourceUrl,
    targetBaseUrl,
    migrationRunResult?.blog_tag_redirect_csv,
    resolveBlogHandleForRedirectFetch,
    wooCredentialsOk,
    brandId,
    fetchWooPreviewAllPages,
    brandShopify?.shop_domain,
  ]);

  const mergeBlogStorefrontUrlsIntoRedirectMap = useCallback(async () => {
    setRedirectMergeHint(null);
    setRedirectCsvImportError(null);
    const storeOrigin = storefrontOriginForRedirectTargets(targetBaseUrl, brandShopify?.shop_domain);
    if (!storeOrigin) {
      setRedirectMergeHint(storefrontBaseMissingHint);
      return;
    }
    if (!wooCredentialsOk || !brandId.trim()) {
      setRedirectMergeHint("Connect WooCommerce and select a brand to load WordPress posts from the REST API.");
      return;
    }
    setRedirectAutoFetchLoading("blogs");
    try {
      const resolved = await resolveBlogHandleForRedirectFetch();
      if (!resolved.ok) {
        setRedirectMergeHint(resolved.message);
        return;
      }
      const { handle, hint } = resolved;
      const items = await fetchWooPreviewAllPages("blogs");
      let incoming = buildBlogRedirectRowsFromWpPreviewItems(items, handle, storeOrigin);
      const blog = migrationRunResult?.blog_migration;
      if (blog?.rows?.length) {
        const fromMigrate = buildBlogRedirectMergeRows(blog.rows, handle, storeOrigin);
        incoming = [...fromMigrate, ...incoming];
      }
      if (incoming.length === 0) {
        setRedirectMergeHint(
          "No WordPress posts with link + slug from the API. Add WP username + app password in step 3 for drafts, or confirm posts exist.",
        );
        return;
      }
      const siteBase = sourceUrl.trim() || storeOrigin;
      const siteNorm = siteBase.startsWith("http") ? siteBase : `https://${siteBase.replace(/^\/+/, "")}`;
      setRedirectMap((prev) => mergeRedirectImports(prev, incoming, siteNorm));
      setRedirectMergeHint(
        `Updated ${incoming.length} redirect row(s) from WordPress posts API (and any cached migration rows). New URL = ${storeOrigin}/blogs/${handle}/… — assumes Shopify article handles match WP slugs.${hint ? ` ${hint}` : ""}`,
      );
    } catch (e) {
      setRedirectMergeHint(formatApiError(e));
    } finally {
      setRedirectAutoFetchLoading(null);
    }
  }, [
    targetBaseUrl,
    migrationRunResult?.blog_migration,
    sourceUrl,
    wooCredentialsOk,
    brandId,
    fetchWooPreviewAllPages,
    brandShopify?.shop_domain,
    resolveBlogHandleForRedirectFetch,
  ]);

  const collectPdfWordpressIdsForRedirectResolve = useCallback(async (): Promise<string[]> => {
    const b = brandId.trim();
    if (!b) return [];
    const excluded = new Set(migrationExcludedIds.pdfs ?? []);
    const ids: string[] = [];
    const perPage = 100;
    const maxPages = 25;
    let p = 1;
    for (;;) {
      const r = await api.wpShopifyMigrationPreviewItems({
        ...wooApiBase(),
        brand_id: b,
        entity: "pdfs",
        page: p,
        per_page: perPage,
        environment: pipelineEnvironment,
        ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
          ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
          : {}),
      });
      for (const it of r.items) {
        if (!excluded.has(it.id)) ids.push(it.id);
      }
      const totalPages = Math.max(1, Math.ceil(r.total / r.per_page));
      if (p >= totalPages || p >= maxPages) break;
      p += 1;
    }
    return ids.slice(0, 2000);
  }, [brandId, wooApiBase, pipelineEnvironment, migrationExcludedIds.pdfs, wpPreviewUser, wpPreviewAppPassword]);

  const mergePdfCdnUrlsIntoRedirectMap = useCallback(async () => {
    setRedirectMergeHint(null);
    setRedirectCsvImportError(null);
    const raw = sourceUrl.trim() || targetBaseUrl.trim() || "https://example.com";
    const siteNorm = raw.startsWith("http") ? raw : `https://${raw.replace(/^\/+/, "")}`;
    const rows = pdfImportResult?.rows ?? [];
    const withCdn = rows.filter((r) => r.source_url?.trim() && r.shopify_file_url?.trim());
    if (withCdn.length > 0) {
      const incoming = buildPdfRedirectMergeRows(withCdn);
      setRedirectMap((prev) => mergeRedirectImports(prev, incoming, siteNorm));
      setRedirectMergeHint(
        `Updated ${incoming.length} redirect row(s) from the PDF table (Shopify CDN URLs).`,
      );
      return;
    }
    if (!brandShopify?.connected) {
      setRedirectMergeHint("Connect Shopify for this brand, then retry — we resolve PDF URLs from Shopify Files.");
      return;
    }
    if (!wooCredentialsOk || !brandId.trim()) {
      setRedirectMergeHint("Select a brand and connect WooCommerce to list PDF media IDs from WordPress.");
      return;
    }
    setRedirectAutoFetchLoading("pdfs");
    try {
      const ids = await collectPdfWordpressIdsForRedirectResolve();
      if (ids.length === 0) {
        setRedirectMergeHint(
          "No PDF media IDs from WordPress (open PDFs preview in step 3). Or run “Import PDFs to Shopify” first.",
        );
        return;
      }
      const result = await api.wpShopifyMigrationResolvePdfUrls(
        {
          ...wooApiBase(),
          brand_id: brandId,
          wordpress_ids: ids,
          environment: pipelineEnvironment,
          create_redirects: false,
          ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        },
        undefined,
      );
      setPdfImportResult(result);
      const incoming = buildPdfRedirectMergeRows(result.rows);
      if (incoming.length === 0) {
        setRedirectMergeHint(
          "Resolve finished but no rows have both WordPress source_url and a Shopify file URL. Confirm files exist in Shopify Admin → Content → Files.",
        );
        return;
      }
      setRedirectMap((prev) => mergeRedirectImports(prev, incoming, siteNorm));
      setRedirectMergeHint(
        `Updated ${incoming.length} redirect row(s) after resolving PDF URLs from Shopify Files (${ids.length} WP media id(s) scanned).`,
      );
    } catch (e) {
      setRedirectMergeHint(formatApiError(e));
    } finally {
      setRedirectAutoFetchLoading(null);
    }
  }, [
    sourceUrl,
    targetBaseUrl,
    pdfImportResult?.rows,
    brandShopify?.connected,
    wooCredentialsOk,
    brandId,
    collectPdfWordpressIdsForRedirectResolve,
    wooApiBase,
    pipelineEnvironment,
    wpPreviewUser,
    wpPreviewAppPassword,
  ]);

  const mergeProductUrlsIntoRedirectMap = useCallback(async () => {
    setRedirectMergeHint(null);
    setRedirectCsvImportError(null);
    const storeOrigin = storefrontOriginForRedirectTargets(targetBaseUrl, brandShopify?.shop_domain);
    if (!storeOrigin) {
      setRedirectMergeHint(storefrontBaseMissingHint);
      return;
    }
    if (!wooCredentialsOk || !brandId.trim()) {
      setRedirectMergeHint("Select a brand and connect WooCommerce (step 3) to load product permalinks from the REST API.");
      return;
    }
    if (redirectProductsOnlyExistingShopify && !brandShopify?.connected) {
      setRedirectMergeHint(
        "Connect Shopify for this brand (Brands → Edit → Shopify) so we can list real product handles—or turn off “Verify product handles against Shopify” below if you accept unverified Woo slugs (often 404 on the storefront).",
      );
      return;
    }
    setRedirectAutoFetchLoading("products");
    try {
      const items = await fetchWooPreviewAllPages("products");
      const fromWoo = buildProductRedirectMergeRowsFromWooPreview(items, storeOrigin);
      const fromCrawl = buildProductCollectionRedirectRowsFromCrawl(crawlResult, sourceUrl, storeOrigin, "product");
      let incoming = [...fromWoo, ...fromCrawl];
      let shopifyHandleCount: number | null = null;
      if (redirectProductsOnlyExistingShopify) {
        const { handles } = await api.wpShopifyMigrationShopifyHandles({
          brand_id: brandId,
          entity: "products",
          environment: pipelineEnvironment,
        });
        const allowed = new Set(handles.map((h) => h.toLowerCase()));
        shopifyHandleCount = allowed.size;
        const before = incoming.length;
        incoming = filterRedirectRowsByShopifyHandles(incoming, "product", allowed);
        if (incoming.length === 0 && before > 0) {
          setRedirectMergeHint(
            `No rows kept: none of the ${before} Woo/crawl product URL(s) matched an existing Shopify product handle (${allowed.size} handle(s) on the store). Align Woo slugs with Shopify handles or import products first.`,
          );
          return;
        }
      }
      if (incoming.length === 0) {
        setRedirectMergeHint(
          "No product permalinks from Woo (run step 3 dry run and ensure Products preview loads) and no step 1 crawl URLs classified as product. Nothing to merge.",
        );
        return;
      }
      const raw = sourceUrl.trim() || targetBaseUrl.trim() || storeOrigin;
      const siteNorm = raw.startsWith("http") ? raw : `https://${raw.replace(/^\/+/, "")}`;
      setRedirectMap((prev) => mergeRedirectImports(prev, incoming, siteNorm));
      setRedirectMergeHint(
        redirectProductsOnlyExistingShopify && shopifyHandleCount != null
          ? `Updated ${incoming.length} product redirect row(s): kept only handles that exist on Shopify (${shopifyHandleCount} product handle(s) loaded). Before filter: ${fromWoo.length} from Woo, ${fromCrawl.length} from crawl. New URLs use ${storeOrigin}/products/…`
          : `Updated ${incoming.length} row(s): ${fromWoo.length} from Woo products, ${fromCrawl.length} from crawl. Warning: verification was off — New URLs were not checked against Shopify; wrong slugs will 404. New URL pattern ${storeOrigin}/products/{woo-slug}.`,
      );
    } catch (e) {
      setRedirectMergeHint(formatApiError(e));
    } finally {
      setRedirectAutoFetchLoading(null);
    }
  }, [
    targetBaseUrl,
    wooCredentialsOk,
    brandId,
    fetchWooPreviewAllPages,
    crawlResult,
    sourceUrl,
    brandShopify?.shop_domain,
    brandShopify?.connected,
    redirectProductsOnlyExistingShopify,
    pipelineEnvironment,
  ]);

  const mergeCategoryUrlsIntoRedirectMap = useCallback(async () => {
    setRedirectMergeHint(null);
    setRedirectCsvImportError(null);
    const storeOrigin = storefrontOriginForRedirectTargets(targetBaseUrl, brandShopify?.shop_domain);
    if (!storeOrigin) {
      setRedirectMergeHint(storefrontBaseMissingHint);
      return;
    }
    if (!wooCredentialsOk || !brandId.trim()) {
      setRedirectMergeHint("Select a brand and connect WooCommerce (step 3) to load category permalinks from the REST API.");
      return;
    }
    if (redirectCategoriesOnlyExistingShopify && !brandShopify?.connected) {
      setRedirectMergeHint(
        "Connect Shopify for this brand so we can list real collection handles—or turn off “Verify collection handles against Shopify” below if you accept unverified Woo category slugs (often 404).",
      );
      return;
    }
    setRedirectAutoFetchLoading("categories");
    try {
      const items = await fetchWooPreviewAllPages("categories");
      const fromWoo = buildCollectionRedirectMergeRowsFromWooPreview(items, storeOrigin);
      const fromCrawl = buildProductCollectionRedirectRowsFromCrawl(crawlResult, sourceUrl, storeOrigin, "collection");
      let incoming = [...fromWoo, ...fromCrawl];
      let shopifyHandleCount: number | null = null;
      if (redirectCategoriesOnlyExistingShopify) {
        const { handles } = await api.wpShopifyMigrationShopifyHandles({
          brand_id: brandId,
          entity: "collections",
          environment: pipelineEnvironment,
        });
        const allowed = new Set(handles.map((h) => h.toLowerCase()));
        shopifyHandleCount = allowed.size;
        const before = incoming.length;
        incoming = filterRedirectRowsByShopifyHandles(incoming, "collection", allowed);
        if (incoming.length === 0 && before > 0) {
          setRedirectMergeHint(
            `No rows kept: none of the ${before} Woo/crawl category URL(s) matched an existing Shopify collection handle (${allowed.size} handle(s) on the store). Align category slugs with Shopify collection handles or create collections first.`,
          );
          return;
        }
      }
      if (incoming.length === 0) {
        setRedirectMergeHint(
          "No category URLs from Woo and no step 1 crawl URLs classified as category or collection. Nothing to merge.",
        );
        return;
      }
      const raw = sourceUrl.trim() || targetBaseUrl.trim() || storeOrigin;
      const siteNorm = raw.startsWith("http") ? raw : `https://${raw.replace(/^\/+/, "")}`;
      setRedirectMap((prev) => mergeRedirectImports(prev, incoming, siteNorm));
      setRedirectMergeHint(
        redirectCategoriesOnlyExistingShopify && shopifyHandleCount != null
          ? `Updated ${incoming.length} collection redirect row(s): kept only handles that exist on Shopify (${shopifyHandleCount} collection handle(s) loaded, custom + smart). Before filter: ${fromWoo.length} from Woo, ${fromCrawl.length} from crawl. New URLs use ${storeOrigin}/collections/…`
          : `Updated ${incoming.length} row(s): ${fromWoo.length} from Woo categories, ${fromCrawl.length} from crawl. Warning: verification was off — New URLs were not checked against Shopify; Woo “categories” are not necessarily Shopify collections and many will 404. Pattern ${storeOrigin}/collections/{woo-slug}.`,
      );
    } catch (e) {
      setRedirectMergeHint(formatApiError(e));
    } finally {
      setRedirectAutoFetchLoading(null);
    }
  }, [
    targetBaseUrl,
    wooCredentialsOk,
    brandId,
    fetchWooPreviewAllPages,
    crawlResult,
    sourceUrl,
    brandShopify?.shop_domain,
    brandShopify?.connected,
    redirectCategoriesOnlyExistingShopify,
    pipelineEnvironment,
  ]);

  const downloadBlogTagRedirectCsv = () => {
    const csv = migrationRunResult?.blog_tag_redirect_csv;
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wp-tag-archive-urls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pdfImportMissingUrlCount = useMemo(
    () => (pdfImportResult?.rows ?? []).filter((r) => !r.shopify_file_url?.trim()).length,
    [pdfImportResult?.rows],
  );
  /** PDF redirect merge can run from cached table rows alone (no Woo call) when CDN URLs exist. */
  const canMergePdfRedirectsFromTableOnly = useMemo(
    () => (pdfImportResult?.rows ?? []).some((r) => r.source_url?.trim() && r.shopify_file_url?.trim()),
    [pdfImportResult?.rows],
  );

  const redirectDestinationSummary = useMemo(
    () => summarizeRedirectDestinationCoverage(redirectMap),
    [redirectMap],
  );

  /** Enable Fetch when the import table has gaps, or when dry run says there are PDFs (IDs loaded from WordPress preview). */
  const pdfDryRunEffectiveForFetch = migrationEffectiveCount("pdfs", migrationDryRunResult?.counts?.pdfs);
  const pdfImportFetchUrlsTargetCount =
    pdfImportMissingUrlCount > 0
      ? pdfImportMissingUrlCount
      : pdfDryRunEffectiveForFetch != null && pdfDryRunEffectiveForFetch > 0
        ? pdfDryRunEffectiveForFetch
        : 0;

  /** Reconcile WordPress dry-run PDFs vs this table (explains e.g. 471 vs 418). */
  const pdfDryRunTotalCount = migrationDryRunResult?.counts?.pdfs;
  const pdfExcludedFromImportCount = migrationExcludedIds.pdfs?.length ?? 0;
  const pdfEffectiveWordPressCount =
    pdfDryRunTotalCount != null ? Math.max(0, pdfDryRunTotalCount - pdfExcludedFromImportCount) : null;
  const pdfTableRowCount = pdfImportResult?.rows.length ?? 0;
  const pdfRowsWithShopifyUrlCount =
    pdfImportResult?.summary?.uploaded ??
    (pdfImportResult?.rows?.filter((r) => r.shopify_file_url?.trim()).length ?? 0);
  const pdfShortOfShopifyUrlVsInScope =
    pdfEffectiveWordPressCount != null ? Math.max(0, pdfEffectiveWordPressCount - pdfRowsWithShopifyUrlCount) : null;
  const pdfAttachmentsNotInThisTable =
    pdfEffectiveWordPressCount != null ? Math.max(0, pdfEffectiveWordPressCount - pdfTableRowCount) : null;

  const crawlColumns: Column<WpShopifyMigrationCrawlResult["urls"][0]>[] = [
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
          title="WordPress → Shopify migration"
          description="WordPress → Shopify (or any platform). Crawl source, pull GSC/GA4, then plan keyword strategy, redirects, and launch."
        />
        <p className="text-body-small text-fg-muted">
          <Link href="/initiatives" className="text-brand-600 hover:underline">Initiatives</Link>
          {" · "}
          <Link href={`/runs?intent_type=${WP_SHOPIFY_MIGRATION_INTENT}`} className="text-brand-600 hover:underline">WP → Shopify migration runs</Link>
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
                  onChange={(e) => handleBrandChange(e.target.value)}
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
                      Crawl in progress — you can switch tabs; polling uses the API (may take many minutes for link crawl)
                    </span>
                  )}
                </div>
                {crawlLoading && (
                  <div className="w-full overflow-hidden rounded-full bg-fg-muted/20" role="progressbar" aria-label="Crawl in progress">
                    <div className="h-2 w-[30%] min-w-[30%] rounded-full bg-brand-500 animate-crawl-progress" />
                  </div>
                )}
                {crawlLoading && crawlPollHint && (
                  <p className="text-body-small text-fg-muted font-mono">{crawlPollHint}</p>
                )}
                {crawlLoading && (
                  <p className="text-body-small text-fg-muted">
                    Fetching sitemaps and discovering URLs from <strong>{sourceUrl}</strong>. Sitemap-only is usually under a minute; <strong>link-following</strong> can take many minutes. This step uses only the <strong>Control Plane</strong> (<code className="rounded bg-fg-muted/15 px-1 text-caption-small">crawl_execute</code>)—it does not queue a runner crawl. If this hangs, your Vercel proxy may be timing out: raise <code className="rounded bg-fg-muted/15 px-1 text-caption-small">maxDuration</code> on the console route or call the Control Plane directly with CORS. Separate <strong>Pipeline Runs</strong> (e.g. Plans → Start, or snapshots) are unrelated to this table.
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
                    : "Select a brand with Google + GA4 connected in step 1, or enter a GA4 property ID and use service-account OAuth."}{" "}
                  <span className="block mt-1">
                    Search <strong>queries</strong> (keywords) for this wizard come from <strong>Search Console</strong> (Fetch GSC report above). GA4 here supplies <strong>page traffic</strong> only; Google&apos;s Data API no longer exposes an organic search-query dimension.
                  </span>
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
                        <> Legacy: {ga4Result.search_console_queries.length} keywords from GA4 (prefer GSC above).</>
                      )}
                    </p>
                    {ga4Result.search_console_error && (
                      <p className="text-body-small text-state-warning mt-1">{ga4Result.search_console_error}</p>
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
                <h3 className="font-semibold">Platform connections</h3>
                <p className="text-body-small text-fg-muted mt-1">
                  WordPress/WooCommerce and Shopify must be connected on the brand. Credentials are saved under{" "}
                  <strong>Brands → Edit brand</strong> (not in this wizard).
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!brandId ? (
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-body-small text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                    Select a <strong>brand</strong> in step 1, then return here. Migration uses that brand&apos;s WooCommerce and Shopify connectors.
                  </div>
                ) : platformStatusLoading ? (
                  <p className="text-body-small text-fg-muted">Checking WooCommerce and Shopify…</p>
                ) : (
                  <>
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-body-small ${
                        brandWoo?.connected
                          ? "border-emerald-200/80 bg-emerald-50/50 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100"
                          : "border-state-dangerMuted bg-state-dangerMuted/20 text-state-danger"
                      }`}
                    >
                      <span>
                        <strong>WooCommerce (WordPress API)</strong>
                        {brandWoo?.connected
                          ? ` — ${(brandWoo.store_url ?? wooServer).trim() || "connected"}`
                          : " — not connected"}
                      </span>
                      {!brandWoo?.connected && (
                        <Link href={`/brands/${brandId}/edit`} className="shrink-0 font-medium text-brand-600 hover:underline">
                          Connect WooCommerce
                        </Link>
                      )}
                    </div>
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-body-small ${
                        brandShopify?.connected
                          ? "border-emerald-200/80 bg-emerald-50/50 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100"
                          : "border-state-dangerMuted bg-state-dangerMuted/20 text-state-danger"
                      }`}
                    >
                      <span>
                        <strong>Shopify</strong>
                        {brandShopify?.connected
                          ? ` — ${brandShopify.shop_domain ?? "connected"}`
                          : " — not connected"}
                      </span>
                      {!brandShopify?.connected && (
                        <Link href={`/brands/${brandId}/edit`} className="shrink-0 font-medium text-brand-600 hover:underline">
                          Connect Shopify
                        </Link>
                      )}
                    </div>
                    {platformsConnected && (
                      <p className="text-body-small text-fg-muted">Both platforms are connected — migration tools below are enabled.</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            {platformsConnected && (
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

                <p className="text-body-small font-medium text-fg-muted mb-1">Optional: WordPress previews (drafts / private)</p>
                <p className="text-body-small text-fg-muted mb-2">
                  For <strong>blog posts</strong>, <strong>pages</strong>, and <strong>blog tags</strong> details, add an{" "}
                  <a
                    href="https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/"
                    className="text-brand-600 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    application password
                  </a>{" "}
                  (WP Admin → Users → Profile) and your username. Leave blank to preview <strong>published</strong> content only via public REST.
                </p>
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  <Input value={wpPreviewUser} onChange={(ev) => setWpPreviewUser(ev.target.value)} placeholder="WordPress username" className="w-full" />
                  <Input
                    type="password"
                    value={wpPreviewAppPassword}
                    onChange={(ev) => setWpPreviewAppPassword(ev.target.value)}
                    placeholder="Application password (not your login password)"
                    className="w-full"
                  />
                </div>

                {/* Sheets: entity cards (Matrixify-style) */}
                <p className="text-body-small font-medium text-fg-muted mb-1">Sheets</p>
                <p className="text-body-small text-fg-muted mb-2">
                  Click <strong>Details</strong> on any sheet to expand a paginated list. Uncheck <strong>Include</strong> on rows you do not want counted or migrated (exclusions apply to PDF import; other entity runs still use full sheets until ETL is wired). After a successful dry run, if Shopify is connected, we compare Woo preview handles to your store: when <strong>every</strong> product or category row has a handle and all match Shopify, that sheet is unchecked so you do not re-import duplicates; partial overlap shows a hint only.
                </p>
                <div className="space-y-2">
                  {MIGRATION_ENTITIES.map((e) => {
                    const count = migrationDryRunResult?.counts?.[e.id];
                    const selected = migrationEntities.has(e.id);
                    const eff = migrationEffectiveCount(e.id, count);
                    const excludedN = migrationExcludedIds[e.id]?.length ?? 0;
                    const estimateSec = eff != null ? Math.max(5, Math.ceil(eff / 50) * 10) : null;
                    const expanded = migrationExpandedEntity === e.id;
                    const meta = migrationPreviewMeta[e.id];
                    const rows = migrationPreviewRows[e.id] ?? [];
                    const ppage = migrationPreviewPageByEntity[e.id] ?? 1;
                    const maxPage = meta ? Math.max(1, Math.ceil(meta.total / meta.per_page)) : 1;
                    return (
                      <div
                        key={e.id}
                        className={`rounded-lg border transition ${
                          selected ? "border-border bg-bg" : "border-border/50 bg-fg-muted/5 opacity-75"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                          <Checkbox checked={selected} onChange={() => toggleMigrationEntity(e.id)} className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-fg">{e.label}</p>
                            <p className="text-body-small text-fg-muted">{e.source}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2 text-body-small text-fg-muted">
                            {count != null ? (
                              <>
                                <span className="rounded-full bg-fg-muted/20 px-2 py-0.5">Dry run total: {count}</span>
                                {excludedN > 0 && eff != null && (
                                  <span className="rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-900 dark:bg-brand-900/40 dark:text-brand-100">
                                    Selected: {eff} (excluding {excludedN})
                                  </span>
                                )}
                                {estimateSec != null && (
                                  <span className="rounded-full bg-fg-muted/20 px-2 py-0.5">
                                    Est.: {estimateSec >= 60 ? `${Math.floor(estimateSec / 60)} min ${estimateSec % 60} sec` : `${estimateSec} sec`}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="rounded-full bg-fg-muted/20 px-2 py-0.5">Run dry run for counts</span>
                            )}
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={!selected || !wooCredentialsOk}
                              onClick={() => {
                                if (expanded) {
                                  setMigrationExpandedEntity(null);
                                } else {
                                  setMigrationExpandedEntity(e.id);
                                  void fetchMigrationPreview(e.id, 1);
                                }
                              }}
                            >
                              {expanded ? "Hide details" : "Details"}
                            </Button>
                          </div>
                        </div>
                        {expanded && (
                          <div className="border-t border-border px-3 py-3 text-body-small">
                            {migrationPreviewLoadingEntity === e.id && <p className="text-fg-muted mb-2">Loading preview…</p>}
                            {migrationPreviewErrorByEntity[e.id] && (
                              <p className="mb-2 text-state-danger">{migrationPreviewErrorByEntity[e.id]}</p>
                            )}
                            {meta?.scope_note && <p className="mb-2 text-fg-muted">{meta.scope_note}</p>}
                            <p className="mb-2 text-fg-muted">
                              Uncheck <strong>Include</strong> to exclude a row from the effective migrate count. IDs you have not opened in this list still count as included. After changing WP credentials, click Details again to refresh.
                            </p>
                            {rows.length > 0 && (
                              <>
                                <div className="max-h-[min(50vh,420px)] overflow-auto rounded-md border border-border">
                                  <table className="w-full min-w-[520px] border-collapse">
                                    <thead className="sticky top-0 bg-bg">
                                      <tr className="border-b border-border text-left">
                                        <th className="px-2 py-1.5 font-medium">Include</th>
                                        <th className="px-2 py-1.5 font-medium">Status</th>
                                        <th className="px-2 py-1.5 font-medium">Title / code</th>
                                        <th className="px-2 py-1.5 font-medium">Slug / URL</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.map((row) => {
                                        const excluded = (migrationExcludedIds[e.id] ?? []).includes(row.id);
                                        const include = !excluded;
                                        return (
                                          <tr key={row.id} className="border-b border-border/60">
                                            <td className="px-2 py-1 align-top">
                                              <Checkbox
                                                checked={include}
                                                onChange={() => toggleMigrationItemExcluded(e.id, row.id)}
                                              />
                                            </td>
                                            <td className="px-2 py-1 align-top whitespace-nowrap">
                                              <Badge variant="neutral">{row.status}</Badge>
                                            </td>
                                            <td className="px-2 py-1 align-top max-w-[200px] break-words">{row.title}</td>
                                            <td className="px-2 py-1 align-top max-w-[240px] break-all">
                                              {row.url ? (
                                                <a href={row.url} className="text-link hover:underline" target="_blank" rel="noreferrer">
                                                  {row.slug || row.url}
                                                </a>
                                              ) : (
                                                row.slug ?? "—"
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={migrationPreviewLoadingEntity === e.id || ppage <= 1}
                                    onClick={() => void fetchMigrationPreview(e.id, ppage - 1)}
                                  >
                                    Previous page
                                  </Button>
                                  <span className="text-fg-muted">
                                    Page {ppage} of {maxPage} ({meta?.total ?? 0} total)
                                  </span>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={migrationPreviewLoadingEntity === e.id || ppage >= maxPage}
                                    onClick={() => void fetchMigrationPreview(e.id, ppage + 1)}
                                  >
                                    Next page
                                  </Button>
                                  {excludedN > 0 && (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => setMigrationExcludedIds((prev) => ({ ...prev, [e.id]: [] }))}
                                    >
                                      Clear exclusions for {e.label}
                                    </Button>
                                  )}
                                </div>
                              </>
                            )}
                            {migrationPreviewLoadingEntity !== e.id && rows.length === 0 && !migrationPreviewErrorByEntity[e.id] && (
                              <p className="text-fg-muted">No rows on this page.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-body-small text-fg-muted">
                  Counts use WooCommerce and public WordPress REST unless you add an app password above (then Details can include drafts/private).{" "}
                  <strong>Redirects</strong> here is a preview of product + category URLs to remap, not Redirection-plugin rows.
                </p>

                {migrationEntities.has("pdfs") && (
                  <div className="mt-5 rounded-lg border border-border bg-bg p-4">
                    <h3 className="text-sm font-semibold text-fg">PDFs → Shopify Files</h3>
                    <p className="mt-1 text-body-small text-fg-muted">
                      Up to 500 per pass; exclude IDs under PDFs → Details. Import and Fetch run as pipeline jobs (runs, job_runs, artifacts). Shopify app needs{" "}
                      <code className="rounded bg-fg-muted/15 px-1">write_files</code> (and redirect scopes if you enable redirects).
                    </p>
                    {(pdfImportLoading || pdfResolveLoading || pdfActivePipelineRunId) && (
                      <p className="mt-2 text-body-small text-fg-muted">
                        {pdfActivePipelineRunId ? (
                          <>
                            Pipeline run:{" "}
                            <Link href={`/runs/${pdfActivePipelineRunId}`} className="text-link font-medium hover:underline">
                              {pdfActivePipelineRunId.slice(0, 8)}…
                            </Link>
                            {" · "}
                          </>
                        ) : null}
                        <Link href="/runs" className="text-link font-medium hover:underline">
                          All runs
                        </Link>
                        {` · intent ${WP_SHOPIFY_MIGRATION_INTENT}`}
                      </p>
                    )}

                    {pdfDryRunTotalCount != null ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">PDF reconciliation</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                            <div className="rounded-lg border border-border bg-fg-muted/5 px-3 py-2.5">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">WordPress (dry)</div>
                              <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{pdfDryRunTotalCount}</div>
                              <div className="text-xs text-fg-muted">attachments</div>
                            </div>
                            <div className="rounded-lg border border-border bg-fg-muted/5 px-3 py-2.5">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Excluded</div>
                              <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{pdfExcludedFromImportCount}</div>
                              <div className="text-xs text-fg-muted">in Details</div>
                            </div>
                            <div className="rounded-lg border border-border bg-fg-muted/5 px-3 py-2.5">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">In scope</div>
                              <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{pdfEffectiveWordPressCount ?? "—"}</div>
                              <div className="text-xs text-fg-muted">dry − excluded</div>
                            </div>
                            <div className="rounded-lg border border-border bg-fg-muted/5 px-3 py-2.5">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Rows in table</div>
                              <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{pdfTableRowCount}</div>
                              <div className="text-xs text-fg-muted">last import/merge</div>
                            </div>
                            <div className="rounded-lg border border-border bg-fg-muted/5 px-3 py-2.5">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Shopify URL</div>
                              <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{pdfRowsWithShopifyUrlCount}</div>
                              <div className="text-xs text-fg-muted">linked rows</div>
                            </div>
                            <div
                              className={`rounded-lg border px-3 py-2.5 ${
                                (pdfShortOfShopifyUrlVsInScope ?? 0) > 0
                                  ? "border-amber-300/80 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/40"
                                  : "border-border bg-fg-muted/5"
                              }`}
                            >
                              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Short vs in-scope</div>
                              <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{pdfShortOfShopifyUrlVsInScope ?? "—"}</div>
                              <div className="text-xs text-fg-muted">in-scope − URLs</div>
                            </div>
                            <div
                              className={`rounded-lg border px-3 py-2.5 ${
                                (pdfAttachmentsNotInThisTable ?? 0) > 0
                                  ? "border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/35"
                                  : "border-border bg-fg-muted/5"
                              }`}
                            >
                              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Not in table</div>
                              <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{pdfAttachmentsNotInThisTable ?? "—"}</div>
                              <div className="text-xs text-fg-muted">in-scope − rows</div>
                            </div>
                            <div className="rounded-lg border border-border bg-fg-muted/5 px-3 py-2.5">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">In table, no URL</div>
                              <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{pdfImportMissingUrlCount}</div>
                              <div className="text-xs text-fg-muted">use Fetch</div>
                            </div>
                          </div>
                          {(pdfShortOfShopifyUrlVsInScope ?? 0) > 0 || (pdfAttachmentsNotInThisTable ?? 0) > 0 ? (
                            <p className="mt-2 text-body-small leading-relaxed text-fg-muted">
                              <strong className="text-fg">Short vs in-scope</strong> is how many PDFs still need a Shopify file URL to cover every in-scope WordPress attachment (
                              {pdfEffectiveWordPressCount} − {pdfRowsWithShopifyUrlCount}).{" "}
                              <strong className="text-fg">Not in table</strong> are in-scope IDs that never appear in this result grid yet—run another import pass (with{" "}
                              <em>skip if exists</em>
                              ), reduce exclusions, or merge another session. Rows with errors can still count as &quot;with URL&quot; if Shopify returned a link.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                    <label className="mb-3 flex cursor-pointer items-start gap-2 text-body-small text-fg">
                      <Checkbox
                        checked={pdfImportCreateRedirects}
                        onChange={(ev) => setPdfImportCreateRedirects(ev.target.checked)}
                        className="shrink-0"
                      />
                      <span>
                        Create URL redirects on Shopify from old paths (e.g.{" "}
                        <code className="rounded bg-fg-muted/15 px-1">/wp-content/uploads/…</code>) to the new file URLs (needs redirect scope on the Shopify app; if the API skips a row, use the CSV below).
                      </span>
                    </label>
                    <label className="mb-3 flex cursor-pointer items-start gap-2 text-body-small text-fg">
                      <Checkbox
                        checked={pdfImportSkipIfExists}
                        onChange={(ev) => setPdfImportSkipIfExists(ev.target.checked)}
                        className="shrink-0"
                      />
                      <span>
                        Skip upload when a matching PDF already exists in Shopify Files (links the existing file and avoids duplicates).
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => void runPdfImport()}
                        disabled={
                          pdfImportLoading ||
                          pdfResolveLoading ||
                          !shopifyCredentialsOk ||
                          !wooCredentialsOk
                        }
                      >
                        {pdfImportLoading ? "Importing PDFs…" : "Import PDFs to Shopify"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void runFetchPdfUrlsFromShopify()}
                        disabled={
                          pdfImportLoading ||
                          pdfResolveLoading ||
                          !shopifyCredentialsOk ||
                          !wooCredentialsOk ||
                          pdfImportFetchUrlsTargetCount === 0
                        }
                      >
                        {pdfResolveLoading
                          ? "Resolving URLs…"
                          : pdfImportMissingUrlCount > 0
                            ? `Fetch URLs from Shopify (${pdfImportMissingUrlCount} without URL in table)`
                            : `Fetch URLs from Shopify (≈${pdfImportFetchUrlsTargetCount} PDFs from WordPress)`}
                      </Button>
                      {pdfImportResult?.redirect_csv && pdfImportResult.redirect_csv.split("\n").length > 1 && (
                        <Button type="button" variant="secondary" size="sm" onClick={downloadPdfRedirectCsv}>
                          Download redirect CSV
                        </Button>
                      )}
                    </div>
                    {pdfImportFetchUrlsTargetCount === 0 &&
                    !pdfImportLoading &&
                    !pdfResolveLoading &&
                    shopifyCredentialsOk &&
                    wooCredentialsOk && (
                      <p className="mt-2 text-body-small text-fg-muted">
                        <strong className="text-fg">Fetch URLs</strong> is disabled: there are no PDF rows without a URL in the table and no
                        step-3 dry-run PDF count in this session. Re-run the dry run in step 3, or run an import so rows appear, then try
                        again.
                      </p>
                    )}
                    {pdfImportError && (
                      <p className="mt-2 text-body-small text-state-danger">{pdfImportError}</p>
                    )}
                    {(pdfImportLoading || pdfResolveLoading) && pdfImportProgress?.phase && (
                      <div className="mt-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2.5">
                        <p className="text-body-small text-fg-muted">{pdfImportProgress.phase}</p>
                      </div>
                    )}
                    {pdfImportResult?.summary && (
                      <p className="mt-1 text-body-small text-fg-muted">
                        Last run summary: <strong className="text-fg">{pdfImportResult.summary.uploaded ?? 0}</strong> with Shopify file
                        URL, <strong className="text-fg">{pdfImportResult.summary.failed}</strong> failed
                        {pdfImportResult.summary.warnings != null && pdfImportResult.summary.warnings > 0 ? (
                          <>
                            , <strong className="text-fg">{pdfImportResult.summary.warnings}</strong> with warnings
                          </>
                        ) : null}
                        {pdfImportResult.truncated ? (
                          <>
                            . <strong className="text-fg">Truncated</strong>—run again to continue the queue.
                          </>
                        ) : (
                          "."
                        )}{" "}
                        Compare <strong className="text-fg">In scope</strong> vs <strong className="text-fg">Shopify URL</strong> above if counts
                        do not match.
                      </p>
                    )}
                    {pdfImportResult?.hint && <p className="mt-1 text-body-small text-fg-muted">{pdfImportResult.hint}</p>}
                    {pdfImportResult?.rows && pdfImportResult.rows.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">Row detail</p>
                        <div className="max-h-[min(48vh,420px)] overflow-auto rounded-lg border border-border shadow-inner">
                        <table className="w-full min-w-[560px] border-collapse text-body-small">
                          <thead className="sticky top-0 z-10 border-b border-border bg-fg-muted/10 backdrop-blur-sm">
                            <tr className="text-left">
                              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">ID</th>
                              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Title</th>
                              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Note</th>
                              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/70">
                            {pdfImportResult.rows.map((r) => (
                              <tr key={r.wordpress_id} className="transition-colors hover:bg-fg-muted/5">
                                <td className="px-3 py-2 align-top whitespace-nowrap font-mono text-xs text-fg-muted">{r.wordpress_id}</td>
                                <td className="px-3 py-2 align-top max-w-[180px] break-words">{r.title}</td>
                                <td className="px-3 py-2 align-top max-w-[140px] break-words text-fg-muted">
                                  {r.note ?? "—"}
                                </td>
                                <td className="px-3 py-2 align-top max-w-[260px] break-all">
                                  {r.shopify_file_url ? (
                                    <a href={r.shopify_file_url} className="text-link hover:underline" target="_blank" rel="noreferrer">
                                      File URL
                                    </a>
                                  ) : null}
                                  {r.error ? (
                                    <span
                                      className={
                                        r.shopify_file_url ? "mt-0.5 block text-body-small text-state-warning" : "text-state-danger"
                                      }
                                    >
                                      {r.error}
                                    </span>
                                  ) : !r.shopify_file_url ? (
                                    "—"
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Total estimate footer */}
                {migrationDryRunResult?.counts && (() => {
                  const totalItems = Object.entries(migrationDryRunResult.counts).reduce((sum, [k, v]) => {
                    if (!migrationEntities.has(k)) return sum;
                    const eff = migrationEffectiveCount(k, v);
                    return sum + (eff ?? v);
                  }, 0);
                  const totalSec = Math.max(10, Math.ceil(totalItems / 30) * 15);
                  return (
                    <p className="mt-3 text-right text-body-small text-fg-muted">
                      Total estimate (after exclusions): {totalSec >= 60 ? `${Math.floor(totalSec / 60)} min ${totalSec % 60} sec` : `${totalSec} sec`}
                    </p>
                  );
                })()}

                {/* Actions */}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={runMigrationDryRun}
                    disabled={migrationDryRunLoading || migrationEntities.size === 0 || !wooCredentialsOk}
                  >
                    {migrationDryRunLoading ? "Running…" : "Dry run (preview)"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={runMigrationRun}
                    disabled={
                      migrationRunLoading ||
                      migrationEntities.size === 0 ||
                      !wooCredentialsOk ||
                      (!shopifyCredentialsOk &&
                        (migrationEntities.has("pdfs") ||
                          migrationEntities.has("blogs") ||
                          migrationEntities.has("products") ||
                          migrationEntities.has("categories") ||
                          migrationEntities.has("customers") ||
                          migrationEntities.has("redirects") ||
                          migrationEntities.has("discounts") ||
                          migrationEntities.has("pages")))
                    }
                  >
                    {migrationRunLoading ? "Migrating…" : "Run migration"}
                  </Button>
                </div>
                {migrationEntities.has("blog_tags") && (
                  <div className="mt-4 max-w-xl space-y-2 rounded-lg border border-border bg-fg-muted/5 px-3 py-2">
                    <label htmlFor="migration-tag-blog-handle" className="text-body-small font-medium">
                      Shopify blog handle (optional)
                    </label>
                    <Input
                      id="migration-tag-blog-handle"
                      value={migrationTagBlogHandle}
                      onChange={(e) => setMigrationTagBlogHandle(e.target.value)}
                      placeholder="e.g. stigma-cannabis-blog"
                      className="max-w-md"
                    />
                    <p className="text-body-small text-fg-muted">
                      <strong>Order:</strong> import or migrate <strong>blog posts</strong> to Shopify first (tags live on posts—there is no standalone tag import). Then use this export so redirects point at <code className="rounded bg-fg-muted/15 px-1">/blogs/…/tagged/…</code> URLs that will actually resolve. <strong>Optional:</strong> leave blank and, with Shopify connected, step 6 will <strong>fetch blog handles from your store</strong> (single blog = automatic; multiple blogs = oldest by id unless you type the handle here). Fix mismatched handles if WP and Shopify slugs differ.
                    </p>
                  </div>
                )}
                <p className="mt-2 max-w-3xl text-body-small text-fg-muted">
                  <strong>Run migration</strong> pushes selected sheets to Shopify via the pipeline runner: <strong>products</strong> (Woo → catalog), <strong>categories</strong> → custom collections, <strong>customers</strong>, <strong>redirects</strong> (Woo permalinks → Online Store redirects; set <strong>step 5</strong> target URL for destinations), <strong>discounts</strong> (simple percent / fixed_cart / fixed_product coupons → price rules + codes), <strong>pages</strong> (WP → Online Store pages), <strong>PDFs</strong> → Files, <strong>Blog posts</strong> → articles, <strong>Blog tags</strong> → redirect CSV. Shopify must be connected with Admin scopes for <strong>products</strong>, <strong>content</strong> (pages/blog), <strong>customers</strong>, <strong>discounts</strong>, and <strong>Online Store navigation</strong> (redirects) as needed. Each entity run is capped by the same batch limit as blog/PDF imports (from <strong>max_files</strong>, default 2000)—run again to continue. Variable products map Woo variations to Shopify options; grouped/external products are skipped with a row error. <strong>Blog posts</strong>: without a WP application password, only <strong>published</strong> posts import. PDFs upload sequentially; check Pipeline Runs if progress stalls.
                </p>

                {(migrationRunLoading || migrationPipelineRunId) && (
                  <div className="mt-4 max-w-xl rounded-lg border border-border bg-fg-muted/5 px-3 py-3 space-y-2">
                    {migrationPipelineRunId ? (
                      <p className="text-body-small text-fg-muted">
                        Pipeline run:{" "}
                        <Link href={`/runs/${migrationPipelineRunId}`} className="text-link font-medium hover:underline">
                          {migrationPipelineRunId}
                        </Link>
                        {" · "}
                        <Link href="/runs" className="text-link font-medium hover:underline">
                          All runs
                        </Link>
                      </p>
                    ) : null}
                    {migrationRunPollHint ? <p className="text-body-small text-fg-muted">{migrationRunPollHint}</p> : null}
                    {migrationRunLoading ? (
                      <div className="space-y-1">
                        <div
                          className="h-2 w-full overflow-hidden rounded-full bg-fg-muted/25"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={migrationRunProgress && migrationRunProgress.total > 0 ? migrationRunProgress.total : 100}
                          aria-valuenow={
                            migrationRunProgress && migrationRunProgress.total > 0
                              ? migrationRunProgress.current
                              : undefined
                          }
                          aria-label={
                            migrationRunProgress && migrationRunProgress.total > 0
                              ? `Import progress ${migrationRunProgress.current} of ${migrationRunProgress.total}`
                              : "Import in progress"
                          }
                        >
                          {migrationRunProgress && migrationRunProgress.total > 0 ? (
                            <div
                              className="h-full min-w-[4px] rounded-full bg-primary transition-[width] duration-500 ease-out"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(0, (100 * migrationRunProgress.current) / migrationRunProgress.total),
                                )}%`,
                              }}
                            />
                          ) : (
                            <div className="h-full w-1/3 max-w-[40%] animate-pulse rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="text-xs text-fg-muted">Import runs on the pipeline runner; keep this tab open until it finishes.</p>
                      </div>
                    ) : null}
                  </div>
                )}

                {migrationRunResult?.blog_migration && migrationRunResult.blog_migration.rows.length > 0 && (
                  <div className="mt-4 max-w-4xl">
                    <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-2">Blog import — last run</p>
                    <p className="text-body-small text-fg-muted mb-2">
                      Created {migrationRunResult.blog_migration.summary.created}, skipped {migrationRunResult.blog_migration.summary.skipped}, failed{" "}
                      {migrationRunResult.blog_migration.summary.failed}
                      {migrationRunResult.blog_migration.shopify_blog_handle ? (
                        <>
                          {" "}
                          · Shopify blog <code className="rounded bg-fg-muted/15 px-1">{migrationRunResult.blog_migration.shopify_blog_handle}</code>
                        </>
                      ) : null}
                      {migrationRunResult.blog_migration.truncated ? " · Batch limit reached—run again to import more." : ""}
                      {migrationRunResult.blog_migration.wordpress_posts_source === "public_rest" ? (
                        <> · WordPress source: <strong>public REST</strong> (published only)</>
                      ) : migrationRunResult.blog_migration.wordpress_posts_source === "application_password" ? (
                        <> · WordPress source: app password (drafts + full edit context)</>
                      ) : null}
                    </p>
                    {migrationRunResult.blog_migration.hint ? (
                      <p className="text-body-small text-state-warning mb-2">{migrationRunResult.blog_migration.hint}</p>
                    ) : null}
                    <div className="max-h-[min(40vh,360px)] overflow-auto rounded-lg border border-border shadow-inner">
                      <table className="w-full min-w-[640px] border-collapse text-body-small">
                        <thead className="sticky top-0 z-10 border-b border-border bg-fg-muted/10">
                          <tr className="text-left">
                            <th className="px-3 py-2 text-xs font-semibold uppercase text-fg-muted">WP ID</th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase text-fg-muted">Title</th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase text-fg-muted">Shopify</th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase text-fg-muted">Note / error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {migrationRunResult.blog_migration.rows.map((r) => (
                            <tr key={r.wordpress_id} className="border-b border-border/80">
                              <td className="px-3 py-2 font-mono text-xs">{r.wordpress_id}</td>
                              <td className="px-3 py-2 max-w-[200px] truncate" title={r.title}>
                                {r.title}
                              </td>
                              <td className="px-3 py-2">
                                {r.shopify_admin_url ? (
                                  <a href={r.shopify_admin_url} target="_blank" rel="noreferrer" className="text-link hover:underline">
                                    Open
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3 py-2 text-fg-muted">{r.error ?? r.note ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {migrationDryRunError && (
                  <div className="mt-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                    {migrationDryRunError}
                  </div>
                )}
                {migrationShopifyOverlapHint && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-body-small ${
                      migrationShopifyOverlapHint.includes("was unchecked")
                        ? "border-emerald-500/40 bg-emerald-500/10 text-fg-default"
                        : migrationShopifyOverlapHint.includes("failed:")
                          ? "border-state-warning bg-amber-500/10 text-fg-default"
                          : "border-border bg-fg-muted/5 text-fg-muted"
                    }`}
                  >
                    <span className="font-medium text-fg">After dry run — Shopify overlap: </span>
                    {migrationShopifyOverlapHint}
                  </div>
                )}
                {migrationRunError && (
                  <div className="mt-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                    {migrationRunError}
                  </div>
                )}
                {migrationRunResult && (
                  <div className="mt-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2 text-body-small">
                    {migrationRunResult.run_id
                      ? `Recorded on initiative. Run: /runs/${migrationRunResult.run_id}. ${migrationRunResult.message ?? ""}`.trim()
                      : migrationRunResult.message ?? "Migration run completed."}
                    {Array.isArray(migrationRunResult.unsupported) && migrationRunResult.unsupported.length > 0 ? (
                      <div className="mt-3 rounded-md border border-amber-500/45 bg-amber-500/10 px-3 py-2 text-body-small">
                        <p className="font-medium text-fg">Unknown entity keys (skipped):</p>
                        <ul className="mt-1 list-disc pl-5 text-fg-muted">
                          {migrationRunResult.unsupported.map((id) => (
                            <li key={id}>{MIGRATION_ENTITIES.find((e) => e.id === id)?.label ?? id}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {migrationRunResult.parallel_migration_jobs && migrationRunResult.run_id ? (
                      <p className="mt-2 text-body-small text-fg-muted">
                        This migration was queued as <strong>two parallel jobs</strong> (content branch vs PDF branch) so different runners can execute them at the same time. Open{" "}
                        <Link href={`/runs/${migrationRunResult.run_id}`} className="text-link font-medium hover:underline">
                          the run
                        </Link>{" "}
                        to see both job rows and per-job events. You can refresh Shopify Admin while the run is in progress to confirm files and articles appearing.
                      </p>
                    ) : null}
                    {((migrationRunResult.blog_tag_redirect_csv_rows ?? 0) > 0 || Boolean(migrationRunResult.blog_tag_redirect_csv?.trim())) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" type="button" onClick={() => void mergeTagArchiveUrlsIntoRedirectMap()}>
                          {migrationRunResult.blog_tag_redirect_csv_rows != null && migrationRunResult.blog_tag_redirect_csv_rows > 0
                            ? `Merge ${migrationRunResult.blog_tag_redirect_csv_rows} tag archive URL(s) into redirect map`
                            : "Merge tag archive URL(s) into redirect map"}
                        </Button>
                        <Button variant="secondary" size="sm" type="button" onClick={downloadBlogTagRedirectCsv}>
                          Download tag redirect CSV
                        </Button>
                      </div>
                    )}
                    {redirectMergeHint ? (
                      <p
                        className={`mt-2 text-body-small ${redirectMergeHint.startsWith("Updated ") ? "text-state-success" : "text-state-warning"}`}
                      >
                        {redirectMergeHint}
                      </p>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
            )}
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
                    {!gscResult?.page_queries?.length && (ga4Result?.search_console_queries?.length ?? 0) > 0 && (
                      <div className="mb-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2 text-body-small">
                        <strong>Traffic keywords</strong> are from GA4 Search Console (site-level; {ga4Result?.search_console_queries?.length ?? 0} keywords). Per-URL keywords need GSC in Step 2. You can fetch monthly search volume for these keywords below.
                      </div>
                    )}
                    {(ga4Result?.search_console_queries?.length ?? 0) > 0 && (
                      <div className="mb-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2">
                        <p className="text-body-small font-medium mb-2">Keywords from GA4 Search Console (site-level) — use for monthly search volume</p>
                        <ul className="text-body-small space-y-1 list-disc list-inside max-h-[min(50vh,320px)] overflow-y-auto">
                          {(ga4Result?.search_console_queries ?? [])
                            .slice(0, ga4ScQueriesExpanded ? undefined : 50)
                            .map((q, idx) => (
                              <li key={idx}>
                                {q.query}{" "}
                                <span className="text-fg-muted">
                                  ({q.clicks} clicks, {q.impressions} impr.)
                                </span>
                              </li>
                            ))}
                        </ul>
                        {(ga4Result?.search_console_queries?.length ?? 0) > 50 && (
                          <button
                            type="button"
                            className="mt-2 text-body-small font-medium text-brand-600 hover:underline"
                            onClick={() => setGa4ScQueriesExpanded((x) => !x)}
                          >
                            {ga4ScQueriesExpanded
                              ? "Show fewer"
                              : `Show all ${ga4Result?.search_console_queries?.length ?? 0} keywords`}
                          </button>
                        )}
                      </div>
                    )}
                    {ga4Result?.search_console_error && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2 text-body-small">
                        {ga4Result.search_console_error}
                      </div>
                    )}
                    {!gscResult?.page_queries?.length && (gscResult?.queries?.length ?? 0) > 0 && (
                      <div className="mb-3 rounded-lg border border-border bg-fg-muted/5 px-3 py-2 text-body-small text-fg-muted">
                        You have <strong>{gscResult?.queries?.length ?? 0}</strong> Search Console queries but no per-URL keyword rows yet. In Step 2, use the exact property URL from Search Console (including trailing slash or <code className="bg-fg-muted/20 px-1">sc-domain:…</code> if needed) and redeploy the API if keywords-per-URL still show 0.
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
                      <table className="w-full min-w-[760px] border-collapse text-body-small">
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
                            const trafficRowKey = `${i}::${r.path}`;
                            const trafficExpanded = expandedKeywordRowKeys.has(trafficRowKey);
                            const visibleKeywords = trafficExpanded || keywords.length <= 8 ? keywords : keywords.slice(0, 8);
                            return (
                            <tr key={`${r.path}-${i}`} className="border-b border-border/50">
                              <td className="px-2 py-1 whitespace-nowrap"><code className="text-body-small">{r.path}</code></td>
                              <td className="px-2 py-1 whitespace-nowrap"><Badge variant="neutral">{r.type}</Badge></td>
                              <td className="px-2 py-1 text-right">{r.clicks}</td>
                              <td className="px-2 py-1 text-right">{r.sessions}</td>
                              <td className="px-2 py-1">
                                <Input value={r.primaryKeyword} onChange={(e) => setKeywordRows((prev) => prev.map((row, j) => (j === i ? { ...row, primaryKeyword: e.target.value } : row)))} className="min-w-[120px]" placeholder="e.g. THC tonics" />
                              </td>
                              <td className="px-2 py-1 max-w-[min(100vw,320px)] align-top">
                                {keywords.length === 0 ? (
                                  <span className="text-fg-muted">—</span>
                                ) : (
                                  <div>
                                    <ul
                                      className={`list-disc list-inside text-body-small space-y-0.5 ${trafficExpanded ? "max-h-[min(50vh,360px)] overflow-y-auto pr-1" : ""}`}
                                    >
                                      {visibleKeywords.map((k, ki) => {
                                        const vol = keywordVolumeMap[k.query];
                                        const volStr = vol !== undefined && vol > 0 ? (vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : String(vol)) : null;
                                        return (
                                          <li key={ki} title={`${k.clicks} clicks, ${k.impressions} impressions${volStr ? `, ${vol} monthly searches` : ""}`}>
                                            {k.query}{" "}
                                            <span className="text-fg-muted">
                                              ({k.clicks}
                                              {volStr ? `, ${volStr} vol` : ""})
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                    {keywords.length > 8 && (
                                      <button
                                        type="button"
                                        className="mt-1.5 block w-full text-left text-body-small font-medium text-brand-600 hover:underline"
                                        onClick={() => toggleKeywordTrafficExpanded(trafficRowKey)}
                                      >
                                        {trafficExpanded ? "Show less" : `Show all ${keywords.length} keywords`}
                                      </button>
                                    )}
                                  </div>
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
                <p className="text-body-small text-fg-muted mb-3">
                  Define pages to create on the new site: path, type, priority, and placement (nav / footer / deep).{" "}
                  <span className="block mt-1">
                    <strong>Demand score</strong> ranks URLs by GSC clicks + GA4 sessions (last fetch) and, when you ran{" "}
                    <em>Fetch monthly search volume</em> in step 4, the largest monthly volume among the primary keyword and GSC queries for that URL. Higher demand → higher priority (top ~25% high, next ~40% medium, rest low); top ~10% nav, next ~20% footer.
                  </span>
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Button variant="primary" size="sm" onClick={() => setPagePlan((prev) => [...prev, { path: "", type: "page", priority: "medium", placement: "deep" }])}>
                    Add page
                  </Button>
                  {keywordRows.filter((r) => r.action === "keep").length > 0 && pagePlan.length === 0 && (
                    <Button variant="secondary" size="sm" onClick={suggestPagePlanFromKeep}>
                      Suggest from &quot;keep&quot; pages (sorted by demand)
                    </Button>
                  )}
                  {keywordRows.filter((r) => r.action === "keep").length > 0 && pagePlan.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={rerankPagePlanByDemand} title="Reorder rows and reset priority/placement from current demand scores">
                      Re-sort &amp; reprioritize by demand
                    </Button>
                  )}
                </div>
                <div className="w-full max-w-full overflow-auto max-h-[50vh] rounded-lg border border-border">
                  <table className="w-full border-collapse text-body-small">
                    <thead className="sticky top-0 z-10 bg-bg border-b border-border shadow-sm">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Path</th>
                        <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Demand</th>
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
                          <td className="px-2 py-1 text-fg-muted tabular-nums whitespace-nowrap" title="Traffic ×10 + max keyword volume (step 4)">
                            {row.demandScore != null ? row.demandScore.toLocaleString() : "—"}
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
                <p className="text-body-small text-fg-muted mb-3">
                  Mappings are saved in this browser and reload after refresh or redeploy (same origin). They are tied to the brand and source URL from step 1; changing the brand clears saved redirects.
                </p>
                <p className="text-body-small text-fg-muted mb-3">
                  <strong>Import CSV (merge)</strong> updates rows when the <strong>pathname</strong> matches (e.g. crawl rows as full URLs and Shopify PDF export as <code className="rounded bg-fg-muted/15 px-1">/wp-content/…</code> are treated as the same old URL). <strong>PDFs / uploads</strong> also match across small spelling differences (encoding, case) so the same file is not two rows. Merging never replaces a real Shopify file URL with an empty cell. Use <strong>Dedupe old URLs</strong> if you already have duplicates from an older session.
                </p>
                <p className="text-body-small text-fg-muted mb-3">
                  <strong>Fetch blog / PDF / Map tag</strong> use live WordPress (posts + tags) like PDFs use Shopify Files when needed. If you did not run blog migration again, <strong>connect Shopify</strong> and we <strong>list blogs from Admin</strong> to pick <code className="rounded bg-fg-muted/15 px-1">/blogs/{"{handle}"}/…</code> automatically (oldest blog by id when there are several—override in step 3).
                </p>
                <p className="text-body-small text-fg-muted mb-3">
                  <strong>Fetch product / category URLs</strong> load Woo permalinks (and matching crawl URLs). By default we <strong>verify every destination</strong> against your connected Shopify store (Admin API, read-only): only handles that <strong>already exist</strong> as products or collections become New URLs. That avoids shipping redirects to <code className="rounded bg-fg-muted/15 px-1">/collections/blog</code> or <code className="rounded bg-fg-muted/15 px-1">/products/foo</code> when Shopify has no such handle. Uncheck verification only if you intentionally want raw Woo slugs without a guarantee they resolve.
                </p>
                <p className="text-body-small text-fg-muted mb-3">
                  <strong>This step does not import</strong> products or collections into Shopify; it only updates the redirect table in your browser. Existing rows are not auto-corrected when you change verification—edit or remove bad New URLs, or re-fetch products/categories with verification on. Step 3 “double import” is separate from this redirect list.
                </p>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <label className="flex cursor-pointer items-center gap-2 text-body-small text-fg-muted">
                    <Checkbox
                      checked={redirectProductsOnlyExistingShopify}
                      onChange={(e) => setRedirectProductsOnlyExistingShopify(e.target.checked)}
                      className="shrink-0"
                    />
                    Verify product handles against Shopify (recommended — skips URLs that would 404)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-body-small text-fg-muted">
                    <Checkbox
                      checked={redirectCategoriesOnlyExistingShopify}
                      onChange={(e) => setRedirectCategoriesOnlyExistingShopify(e.target.checked)}
                      className="shrink-0"
                    />
                    Verify collection handles against Shopify (recommended — Woo categories ≠ collections)
                  </label>
                </div>
                {(!redirectProductsOnlyExistingShopify || !redirectCategoriesOnlyExistingShopify) && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2 text-body-small text-fg-default">
                    <strong>Unverified mode:</strong> One or both checks above are off. New URLs are built only from WooCommerce slugs and crawl paths—<strong>not</strong> checked against your Shopify catalog. Expect 404s until handles match exactly (e.g. a Woo “blog” category is not a Shopify collection unless you created one with that handle).
                  </div>
                )}
                <input
                  ref={redirectCsvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  aria-hidden
                  onChange={onRedirectCsvFileChange}
                />
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {(crawlResult?.urls?.length || ga4Result?.pages?.length) ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setRedirectMap(buildRedirectMapFromCrawlAndGa4())}>
                      Re-seed from crawl + GA4 (union, no duplicates)
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={redirectMap.length === 0}
                    onClick={downloadRedirectCsv}
                  >
                    Export CSV
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => triggerRedirectCsvImport("merge")}>
                    Import CSV (merge)
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => triggerRedirectCsvImport("replace")}>
                    Import CSV (replace all)
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={redirectMap.length === 0}
                    title="Collapse rows that share the same normalized old URL (e.g. duplicate PDF paths) and keep the best New URL."
                    onClick={() => {
                      const base = safeSiteBaseForRedirectMerge(sourceUrl.trim() || targetBaseUrl.trim());
                      setRedirectMap((prev) => dedupeRedirectMapRows(prev, base));
                      setRedirectMergeHint(
                        "Deduped by normalized old URL — kept the stronger New URL per row (e.g. cdn.shopify.com over empty).",
                      );
                    }}
                  >
                    Dedupe old URLs
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!wooCredentialsOk || !brandId.trim() || redirectAutoFetchLoading !== null}
                    title="Loads WordPress post permalinks (paginated REST) and sets New URL to https://…/blogs/{handle}/{slug}. Blog handle: step 3 field, last migration, or Shopify blog list when connected."
                    onClick={() => void mergeBlogStorefrontUrlsIntoRedirectMap()}
                  >
                    {redirectAutoFetchLoading === "blogs" ? "Loading posts…" : "Fetch blog URLs"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={
                      redirectAutoFetchLoading !== null ||
                      (!canMergePdfRedirectsFromTableOnly &&
                        (!wooCredentialsOk || !brandId.trim() || !brandShopify?.connected))
                    }
                    title="Uses PDF table CDN URLs when present; otherwise lists WP PDF media IDs and resolves URLs from Shopify Files (no re-upload)."
                    onClick={() => void mergePdfCdnUrlsIntoRedirectMap()}
                  >
                    {redirectAutoFetchLoading === "pdfs" ? "Resolving PDFs…" : "Fetch PDF URLs"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!wooCredentialsOk || !brandId.trim() || redirectAutoFetchLoading !== null}
                    title="Uses saved tag CSV from a past run when present; otherwise WordPress tags API → https://…/blogs/{handle}/tagged/… (blog handle from step 3, migration, or Shopify blog list)."
                    onClick={() => void mergeTagArchiveUrlsIntoRedirectMap()}
                  >
                    {redirectAutoFetchLoading === "tags" ? "Loading tags…" : "Map tag URLs"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={
                      !wooCredentialsOk ||
                      !brandId.trim() ||
                      redirectAutoFetchLoading !== null ||
                      (redirectProductsOnlyExistingShopify && !brandShopify?.connected)
                    }
                    title="Default: lists Shopify product handles via Admin API and only keeps rows that match. Uncheck verification to guess from Woo slugs (404 risk)."
                    onClick={() => void mergeProductUrlsIntoRedirectMap()}
                  >
                    {redirectAutoFetchLoading === "products" ? "Loading products…" : "Fetch product URLs"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={
                      !wooCredentialsOk ||
                      !brandId.trim() ||
                      redirectAutoFetchLoading !== null ||
                      (redirectCategoriesOnlyExistingShopify && !brandShopify?.connected)
                    }
                    title="Default: lists Shopify collection handles (custom + smart) and only keeps matches. Uncheck to guess from Woo category slugs (404 risk)."
                    onClick={() => void mergeCategoryUrlsIntoRedirectMap()}
                  >
                    {redirectAutoFetchLoading === "categories" ? "Loading categories…" : "Fetch category URLs"}
                  </Button>
                </div>
                {(!wooCredentialsOk || !brandId.trim()) && (
                  <p className="mb-3 text-body-small text-state-warning">
                    <strong>Blog, tag, product, and category</strong> fetch buttons need a <strong>selected brand</strong> (step 1) and{" "}
                    <strong>WooCommerce connected</strong> for that brand (Brands → Edit → WooCommerce).{" "}
                    <strong>Fetch PDF URLs</strong> stays enabled if the step 3 PDF table already has Shopify CDN URLs for rows.
                  </p>
                )}
                {!storefrontOriginForRedirectTargets(targetBaseUrl, brandShopify?.shop_domain) && brandId.trim() && (
                  <p className="mb-3 text-body-small text-fg-muted">
                    Tip: fill <strong>New site base URL</strong> in step 5 with your live storefront (custom domain). If it’s empty but Shopify is connected, we fall back to the shop domain (often{" "}
                    <code className="rounded bg-fg-muted/15 px-1">*.myshopify.com</code>).
                  </p>
                )}
                {redirectCsvImportError && (
                  <p className="mb-3 text-body-small text-state-danger">{redirectCsvImportError}</p>
                )}
                {redirectMergeHint && (
                  <p
                    className={`mb-3 text-body-small ${redirectMergeHint.startsWith("Updated ") ? "text-state-success" : "text-state-warning"}`}
                  >
                    {redirectMergeHint}
                  </p>
                )}
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
                    <p className="mt-2 text-body-small text-fg-muted">
                      Showing all{" "}
                      <span className="tabular-nums font-medium text-fg-default">{redirectDestinationSummary.total}</span> rows.
                      {redirectDestinationSummary.expectsForward > 0 ? (
                        <>
                          {" "}
                          <span className="tabular-nums font-medium text-fg-default">{redirectDestinationSummary.withDestination}</span>
                          <span className="text-fg-muted"> / </span>
                          <span className="tabular-nums">{redirectDestinationSummary.expectsForward}</span> forward redirects (301/302/consolidate)
                          have a real <strong>New URL</strong>
                          {redirectDestinationSummary.missingOrPlaceholder > 0 ? (
                            <span className="text-state-warning">
                              {" "}
                              — <span className="tabular-nums font-medium">{redirectDestinationSummary.missingOrPlaceholder}</span> still empty or
                              placeholder
                            </span>
                          ) : (
                            <span className="text-state-success"> — all filled</span>
                          )}
                        </>
                      ) : redirectDestinationSummary.total > 0 ? (
                        <> All rows are non-forward (e.g. drop).</>
                      ) : null}
                      {redirectDestinationSummary.drop > 0 ? (
                        <>
                          {" "}
                          · <span className="tabular-nums">{redirectDestinationSummary.drop}</span> <code className="rounded bg-fg-muted/15 px-1">drop</code>
                        </>
                      ) : null}
                      . Step 7: validate destinations.
                    </p>
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
                {redirectMap.length > 0 && (
                  <p className="mt-2 text-body-small text-fg-muted">
                    <span className="tabular-nums font-medium text-fg-default">{redirectDestinationSummary.total}</span> rows total.
                    {redirectDestinationSummary.expectsForward > 0 ? (
                      <>
                        {" "}
                        <span className="tabular-nums font-medium text-fg-default">{redirectDestinationSummary.withDestination}</span>
                        <span className="text-fg-muted"> / </span>
                        <span className="tabular-nums">{redirectDestinationSummary.expectsForward}</span> forward rows have a usable{" "}
                        <strong>New URL</strong>
                        {redirectDestinationSummary.missingOrPlaceholder > 0 ? (
                          <span className="text-state-warning">
                            {" "}
                            (<span className="tabular-nums font-medium">{redirectDestinationSummary.missingOrPlaceholder}</span> missing or
                            placeholder)
                          </span>
                        ) : (
                          <span className="text-state-success"> (all filled)</span>
                        )}
                      </>
                    ) : (
                      <> No 301/302/consolidate rows in this map.</>
                    )}
                    {redirectDestinationSummary.drop > 0 ? (
                      <>
                        {" "}
                        · <span className="tabular-nums">{redirectDestinationSummary.drop}</span>{" "}
                        <code className="rounded bg-fg-muted/15 px-1">drop</code>
                      </>
                    ) : null}
                    . Resolve issues before launch; step 9 checklist follows.
                  </p>
                )}
                {redirectMap.length === 0 && (
                  <p className="mt-2 text-body-small text-fg-muted">Resolve any issues before launch. Step 9 will show a checklist.</p>
                )}
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
                      if (brandId.trim()) {
                        void api
                          .wpShopifyWizardStateSnapshotEnqueue({
                            brand_id: brandId,
                            environment: pipelineEnvironment,
                            wizard_step: 9,
                            summary: {
                              launch_ack: true,
                              checklist: launchChecklist,
                              redirects: redirectMap.length,
                              page_plan: pagePlan.length,
                            },
                          })
                          .catch(() => {
                            /* non-blocking */
                          });
                      }
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
