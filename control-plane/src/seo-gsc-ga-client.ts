/**
 * Runtime loader for runners SEO GSC/GA4 API. Uses dynamic path so control-plane
 * builds without depending on runners (rootDir).
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const modulePath = path.join(__dirname, "..", "..", "runners", "src", "lib", "seo", "gsc-ga-api.js");
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
  options?: { rowLimit?: number }
): Promise<Ga4Report> {
  const { fetchGa4Report: f } = await loadRunnersSeo();
  return f(propertyId, options);
}
