#!/usr/bin/env node
/**
 * Build footer_urls for Pharmacy Time (or any brand) for use in design_tokens.
 * Tries to fetch sitemap.xml from the site root; if not found, uses a slug map
 * so all footer placeholders (POPULAR, COMPANY, LEGAL) have URLs.
 *
 * Output: JSON object to merge into brand design_tokens.footer_urls.
 * Usage:
 *   node scripts/fetch-pharmacytime-footer-urls.mjs [BASE_URL]
 *   BASE_URL default: https://pharmac7dev.wpenginepowered.com
 *
 * Then add the output to your brand's design_tokens.footer_urls (Console Edit Brand
 * or API PUT /v1/brand_profiles/:id with design_tokens.footer_urls).
 */

const BASE_URL = (process.argv[2] ?? "https://pharmac7dev.wpenginepowered.com").replace(/\/$/, "");

/** Slug map for Pharmacy Time footer: placeholder key -> path (no leading slash). */
const PHARMACY_TIME_SLUGS = {
  // POPULAR
  popularWeightManagementUrl: "weight-management",
  popularHormoneReplacementUrl: "hormone-replacement",
  popularIvTherapyUrl: "iv-therapy-supplements",
  popularSexualWellnessUrl: "sexual-wellness",
  popularThyroidUrl: "thyroid",
  popularGlp1Url: "glp-1-treatments",
  popularOzempicUrl: "ozempic",
  popularWegovyUrl: "wegovy",
  popularSermorelinUrl: "sermorelin",
  popularNadUrl: "nad-plus",
  // COMPANY
  howItWorksUrl: "how-it-works",
  faqUrl: "faq",
  contactUrl: "contact-us",
  // LEGAL
  termsUrl: "terms-conditions",
  privacyUrl: "privacy-policy",
  hipaaUrl: "hipaa-privacy-statement",
};

function buildFromSlugs(baseUrl, slugs) {
  const out = {};
  for (const [key, path] of Object.entries(slugs)) {
    out[key] = `${baseUrl}/${path}/`;
  }
  return out;
}

async function fetchSitemapUrls(baseUrl) {
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  try {
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const text = await res.text();
    const urls = [];
    const locRe = /<loc>([^<]+)<\/loc>/gi;
    let m;
    while ((m = locRe.exec(text)) !== null) urls.push(m[1].trim());
    return urls;
  } catch (_e) {
    return null;
  }
}

/** Match sitemap URLs to placeholder keys by path. Returns { popularWeightManagementUrl: url, ... }. */
function matchUrlsToPlaceholders(baseUrl, urls) {
  const normalized = baseUrl.replace(/\/$/, "");
  const byPath = new Map();
  for (const u of urls) {
    try {
      const path = new URL(u).pathname.replace(/^\/|\/$/g, "").toLowerCase();
      if (path) byPath.set(path, u);
    } catch (_) {}
  }
  const out = {};
  for (const [key, slug] of Object.entries(PHARMACY_TIME_SLUGS)) {
    const path = slug.toLowerCase();
    if (byPath.has(path)) {
      out[key] = byPath.get(path);
    } else {
      const withTrailing = path + "/";
      const found = [...byPath.entries()].find(([p]) => p === path || p === withTrailing || p.startsWith(path + "/"));
      if (found) out[key] = found[1];
      else out[key] = `${normalized}/${slug}/`;
    }
  }
  return out;
}

async function main() {
  const sitemapUrls = await fetchSitemapUrls(BASE_URL);
  let footerUrls;
  if (sitemapUrls && sitemapUrls.length > 0) {
    footerUrls = matchUrlsToPlaceholders(BASE_URL, sitemapUrls);
    console.error(`Fetched ${sitemapUrls.length} URLs from sitemap; matched footer placeholders.`);
  } else {
    footerUrls = buildFromSlugs(BASE_URL, PHARMACY_TIME_SLUGS);
    console.error("Sitemap not available; using default slug map for", BASE_URL);
  }
  console.log(JSON.stringify(footerUrls, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
