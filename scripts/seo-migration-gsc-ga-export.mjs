#!/usr/bin/env node
/**
 * SEO migration GSC + GA4 baseline export (Option A).
 * Exports top pages and top queries from Google Search Console and top pages/sessions from GA4
 * for merging with URL inventory into a priority table.
 *
 * Requires:
 *   - GSC: Site added in Search Console; OAuth2 or service account with scope
 *     https://www.googleapis.com/auth/webmasters.readonly
 *   - GA4: Property ID; OAuth2 or service account with analytics.readonly
 *
 * Env (optional):
 *   GSC_SITE_URL     e.g. https://stigmahemp.com/
 *   GA4_PROPERTY_ID  e.g. 123456789
 *   GOOGLE_APPLICATION_CREDENTIALS  path to service account JSON (or use OAuth flow)
 *
 * Output: writes to ./docs/seo-migration/ (or SEO_INVENTORY_OUT_DIR):
 *   gsc_top_pages.json, gsc_queries.json, ga4_top_pages.json
 *
 * Without credentials, writes empty arrays and a note. Run with credentials for real data.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const OUT_DIR = process.env.SEO_INVENTORY_OUT_DIR ?? "./docs/seo-migration";
const GSC_SITE = process.env.GSC_SITE_URL ?? "https://stigmahemp.com/";
const GA4_PROPERTY = process.env.GA4_PROPERTY_ID ?? "";

async function tryGscExport() {
  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
    const client = await auth.getClient();
    const searchconsole = google.searchconsole({ version: "v1", auth: client });
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 28);
    const res = await searchconsole.searchanalytics.query({
      siteUrl: GSC_SITE,
      requestBody: {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dimensions: ["page"],
        rowLimit: 500,
      },
    });
    const pages = (res.data.rows ?? []).map((r) => ({
      url: r.keys?.[0],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
    const resQ = await searchconsole.searchanalytics.query({
      siteUrl: GSC_SITE,
      requestBody: {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dimensions: ["query"],
        rowLimit: 500,
      },
    });
    const queries = (resQ.data.rows ?? []).map((r) => ({
      query: r.keys?.[0],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    }));
    return { pages, queries };
  } catch (e) {
    return { pages: [], queries: [], error: e.message };
  }
}

async function tryGa4Export() {
  if (!GA4_PROPERTY) return { pages: [], error: "GA4_PROPERTY_ID not set" };
  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
    const client = await auth.getClient();
    const analytics = google.analyticsdata({ version: "v1beta", auth: client });
    const res = await analytics.properties.runReport({
      property: `properties/${GA4_PROPERTY}`,
      requestBody: {
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "fullPageUrl" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "sessions" },
          { name: "userEngagementDuration" },
        ],
        limit: 500,
      },
    });
    const pages = (res.data.rows ?? []).map((r) => ({
      full_page_url: r.dimensionValues?.[0]?.value,
      screen_page_views: Number(r.metricValues?.[0]?.value ?? 0),
      sessions: Number(r.metricValues?.[1]?.value ?? 0),
      user_engagement_duration: Number(r.metricValues?.[2]?.value ?? 0),
    }));
    return { pages };
  } catch (e) {
    return { pages: [], error: e.message };
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let gsc = { pages: [], queries: [], note: "GSC API not called. Install googleapis and set GOOGLE_APPLICATION_CREDENTIALS (or OAuth) for real data." };
  let ga4 = { pages: [], note: "GA4 API not called. Set GA4_PROPERTY_ID and credentials for real data." };
  try {
    const mod = await import("googleapis");
    if (mod.google) {
      gsc = await tryGscExport();
      ga4 = await tryGa4Export();
    }
  } catch (_) {
    // googleapis not installed or auth failed
  }
  writeFileSync(join(OUT_DIR, "gsc_top_pages.json"), JSON.stringify({ site_url: GSC_SITE, pages: gsc.pages, ...(gsc.error && { error: gsc.error }) }, null, 2));
  writeFileSync(join(OUT_DIR, "gsc_queries.json"), JSON.stringify({ site_url: GSC_SITE, queries: gsc.queries, ...(gsc.error && { error: gsc.error }) }, null, 2));
  writeFileSync(join(OUT_DIR, "ga4_top_pages.json"), JSON.stringify({ property_id: GA4_PROPERTY, pages: ga4.pages, ...(ga4.error && { error: ga4.error }) }, null, 2));
  console.log(`GSC pages: ${gsc.pages.length}, queries: ${gsc.queries.length}. GA4 pages: ${ga4.pages.length}.`);
  console.log(`Wrote ${OUT_DIR}/gsc_top_pages.json, gsc_queries.json, ga4_top_pages.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
