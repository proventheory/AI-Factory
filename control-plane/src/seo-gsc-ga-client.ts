/**
 * Runtime loader for runners SEO GSC/GA4 API. Uses dynamic path so control-plane
 * builds without depending on runners (rootDir).
 * CJS-safe: getCurrentDir comes from get-current-dir-cjs.ts (no import.meta) so esbuild --format=cjs does not warn.
 */
import path from "path";
import { existsSync } from "fs";
import { getCurrentDir } from "./get-current-dir-cjs.js";

const relRunners = path.join("runners", "src", "lib", "seo", "gsc-ga-api.js");

export interface GscReport {
  site_url: string;
  date_range: { start: string; end: string };
  pages: { url: string; clicks: number; impressions: number; ctr: number; position: number }[];
  queries: { query: string; clicks: number; impressions: number }[];
  error?: string;
}

export interface Ga4Report {
  property_id: string;
  pages: { full_page_url?: string; page_path?: string; sessions: number; screen_page_views?: number; user_engagement_duration?: number }[];
  error?: string;
}

async function loadRunnersSeo(): Promise<{ fetchGscReport: (url: string, opts?: { dateRange?: string; rowLimit?: number; accessToken?: string }) => Promise<GscReport>; fetchGa4Report: (propertyId: string, opts?: { rowLimit?: number }) => Promise<Ga4Report> }> {
  const base = getCurrentDir();
  const candidates = [
    path.join(base, relRunners),
    path.join(base, "..", relRunners),
    path.join(base, "..", "..", relRunners),
  ];
  const modulePath = candidates.find((p) => existsSync(p)) ?? candidates[0];
  const mod = await import(modulePath);
  return { fetchGscReport: mod.fetchGscReport, fetchGa4Report: mod.fetchGa4Report };
}

export async function fetchGscReport(
  siteUrl: string,
  options?: { dateRange?: string; rowLimit?: number; accessToken?: string }
): Promise<GscReport> {
  const { fetchGscReport: f } = await loadRunnersSeo();
  return f(siteUrl, options);
}

export async function fetchGa4Report(
  propertyId: string,
  options?: { rowLimit?: number; accessToken?: string }
): Promise<Ga4Report> {
  const { fetchGa4Report: f } = await loadRunnersSeo();
  return f(propertyId, options);
}
