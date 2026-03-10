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

export interface GscReport {
  site_url: string;
  date_range: { start: string; end: string };
  pages: GscPageRow[];
  queries: GscQueryRow[];
  error?: string;
}

export interface Ga4PageRow {
  full_page_url?: string;
  page_path?: string;
  sessions: number;
  screen_page_views?: number;
  user_engagement_duration?: number;
}

export interface Ga4Report {
  property_id: string;
  pages: Ga4PageRow[];
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

/**
 * Fetch GSC Search Analytics: top pages and top queries for the given site and date range.
 * When accessToken is provided (OAuth from control-plane), uses it instead of GOOGLE_APPLICATION_CREDENTIALS.
 */
export async function fetchGscReport(
  siteUrl: string,
  options: { dateRange?: string; rowLimit?: number; accessToken?: string } = {},
): Promise<GscReport> {
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

    const [pageRes, queryRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: startStr,
          endDate: endStr,
          dimensions: ["page"],
          rowLimit,
        },
      }),
      searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: startStr,
          endDate: endStr,
          dimensions: ["query"],
          rowLimit,
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

    return { site_url: siteUrl, date_range: { start: startStr, end: endStr }, pages, queries };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    return {
      site_url: siteUrl,
      date_range: { start: startStr, end: endStr },
      pages: [],
      queries: [],
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

    return { property_id: propertyId, pages };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    return { property_id: propertyId, pages: [], error: message };
  }
}
