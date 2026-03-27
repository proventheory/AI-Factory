/**
 * SEO GSC/GA4 reports. Bundles runners gsc-ga-api into control-plane (no runtime path).
 */
import {
  fetchGscReport as fetchGscReportImpl,
  fetchGa4Report as fetchGa4ReportImpl,
} from "../../runners/src/lib/seo/gsc-ga-api.js";

export interface GscReport {
  site_url: string;
  date_range: { start: string; end: string };
  pages: { url: string; clicks: number; impressions: number; ctr: number; position: number }[];
  queries: { query: string; clicks: number; impressions: number }[];
  page_queries: { page: string; query: string; clicks: number; impressions: number }[];
  error?: string;
}

export interface Ga4Report {
  property_id: string;
  pages: { full_page_url?: string; page_path?: string; sessions: number; screen_page_views?: number; user_engagement_duration?: number }[];
  /** Unused: GA4 Data API no longer exposes organic search query as a dimension; use GSC report for queries. */
  search_console_queries?: { query: string; clicks: number; impressions: number }[];
  search_console_error?: string;
  error?: string;
}

export async function fetchGscReport(
  siteUrl: string,
  options?: { dateRange?: string; rowLimit?: number; accessToken?: string }
): Promise<GscReport> {
  return fetchGscReportImpl(siteUrl, options);
}

export async function fetchGa4Report(
  propertyId: string,
  options?: { rowLimit?: number; accessToken?: string }
): Promise<Ga4Report> {
  return fetchGa4ReportImpl(propertyId, options);
}
