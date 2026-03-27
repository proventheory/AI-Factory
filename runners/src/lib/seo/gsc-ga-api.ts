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
  date_range: { start: string; end: string };
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

/** Search Console–style query data from GA4 (when property has Search Console linked). Query-level only; no per-URL in GA4 API. */
export interface Ga4SearchConsoleQueryRow {
  query: string;
  clicks: number;
  impressions: number;
}

export interface Ga4Report {
  property_id: string;
  pages: Ga4PageRow[];
  /** When GA4 has Search Console linked: query-level keywords (no per-page in API). */
  search_console_queries?: Ga4SearchConsoleQueryRow[];
  /** Set when GA4 pages succeeded but the Search Console report failed (e.g. property not linked). */
  search_console_error?: string;
  error?: string;
}

interface GoogleApis {
  google: {
    auth: { GoogleAuth: new (opts: { scopes: string[] }) => { getClient: () => Promise<unknown> } };
    searchconsole: (opts: { version: string; auth: unknown }) => { searchanalytics: { query: (opts: unknown) => Promise<{ data: { rows?: unknown[] } }> } };
    analyticsdata: (opts: { version: string; auth: unknown }) => { properties: { runReport: (opts: unknown) => Promise<{ data: { rows?: unknown[] } }> } };
  };
}

function loadGoogle(): GoogleApis {
  return require("googleapis") as GoogleApis;
}

async function getGoogleAuth(scopes: string[]) {
  const { google } = loadGoogle();
  const auth = new google.auth.GoogleAuth({ scopes });
  return auth.getClient();
}

/** Build auth from OAuth access_token (e.g. from control-plane for initiative). */
function getAuthFromAccessToken(accessToken: string): unknown {
  const { OAuth2Client } = require("google-auth-library") as { OAuth2Client: new () => { setCredentials: (c: { access_token: string }) => void } };
  const oauth = new OAuth2Client();
  oauth.setCredentials({ access_token: accessToken });
  return oauth;
}

/** Normalize site URL for Search Console API: ensure URL-prefix has trailing slash so it matches common GSC property format. */
function normalizeGscSiteUrl(siteUrl: string): string {
  const u = (siteUrl || "").trim();
  if (!u) return u;
  if (u.startsWith("sc-domain:")) return u;
  try {
    const parsed = new URL(u.startsWith("http") ? u : `https://${u}`);
    const base = `${parsed.origin}/`;
    return base;
  } catch {
    return u;
  }
}

type GscSearchConsole = {
  searchanalytics: { query: (opts: unknown) => Promise<{ data: { rows?: unknown[] } }> };
};

/** When bulk [page,query] returns no rows, query each top page with a page filter (GSC API quirk on some properties). */
async function fetchPageQueriesForTopPages(
  searchconsole: GscSearchConsole,
  siteUrl: string,
  startStr: string,
  endStr: string,
  pages: GscPageRow[],
  maxPages: number,
): Promise<GscPageQueryRow[]> {
  const sorted = [...pages].sort((a, b) => b.clicks - a.clicks);
  const slice = sorted.slice(0, Math.min(maxPages, sorted.length));
  const out: GscPageQueryRow[] = [];
  const batchSize = 8;
  for (let i = 0; i < slice.length; i += batchSize) {
    const batch = slice.slice(i, i + batchSize);
    const parts = await Promise.all(
      batch.map(async (p) => {
        if (!p.url) return [] as GscPageQueryRow[];
        try {
          const res = await searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: {
              startDate: startStr,
              endDate: endStr,
              dimensions: ["query"],
              type: "web",
              dataState: "all",
              dimensionFilterGroups: [
                {
                  groupType: "and",
                  filters: [{ dimension: "page", operator: "equals", expression: p.url }],
                },
              ],
              rowLimit: 500,
            },
          });
          type GscRow = { keys?: string[]; clicks?: number; impressions?: number };
          return ((res.data.rows ?? []) as GscRow[]).map((r: GscRow) => ({
            page: p.url,
            query: (r.keys?.[0] as string) ?? "",
            clicks: (r.clicks as number) ?? 0,
            impressions: (r.impressions as number) ?? 0,
          }));
        } catch {
          return [];
        }
      }),
    );
    for (const rows of parts) out.push(...rows);
  }
  return out;
}

/**
 * Fetch GSC Search Analytics: top pages and top queries for the given site and date range.
 * When accessToken is provided (OAuth from control-plane), uses it instead of GOOGLE_APPLICATION_CREDENTIALS.
 */
export async function fetchGscReport(
  siteUrl: string,
  options: { dateRange?: string; rowLimit?: number; accessToken?: string } = {},
): Promise<GscReport> {
  const normalizedUrl = normalizeGscSiteUrl(siteUrl);
  const rowLimit = options.rowLimit ?? 500;
  const end = new Date();
  const start = new Date();
  if (options.dateRange === "last7days") start.setDate(start.getDate() - 7);
  else start.setDate(start.getDate() - 28);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  try {
    const auth = options.accessToken
      ? getAuthFromAccessToken(options.accessToken)
      : await getGoogleAuth(["https://www.googleapis.com/auth/webmasters.readonly"]);
    const { google } = loadGoogle();
    const searchconsole = google.searchconsole({ version: "v1", auth });

    const pageQueryLimit = Math.min(25000, Math.max(1000, (rowLimit ?? 500) * 40));
    const commonDims = { type: "web" as const, dataState: "all" as const };
    const [pageRes, queryRes, pageQueryRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl: normalizedUrl,
        requestBody: {
          startDate: startStr,
          endDate: endStr,
          dimensions: ["page"],
          rowLimit,
          ...commonDims,
        },
      }),
      searchconsole.searchanalytics.query({
        siteUrl: normalizedUrl,
        requestBody: {
          startDate: startStr,
          endDate: endStr,
          dimensions: ["query"],
          rowLimit,
          ...commonDims,
        },
      }),
      searchconsole.searchanalytics.query({
        siteUrl: normalizedUrl,
        requestBody: {
          startDate: startStr,
          endDate: endStr,
          dimensions: ["page", "query"],
          rowLimit: pageQueryLimit,
          ...commonDims,
        },
      }),
    ]);

    type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
    const pages: GscPageRow[] = ((pageRes.data.rows ?? []) as GscRow[]).map((r: GscRow) => ({
      url: (r.keys?.[0] as string) ?? "",
      clicks: (r.clicks as number) ?? 0,
      impressions: (r.impressions as number) ?? 0,
      ctr: (r.ctr as number) ?? 0,
      position: (r.position as number) ?? 0,
    }));

    const queries: GscQueryRow[] = ((queryRes.data.rows ?? []) as GscRow[]).map((r: GscRow) => ({
      query: (r.keys?.[0] as string) ?? "",
      clicks: (r.clicks as number) ?? 0,
      impressions: (r.impressions as number) ?? 0,
    }));

    let page_queries: GscPageQueryRow[] = ((pageQueryRes.data.rows ?? []) as GscRow[]).map((r: GscRow) => ({
      page: (r.keys?.[0] as string) ?? "",
      query: (r.keys?.[1] as string) ?? "",
      clicks: (r.clicks as number) ?? 0,
      impressions: (r.impressions as number) ?? 0,
    }));

    /** Some properties return empty page+query rows even when page/query dimensions work; fill from per-page query calls. */
    if (page_queries.length === 0 && pages.length > 0 && queries.length > 0) {
      page_queries = await fetchPageQueriesForTopPages(
        searchconsole,
        normalizedUrl,
        startStr,
        endStr,
        pages,
        100,
      );
    }

    return { site_url: normalizedUrl, date_range: { start: startStr, end: endStr }, pages, queries, page_queries };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    return {
      site_url: normalizedUrl,
      date_range: { start: startStr, end: endStr },
      pages: [],
      queries: [],
      page_queries: [],
      error: message,
    };
  }
}

/**
 * Fetch GA4 top pages (sessions, page views) for the given property.
 * When accessToken is provided (OAuth from control-plane), uses it instead of GOOGLE_APPLICATION_CREDENTIALS.
 */
export async function fetchGa4Report(
  propertyId: string,
  options: { rowLimit?: number; accessToken?: string } = {},
): Promise<Ga4Report> {
  const rowLimit = options.rowLimit ?? 500;

  try {
    const auth = options.accessToken
      ? getAuthFromAccessToken(options.accessToken)
      : await getGoogleAuth(["https://www.googleapis.com/auth/analytics.readonly"]);
    const { google } = loadGoogle();
    const analytics = google.analyticsdata({ version: "v1beta", auth });

    const res = await analytics.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "fullPageUrl" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "sessions" },
          { name: "userEngagementDuration" },
        ],
        limit: rowLimit,
      },
    });

    type Ga4Row = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };
    const pages: Ga4PageRow[] = ((res.data.rows ?? []) as Ga4Row[]).map((r: Ga4Row) => ({
      full_page_url: r.dimensionValues?.[0]?.value as string | undefined,
      sessions: Number(r.metricValues?.[1]?.value ?? 0),
      screen_page_views: Number(r.metricValues?.[0]?.value ?? 0),
      user_engagement_duration: Number(r.metricValues?.[2]?.value ?? 0),
    }));

    // When property has Search Console linked, pull query-level data (GA4 only allows query + Country/Device, not page+query).
    let search_console_queries: Ga4SearchConsoleQueryRow[] | undefined;
    let search_console_error: string | undefined;
    try {
      const scRes = await analytics.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
          dimensions: [{ name: "organicGoogleSearchQuery" }],
          metrics: [{ name: "organicGoogleSearchClicks" }, { name: "organicGoogleSearchImpressions" }],
          limit: 5000,
        },
      });
      const scRows = (scRes.data.rows ?? []) as Ga4Row[];
      search_console_queries = scRows.map((r: Ga4Row) => ({
        query: (r.dimensionValues?.[0]?.value as string) ?? "",
        clicks: Number(r.metricValues?.[0]?.value ?? 0),
        impressions: Number(r.metricValues?.[1]?.value ?? 0),
      })).filter((q) => q.query.length > 0);
      if (search_console_queries.length === 0) search_console_queries = undefined;
    } catch (err) {
      search_console_error = (err as Error).message ?? String(err);
    }

    return { property_id: propertyId, pages, search_console_queries, search_console_error };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    return { property_id: propertyId, pages: [], error: message };
  }
}
