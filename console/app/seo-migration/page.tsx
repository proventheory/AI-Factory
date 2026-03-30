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
  SeoMigrationCrawlResult,
  SeoGscReport,
  SeoGa4Report,
  BrandProfileRow,
  MigrationPreviewItem,
  SeoMigrationMigratePdfsResult,
  SeoMigrationPdfRow,
} from "@/lib/api";
import { formatApiError } from "@/lib/api";

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

function mergeRedirectImports(existing: RedirectRow[], incoming: RedirectRow[]): RedirectRow[] {
  const byOld = new Map(existing.map((r) => [r.old_url, { ...r }]));
  for (const row of incoming) {
    const prev = byOld.get(row.old_url);
    byOld.set(row.old_url, {
      old_url: row.old_url,
      new_url: row.new_url,
      status: row.status,
      destinationOk: prev?.destinationOk,
      issue: prev?.issue,
    });
  }
  return Array.from(byOld.values());
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

const KEYWORD_VOLUME_CHUNK = 400;

const CRAWL_CACHE_KEY = "seo-migration-crawl-cache";
const WIZARD_SESSION_KEY = "seo-migration-wizard-session";
/** Small snapshot so brand / step / URLs survive even if the full session JSON fails (quota) or predates session feature. */
const WIZARD_LITE_KEY = "seo-migration-wizard-lite";
/** WooCommerce REST credentials: kept separate so they survive clearing the main wizard session (e.g. changing brand). */
const WOO_STORE_CACHE_KEY = "seo-migration-woo-store";
/** Redirect map (step 6–7): separate from main session so mappings survive localStorage quota failures on large GSC/crawl payloads. */
const REDIRECT_MAP_SIDE_KEY = "seo-migration-redirect-map-side";

function normalizeWooServerForPdfCache(s: string): string {
  return s.trim().replace(/\/+$/, "").toLowerCase();
}

function pdfImportCacheStorageKey(brandId: string, wooNorm: string): string {
  return `ai-factory.seoPdfImport.v1:${brandId}:${wooNorm}`;
}

type PdfImportBrowserCache = {
  savedAt: string;
  dryPdfCount?: number;
  rows: SeoMigrationPdfRow[];
  summary?: SeoMigrationMigratePdfsResult["summary"];
  truncated?: boolean;
  redirect_csv: string;
};

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
  wooConsumerKey?: string;
  wooConsumerSecret?: string;
};

type WooStoreCache = {
  wooServer: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
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
    console.warn("SEO migration: could not save full wizard session (localStorage quota?). Lite backup still has brand & URLs.", e);
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

function getWooStoreCache(): WooStoreCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WOO_STORE_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<WooStoreCache>;
    return {
      wooServer: typeof o.wooServer === "string" ? o.wooServer : "",
      wooConsumerKey: typeof o.wooConsumerKey === "string" ? o.wooConsumerKey : "",
      wooConsumerSecret: typeof o.wooConsumerSecret === "string" ? o.wooConsumerSecret : "",
    };
  } catch {
    return null;
  }
}

function setWooStoreCache(woo: WooStoreCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WOO_STORE_CACHE_KEY, JSON.stringify(woo));
  } catch {
    // ignore
  }
}

function coalesceWooField(saved: string | undefined, cached: string | undefined): string {
  const s = (saved ?? "").trim();
  if (s.length > 0) return s;
  return (cached ?? "").trim();
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
    console.warn("SEO migration: could not save redirect map sidecar (quota?).", e);
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
  const [pdfImportLoading, setPdfImportLoading] = useState(false);
  const [pdfImportError, setPdfImportError] = useState<string | null>(null);
  const [pdfImportResult, setPdfImportResult] = useState<SeoMigrationMigratePdfsResult | null>(null);
  const [pdfImportProgress, setPdfImportProgress] = useState<{
    current: number;
    total: number;
    title?: string;
    phase?: string;
  } | null>(null);
  const [pdfImportCreateRedirects, setPdfImportCreateRedirects] = useState(true);
  const [pdfImportSkipIfExists, setPdfImportSkipIfExists] = useState(true);
  const [pdfResolveLoading, setPdfResolveLoading] = useState(false);

  /** Vercel preview hostnames change per deployment; localStorage is per-origin, so each preview starts empty. */
  const [isVercelPreviewHost, setIsVercelPreviewHost] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsVercelPreviewHost(window.location.hostname.endsWith(".vercel.app"));
  }, []);

  // Step 4: Keyword strategy (merged URL list + theme/action)
  const [keywordRows, setKeywordRows] = useState<KeywordRow[]>([]);
  const [keywordVolumeMap, setKeywordVolumeMap] = useState<Record<string, number>>({});
  const [keywordVolumeLoading, setKeywordVolumeLoading] = useState(false);
  const [keywordVolumeError, setKeywordVolumeError] = useState<string | null>(null);
  /** Step 4: per-row expand for full GSC keyword list (Airtable-style). */
  const [expandedKeywordRowKeys, setExpandedKeywordRowKeys] = useState<Set<string>>(() => new Set());
  const [ga4ScQueriesExpanded, setGa4ScQueriesExpanded] = useState(false);
  const [redirectCsvImportError, setRedirectCsvImportError] = useState<string | null>(null);
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
        const wooOnly = getWooStoreCache();
        if (wooOnly && (wooOnly.wooServer || wooOnly.wooConsumerKey)) {
          setWooServer(wooOnly.wooServer);
          setWooConsumerKey(wooOnly.wooConsumerKey);
          setWooConsumerSecret(wooOnly.wooConsumerSecret);
        }
        hasRestoredSessionRef.current = true;
        return;
      }
      hasRestoredSessionRef.current = true;
      skipNextPersistRef.current = true;

      const wooCached = getWooStoreCache();
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
          setRedirectMap(diskRm !== null ? diskRm : sessionRm);
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
        setWooServer(coalesceWooField(session.wooServer, wooCached?.wooServer));
        setWooConsumerKey(coalesceWooField(session.wooConsumerKey, wooCached?.wooConsumerKey));
        setWooConsumerSecret(coalesceWooField(session.wooConsumerSecret, wooCached?.wooConsumerSecret));
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
        setWooServer(coalesceWooField(undefined, wooCached?.wooServer));
        setWooConsumerKey(coalesceWooField(undefined, wooCached?.wooConsumerKey));
        setWooConsumerSecret(coalesceWooField(undefined, wooCached?.wooConsumerSecret));
        setWizardLite(lite);
        {
          const diskRm = getRedirectMapSidecar(lite.brandId, lite.sourceUrl);
          if (diskRm !== null) setRedirectMap(diskRm);
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

  // Persist WooCommerce fields whenever they change (small payload; survives main session clear on brand change).
  useEffect(() => {
    if (typeof window === "undefined" || !hasRestoredSessionRef.current || !wooPersistEnabledRef.current) return;
    setWooStoreCache({ wooServer, wooConsumerKey, wooConsumerSecret });
  }, [wooServer, wooConsumerKey, wooConsumerSecret]);

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
        wooConsumerKey,
        wooConsumerSecret,
      });
    }, 800);
    return () => clearTimeout(t);
  }, [brandId, sourceUrl, useLinkCrawl, maxUrls, step, gscSiteUrl, gscResult, ga4PropertyId, ga4Result, keywordRows, keywordVolumeMap, targetBaseUrl, pagePlan, redirectMap, internalLinkPlan, launchChecklist, launchAcked, migrationEntities, wooServer, wooConsumerKey, wooConsumerSecret]);

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
    setKeywordVolumeLoading(true);
    setKeywordVolumeError(null);
    try {
      const map: Record<string, number> = {};
      const errors: string[] = [];
      for (let i = 0; i < allUniqueGscKeywords.length; i += KEYWORD_VOLUME_CHUNK) {
        const chunk = allUniqueGscKeywords.slice(i, i + KEYWORD_VOLUME_CHUNK);
        const result = await api.seoKeywordVolume({ keywords: chunk });
        (result.volumes ?? []).forEach((v) => {
          map[v.keyword] = v.monthly_search_volume;
        });
        if (result.error) errors.push(result.error);
      }
      setKeywordVolumeMap((prev) => ({ ...prev, ...map }));
      if (errors.length > 0) setKeywordVolumeError([...new Set(errors.filter(Boolean))].join(" "));
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
          setRedirectMap(incoming);
        } else {
          setRedirectMap((prev) => mergeRedirectImports(prev, incoming));
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
    } catch (e) {
      setMigrationDryRunError(formatApiError(e));
    } finally {
      setMigrationDryRunLoading(false);
    }
  };

  const fetchMigrationPreview = useCallback(
    async (entity: string, page: number) => {
      if (!wooServer.trim() || !wooConsumerKey.trim() || !wooConsumerSecret.trim()) return;
      const seq = ++migrationPreviewRequestSeq.current;
      setMigrationPreviewLoadingEntity(entity);
      setMigrationPreviewErrorByEntity((prev) => ({ ...prev, [entity]: null }));
      try {
        const needsWpAuth = entity === "blogs" || entity === "pages" || entity === "blog_tags" || entity === "pdfs";
        const result = await api.seoMigrationPreviewItems({
          woo_server: wooServer.trim(),
          woo_consumer_key: wooConsumerKey.trim(),
          woo_consumer_secret: wooConsumerSecret.trim(),
          entity,
          page,
          per_page: 50,
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
    [wooServer, wooConsumerKey, wooConsumerSecret, wpPreviewUser, wpPreviewAppPassword],
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

  const runPdfImport = async () => {
    if (!wooServer.trim() || !wooConsumerKey.trim() || !wooConsumerSecret.trim()) {
      setPdfImportError("WooCommerce server URL, consumer key, and consumer secret are required.");
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
    try {
      const result = await api.seoMigrationMigratePdfsStreaming(
        {
          woo_server: wooServer.trim(),
          woo_consumer_key: wooConsumerKey.trim(),
          woo_consumer_secret: wooConsumerSecret.trim(),
          brand_id: brandId,
          excluded_ids: migrationExcludedIds.pdfs ?? [],
          create_redirects: pdfImportCreateRedirects,
          skip_if_exists_in_shopify: pdfImportSkipIfExists,
          ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        },
        (line) => {
          if (line.event === "init") {
            setPdfImportProgress({
              current: 0,
              total: line.total,
              phase: `Queued (up to ${line.max_files} of ${line.pdf_total_in_wordpress} PDFs in WordPress)`,
            });
          } else if (line.event === "item") {
            if (line.step === "start") {
              setPdfImportProgress({
                current: line.current,
                total: line.total,
                title: line.title,
                phase: "Matching Shopify Files / downloading / uploading…",
              });
            } else {
              setPdfImportProgress({
                current: line.current,
                total: line.total,
                title: line.title,
                phase: line.error
                  ? line.shopify_file_url
                    ? "Finished (redirect or other warning)"
                    : "Failed"
                  : "Done",
              });
            }
          }
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
    if (!wooServer.trim() || !wooConsumerKey.trim() || !wooConsumerSecret.trim()) {
      setPdfImportError("WooCommerce server URL, consumer key, and consumer secret are required.");
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
    if (!prev?.rows?.length) {
      setPdfImportError("Import PDFs once (or open a saved session) so there are result rows. Then use this to fill in missing Shopify URLs without re-uploading.");
      return;
    }
    const wordpress_ids = prev.rows.filter((r) => !r.shopify_file_url?.trim()).map((r) => r.wordpress_id);
    if (wordpress_ids.length === 0) {
      setPdfImportError("Every row already has a Shopify file URL.");
      return;
    }
    setPdfResolveLoading(true);
    setPdfImportError(null);
    setPdfImportProgress(null);
    try {
      const resolved = await api.seoMigrationResolvePdfUrlsStreaming(
        {
          woo_server: wooServer.trim(),
          woo_consumer_key: wooConsumerKey.trim(),
          woo_consumer_secret: wooConsumerSecret.trim(),
          brand_id: brandId,
          create_redirects: pdfImportCreateRedirects,
          wordpress_ids,
          ...(wpPreviewUser.trim() && wpPreviewAppPassword.trim()
            ? { wp_username: wpPreviewUser.trim(), wp_application_password: wpPreviewAppPassword.trim() }
            : {}),
        },
        (line) => {
          if (line.event === "init") {
            setPdfImportProgress({
              current: 0,
              total: line.total,
              phase: `Resolving ${wordpress_ids.length} PDFs from Shopify Files (no upload)`,
            });
          } else if (line.event === "item") {
            if (line.step === "start") {
              setPdfImportProgress({
                current: line.current,
                total: line.total,
                title: line.title,
                phase: "Looking up file in Shopify / waiting for CDN URL…",
              });
            } else {
              setPdfImportProgress({
                current: line.current,
                total: line.total,
                title: line.title,
                phase: line.error
                  ? line.shopify_file_url
                    ? "URL resolved (redirect or other warning)"
                    : "Could not resolve"
                  : "Resolved",
              });
            }
          }
        },
      );
      setPdfImportResult((before) => {
        const base = before ?? prev;
        const byId = new Map(base.rows.map((r) => [r.wordpress_id, { ...r }]));
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

  const shopifyCredentialsOk = Boolean(brandId && brandShopify?.connected);

  const pdfImportMissingUrlCount = useMemo(
    () => (pdfImportResult?.rows ?? []).filter((r) => !r.shopify_file_url?.trim()).length,
    [pdfImportResult?.rows],
  );

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

        {isVercelPreviewHost && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-body-small text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <strong className="font-medium">Preview URL:</strong> This wizard stores crawl results, GSC/GA4 state, redirects, and Woo keys in{" "}
            <strong>this browser for this exact address only</strong>. Each <code className="rounded bg-black/5 px-1 dark:bg-white/10">*.vercel.app</code> preview is a
            different address, so a new deployment link will look empty until you run steps again. Your{" "}
            <strong>production</strong> console URL keeps the same origin across deploys. Step 5 includes demand-based sorting, a Demand column, and &quot;Re-sort &amp;
            reprioritize by demand&quot; on the latest build—hard-refresh if you still see an old UI.
          </div>
        )}

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
                    Fetching sitemaps and discovering URLs from <strong>{sourceUrl}</strong>. Sitemap-only is usually quick; <strong>link-following</strong> walks many pages server-side and scales with URL count (often a few minutes, sometimes longer on large sites). The request runs on the server—keep this tab open until it finishes.
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
                <h3 className="font-semibold">WordPress / WooCommerce (source)</h3>
                <p className="text-body-small text-fg-muted mt-1">
                  Use WooCommerce REST API v3. In WordPress: WooCommerce → Settings → Advanced → REST API → Add key (Read). Use the consumer key and secret below.
                </p>
                <p className="text-body-small text-fg-muted mt-2">
                  Store URL and keys are saved in this browser only (localStorage) so you can return to this wizard without re-entering them.
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
                  Click <strong>Details</strong> on any sheet to expand a paginated list. Uncheck <strong>Include</strong> on rows you do not want counted or migrated (exclusions apply to PDF import; other entity runs still use full sheets until ETL is wired).
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
                              disabled={!selected || !wooServer.trim() || !wooConsumerKey.trim() || !wooConsumerSecret.trim()}
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
                  <strong>How counts work:</strong> Blog posts, pages, and blog tags use the public WordPress REST API (
                  <code className="rounded bg-fg-muted/15 px-1">/wp-json/wp/v2/…</code>
                  ) unless you add an application password above—then Details can list drafts/private. WooCommerce products/coupons use{" "}
                  <code className="rounded bg-fg-muted/15 px-1">status=any</code> so you can confirm draft vs publish in Details.{" "}
                  <strong>Redirects</strong> here is a preview count of product plus category URLs we would map to new destinations (Woo inventory), not “existing redirects” from a plugin like Redirection.{" "}
                  <strong>PDFs</strong> lists <code className="rounded bg-fg-muted/15 px-1">application/pdf</code> attachments from WordPress media; import uploads each file to Shopify Files (requires a Shopify custom app with <code className="rounded bg-fg-muted/15 px-1">write_files</code>).
                </p>

                {migrationEntities.has("pdfs") && (
                  <div className="mt-4 rounded-lg border border-border bg-brand-50/40 dark:bg-brand-950/20 px-3 py-3">
                    <p className="text-body-small font-medium text-fg mb-2">Import PDFs to Shopify</p>
                    <p className="text-body-small text-fg-muted mb-3">
                      Uses your WordPress site URL (same as WooCommerce server), optional application password for private media, and this brand&apos;s Shopify connector. Up to 500 files per run by default; expand <strong>PDFs</strong> above to exclude specific attachments. Results are saved in this browser for this brand and store URL so you can resolve CDN URLs later without re-uploading.
                    </p>
                    {migrationDryRunResult?.counts?.pdfs != null && pdfImportResult?.summary ? (
                      <div className="mb-3 rounded-md border border-border bg-bg/80 px-3 py-2 text-body-small text-fg-muted">
                        <strong className="text-fg">Dry run vs last table:</strong> WordPress PDF count (before exclusions) is{" "}
                        <strong className="text-fg">{migrationDryRunResult.counts.pdfs}</strong>. This table has{" "}
                        <strong className="text-fg">{pdfImportResult.rows.length}</strong> rows from the last import/resolve,{" "}
                        <strong className="text-fg">{pdfImportResult.summary.uploaded}</strong> with a Shopify file URL,{" "}
                        <strong className="text-fg">{pdfImportMissingUrlCount}</strong> still missing a URL,{" "}
                        <strong className="text-fg">{pdfImportResult.summary.failed}</strong> failed. Exclusions, truncated runs, and
                        non-import flows explain differences from the dry-run total.
                      </div>
                    ) : null}
                    <label className="mb-3 flex cursor-pointer items-center gap-2 text-body-small text-fg">
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
                    <label className="mb-3 flex cursor-pointer items-center gap-2 text-body-small text-fg">
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
                          !wooServer.trim() ||
                          !wooConsumerKey.trim() ||
                          !wooConsumerSecret.trim()
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
                          !wooServer.trim() ||
                          !wooConsumerKey.trim() ||
                          !wooConsumerSecret.trim() ||
                          pdfImportMissingUrlCount === 0
                        }
                      >
                        {pdfResolveLoading
                          ? "Resolving URLs…"
                          : `Fetch URLs from Shopify (${pdfImportMissingUrlCount} without URL)`}
                      </Button>
                      {pdfImportResult?.redirect_csv && pdfImportResult.redirect_csv.split("\n").length > 1 && (
                        <Button type="button" variant="secondary" size="sm" onClick={downloadPdfRedirectCsv}>
                          Download redirect CSV
                        </Button>
                      )}
                    </div>
                    {pdfImportError && (
                      <p className="mt-2 text-body-small text-state-danger">{pdfImportError}</p>
                    )}
                    {(pdfImportLoading || pdfResolveLoading) && pdfImportProgress && (
                      <div className="mt-3 rounded-md border border-border bg-bg px-3 py-2">
                        <p className="text-body-small text-fg">
                          <strong>
                            PDF {pdfImportProgress.current} of {pdfImportProgress.total}
                          </strong>
                          {pdfImportProgress.title ? (
                            <span className="text-fg-muted">
                              {" "}
                              — {pdfImportProgress.title.length > 72 ? `${pdfImportProgress.title.slice(0, 72)}…` : pdfImportProgress.title}
                            </span>
                          ) : null}
                        </p>
                        {pdfImportProgress.phase && (
                          <p className="mt-0.5 text-body-small text-fg-muted">{pdfImportProgress.phase}</p>
                        )}
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-fg-muted/15">
                          <div
                            className="h-full bg-brand-500 transition-[width] duration-300 ease-out"
                            style={{
                              width: `${Math.min(100, Math.round((pdfImportProgress.current / Math.max(1, pdfImportProgress.total)) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {pdfImportResult?.summary && (
                      <p className="mt-2 text-body-small text-fg-muted">
                        With Shopify URL: <strong className="text-fg">{pdfImportResult.summary.uploaded}</strong>, failed:{" "}
                        <strong className="text-fg">{pdfImportResult.summary.failed}</strong>
                        {pdfImportResult.summary.warnings != null && pdfImportResult.summary.warnings > 0 ? (
                          <>
                            , redirect/other warnings:{" "}
                            <strong className="text-fg">{pdfImportResult.summary.warnings}</strong>
                          </>
                        ) : null}
                        {pdfImportMissingUrlCount > 0 ? (
                          <>
                            , <strong className="text-fg">{pdfImportMissingUrlCount}</strong> rows still need a URL (use Fetch URLs or re-import).
                          </>
                        ) : null}
                        {pdfImportResult.truncated ? " More PDFs remain (run again to continue)." : ""}
                      </p>
                    )}
                    {pdfImportResult?.hint && <p className="mt-1 text-body-small text-fg-muted">{pdfImportResult.hint}</p>}
                    {pdfImportResult?.rows && pdfImportResult.rows.length > 0 && (
                      <div className="mt-3 max-h-[min(40vh,320px)] overflow-auto rounded-md border border-border">
                        <table className="w-full min-w-[560px] border-collapse text-body-small">
                          <thead className="sticky top-0 bg-bg border-b border-border">
                            <tr className="text-left">
                              <th className="px-2 py-1.5 font-medium">ID</th>
                              <th className="px-2 py-1.5 font-medium">Title</th>
                              <th className="px-2 py-1.5 font-medium">Note</th>
                              <th className="px-2 py-1.5 font-medium">Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pdfImportResult.rows.map((r) => (
                              <tr key={r.wordpress_id} className="border-b border-border/60">
                                <td className="px-2 py-1 align-top whitespace-nowrap">{r.wordpress_id}</td>
                                <td className="px-2 py-1 align-top max-w-[160px] break-words">{r.title}</td>
                                <td className="px-2 py-1 align-top max-w-[140px] break-words text-fg-muted">
                                  {r.note ?? "—"}
                                </td>
                                <td className="px-2 py-1 align-top max-w-[240px] break-all">
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
                </div>
                {redirectCsvImportError && (
                  <p className="mb-3 text-body-small text-state-danger">{redirectCsvImportError}</p>
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
