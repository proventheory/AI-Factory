/**
 * Google Search Console and GA4 Data API helpers. Requires googleapis and credentials
 * (GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default).
 *
 * Keep in sync with gsc-ga-api.ts — control-plane loads this .js at runtime.
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
/** Ensure URL-prefix properties use trailing slash (common GSC format). */
function normalizeGscSiteUrl(siteUrl) {
    const u = (siteUrl || "").trim();
    if (!u)
        return u;
    if (u.startsWith("sc-domain:"))
        return u;
    try {
        const parsed = new URL(u.startsWith("http") ? u : `https://${u}`);
        return `${parsed.origin}/`;
    }
    catch {
        return u;
    }
}
/** When bulk [page,query] returns no rows, query each top page with a page filter. */
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
 * Fetch GSC Search Analytics: top pages, top queries, and keywords per page.
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
        const pageQueryLimit = Math.min(25000, Math.max(1000, rowLimit * 40));
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
        if (page_queries.length === 0 && pages.length > 0 && queries.length > 0) {
            page_queries = await fetchPageQueriesForTopPages(searchconsole, normalizedUrl, startStr, endStr, pages, 100);
        }
        return {
            site_url: normalizedUrl,
            date_range: { start: startStr, end: endStr },
            pages,
            queries,
            page_queries,
        };
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
        let search_console_queries;
        let search_console_error;
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
            const scRows = scRes.data.rows ?? [];
            search_console_queries = scRows
                .map((r) => ({
                query: r.dimensionValues?.[0]?.value ?? "",
                clicks: Number(r.metricValues?.[0]?.value ?? 0),
                impressions: Number(r.metricValues?.[1]?.value ?? 0),
            })).filter((q) => q.query.length > 0);
            if (search_console_queries.length === 0)
                search_console_queries = undefined;
        }
        catch (err) {
            search_console_error = err.message ?? String(err);
        }
        return { property_id: propertyId, pages, search_console_queries, search_console_error };
    }
    catch (err) {
        const message = err.message ?? String(err);
        return { property_id: propertyId, pages: [], error: message };
    }
}
//# sourceMappingURL=gsc-ga-api.js.map
