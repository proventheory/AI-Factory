/**
 * Google Search Console and GA4 Data API helpers. Requires googleapis and credentials
 * (GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default).
 */
function loadGoogle() {
    return require("googleapis");
}
async function getGoogleAuth(scopes) {
    const { google } = loadGoogle();
    const auth = new google.auth.GoogleAuth({ scopes });
    return auth.getClient();
}
/** Build auth from OAuth access_token (e.g. from control-plane for initiative). */
function getAuthFromAccessToken(accessToken) {
    const { OAuth2Client } = require("google-auth-library");
    const oauth = new OAuth2Client();
    oauth.setCredentials({ access_token: accessToken });
    return oauth;
}
/** Normalize site URL for Search Console API: ensure URL-prefix has trailing slash so it matches common GSC property format. */
function normalizeGscSiteUrl(siteUrl) {
    const u = (siteUrl || "").trim();
    if (!u)
        return u;
    if (u.startsWith("sc-domain:"))
        return u;
    try {
        const parsed = new URL(u.startsWith("http") ? u : `https://${u}`);
        const base = `${parsed.origin}/`;
        return base;
    }
    catch {
        return u;
    }
}
/** When bulk [page,query] returns no rows, query each top page with a page filter (GSC API quirk on some properties). */
async function fetchPageQueriesForTopPages(searchconsole, siteUrl, startStr, endStr, pages, maxPages) {
    const sorted = [...pages].sort((a, b) => b.clicks - a.clicks);
    const slice = sorted.slice(0, Math.min(maxPages, sorted.length));
    const out = [];
    const batchSize = 8;
    for (let i = 0; i < slice.length; i += batchSize) {
        const batch = slice.slice(i, i + batchSize);
        const parts = await Promise.all(batch.map(async (p) => {
            if (!p.url)
                return [];
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
                return (res.data.rows ?? []).map((r) => ({
                    page: p.url,
                    query: r.keys?.[0] ?? "",
                    clicks: r.clicks ?? 0,
                    impressions: r.impressions ?? 0,
                }));
            }
            catch {
                return [];
            }
        }));
        for (const rows of parts)
            out.push(...rows);
    }
    return out;
}
/**
 * Fetch GSC Search Analytics: top pages and top queries for the given site and date range.
 * When accessToken is provided (OAuth from control-plane), uses it instead of GOOGLE_APPLICATION_CREDENTIALS.
 */
export async function fetchGscReport(siteUrl, options = {}) {
    const normalizedUrl = normalizeGscSiteUrl(siteUrl);
    const rowLimit = options.rowLimit ?? 500;
    const end = new Date();
    const start = new Date();
    if (options.dateRange === "last7days")
        start.setDate(start.getDate() - 7);
    else
        start.setDate(start.getDate() - 28);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    try {
        const auth = options.accessToken
            ? getAuthFromAccessToken(options.accessToken)
            : await getGoogleAuth(["https://www.googleapis.com/auth/webmasters.readonly"]);
        const { google } = loadGoogle();
        const searchconsole = google.searchconsole({ version: "v1", auth });
        const pageQueryLimit = Math.min(25000, Math.max(1000, (rowLimit ?? 500) * 40));
        const commonDims = { type: "web", dataState: "all" };
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
        const pages = (pageRes.data.rows ?? []).map((r) => ({
            url: r.keys?.[0] ?? "",
            clicks: r.clicks ?? 0,
            impressions: r.impressions ?? 0,
            ctr: r.ctr ?? 0,
            position: r.position ?? 0,
        }));
        const queries = (queryRes.data.rows ?? []).map((r) => ({
            query: r.keys?.[0] ?? "",
            clicks: r.clicks ?? 0,
            impressions: r.impressions ?? 0,
        }));
        let page_queries = (pageQueryRes.data.rows ?? []).map((r) => ({
            page: r.keys?.[0] ?? "",
            query: r.keys?.[1] ?? "",
            clicks: r.clicks ?? 0,
            impressions: r.impressions ?? 0,
        }));
        /** Some properties return empty page+query rows even when page/query dimensions work; fill from per-page query calls. */
        if (page_queries.length === 0 && pages.length > 0 && queries.length > 0) {
            page_queries = await fetchPageQueriesForTopPages(searchconsole, normalizedUrl, startStr, endStr, pages, 100);
        }
        return { site_url: normalizedUrl, date_range: { start: startStr, end: endStr }, pages, queries, page_queries };
    }
    catch (err) {
        const message = err.message ?? String(err);
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
export async function fetchGa4Report(propertyId, options = {}) {
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
        const pages = (res.data.rows ?? []).map((r) => ({
            full_page_url: r.dimensionValues?.[0]?.value,
            sessions: Number(r.metricValues?.[1]?.value ?? 0),
            screen_page_views: Number(r.metricValues?.[0]?.value ?? 0),
            user_engagement_duration: Number(r.metricValues?.[2]?.value ?? 0),
        }));
        // Query-level organic search terms are not available via a supported GA4 Data API dimension (organicGoogleSearchQuery was removed from the public schema). Use Search Console API in fetchGscReport for queries / page+query.
        return { property_id: propertyId, pages };
    }
    catch (err) {
        const message = err.message ?? String(err);
        return { property_id: propertyId, pages: [], error: message };
    }
}
//# sourceMappingURL=gsc-ga-api.js.map