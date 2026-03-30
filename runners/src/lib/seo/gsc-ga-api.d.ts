/**
 * Google Search Console and GA4 Data API helpers. Requires googleapis and credentials
 * (GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default).
 */
export interface GscPageRow {
    url: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}
export interface GscQueryRow {
    query: string;
    clicks: number;
    impressions: number;
}
export interface GscPageQueryRow {
    page: string;
    query: string;
    clicks: number;
    impressions: number;
}
export interface GscReport {
    site_url: string;
    date_range: {
        start: string;
        end: string;
    };
    pages: GscPageRow[];
    queries: GscQueryRow[];
    /** Keywords that generated traffic per page (GSC dimensions: page + query). */
    page_queries: GscPageQueryRow[];
    error?: string;
}
export interface Ga4PageRow {
    full_page_url?: string;
    page_path?: string;
    sessions: number;
    screen_page_views?: number;
    user_engagement_duration?: number;
}
/** Legacy shape; GA4 Data API no longer exposes an organic search query dimension — use GSC for query lists. */
export interface Ga4SearchConsoleQueryRow {
    query: string;
    clicks: number;
    impressions: number;
}
export interface Ga4Report {
    property_id: string;
    pages: Ga4PageRow[];
    /** Not populated: organic query dimension removed from public GA4 schema; use Search Console (fetchGscReport). */
    search_console_queries?: Ga4SearchConsoleQueryRow[];
    search_console_error?: string;
    error?: string;
}
/**
 * Fetch GSC Search Analytics: top pages and top queries for the given site and date range.
 * When accessToken is provided (OAuth from control-plane), uses it instead of GOOGLE_APPLICATION_CREDENTIALS.
 */
export declare function fetchGscReport(siteUrl: string, options?: {
    dateRange?: string;
    rowLimit?: number;
    accessToken?: string;
}): Promise<GscReport>;
/**
 * Fetch GA4 top pages (sessions, page views) for the given property.
 * When accessToken is provided (OAuth from control-plane), uses it instead of GOOGLE_APPLICATION_CREDENTIALS.
 */
export declare function fetchGa4Report(propertyId: string, options?: {
    rowLimit?: number;
    accessToken?: string;
}): Promise<Ga4Report>;
