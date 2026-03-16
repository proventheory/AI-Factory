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
/**
 * Fetch GSC Search Analytics: top pages and top queries for the given site and date range.
 * When accessToken is provided (OAuth from control-plane), uses it instead of GOOGLE_APPLICATION_CREDENTIALS.
 */
export async function fetchGscReport(siteUrl, options = {}) {
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
        return { site_url: siteUrl, date_range: { start: startStr, end: endStr }, pages, queries };
    }
    catch (err) {
        const message = err.message ?? String(err);
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
        return { property_id: propertyId, pages };
    }
    catch (err) {
        const message = err.message ?? String(err);
        return { property_id: propertyId, pages: [], error: message };
    }
}
//# sourceMappingURL=gsc-ga-api.js.map