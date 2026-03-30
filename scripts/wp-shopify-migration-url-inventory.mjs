#!/usr/bin/env node
/**
 * Standalone SEO migration URL inventory: sitemap-first discovery for one or more base URLs.
 * Outputs url_inventory.json and url_inventory.md (and optional .csv).
 *
 * Usage:
 *   node scripts/wp-shopify-migration-url-inventory.mjs <BASE_URL> [BASE_URL2 ...]
 *   node scripts/wp-shopify-migration-url-inventory.mjs https://stigmahemp.com
 *   node scripts/wp-shopify-migration-url-inventory.mjs https://stigmahemp.com https://stigmathc.com
 *
 * Options (env):
 *   SEO_INVENTORY_OUT_DIR  default: ./docs/wp-shopify-migration
 *   SEO_INVENTORY_MAX_URLS default: 2000
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const OUT_DIR = process.env.SEO_INVENTORY_OUT_DIR ?? "./docs/wp-shopify-migration";
const MAX_URLS = Math.min(5000, Math.max(1, parseInt(process.env.SEO_INVENTORY_MAX_URLS ?? "2000", 10) || 2000));

function classify(path) {
  const p = path.toLowerCase().replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "") || "";
  if (!p) return "homepage";
  if (/\/(product|prod)\//.test("/" + p) || /^product\//.test(p) || /^products\//.test(p)) return "product";
  if (/\/(collection|collections)\//.test("/" + p) || /^collections\//.test(p)) return "collection";
  if (/\/(category|categories|product-category)\//.test("/" + p) || /^product-category\//.test(p)) return "category";
  if (/\/(tag|tags)\//.test("/" + p) || /^tag\//.test(p)) return "tag";
  if (/\/(blog|blogs|post|posts)\//.test("/" + p) || /^blog\//.test(p)) return "post";
  if (/\/(policy|policies|privacy|terms)\//.test("/" + p) || /^policies\//.test(p)) return "policy";
  return "page";
}

async function fetchSitemapUrls(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ];
  const all = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const text = await res.text();
      const locRe = /<loc>([^<]+)<\/loc>/gi;
      let m;
      const urls = [];
      while ((m = locRe.exec(text)) !== null) {
        const u = m[1].trim();
        try {
          if (new URL(u).origin === origin) urls.push(u);
        } catch {}
      }
      if (urls.length > 0) {
        all.push(...urls);
        break;
      }
    } catch (_e) {
      continue;
    }
  }
  return [...new Set(all)].slice(0, MAX_URLS);
}

async function run(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const urls = await fetchSitemapUrls(baseUrl);
  if (urls.length === 0) {
    urls.push(baseUrl.replace(/\/$/, "") || origin + "/");
  }
  const inventory = urls.map((url) => {
    const path = new URL(url).pathname.replace(/\/+/g, "/") || "/";
    return { url, path, type: classify(path), source: "sitemap" };
  });
  return { base_url: baseUrl, urls: inventory, total: inventory.length };
}

function toMarkdown(inventory) {
  const rows = inventory.urls.map((u) => `| ${u.url} | ${u.type} | ${u.source} |`);
  return `# URL inventory: ${inventory.base_url}\n\n| URL | Type | Source |\n| --- | --- | --- |\n${rows.join("\n")}\n`;
}

async function main() {
  const baseUrls = process.argv.slice(2).filter((a) => a.startsWith("http"));
  if (baseUrls.length === 0) {
    console.error("Usage: node scripts/wp-shopify-migration-url-inventory.mjs <BASE_URL> [BASE_URL2 ...]");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  for (const baseUrl of baseUrls) {
    const slug = new URL(baseUrl).hostname.replace(/\./g, "-");
    const inventory = await run(baseUrl);
    results.push({ baseUrl, inventory });
    const jsonPath = join(OUT_DIR, `${slug}-url-inventory.json`);
    const mdPath = join(OUT_DIR, `${slug}-url-inventory.md`);
    writeFileSync(jsonPath, JSON.stringify(inventory, null, 2));
    writeFileSync(mdPath, toMarkdown(inventory));
    console.log(`Wrote ${inventory.urls.length} URLs to ${jsonPath} and ${mdPath}`);
  }
  if (results.length > 1) {
    const combined = results.map((r) => r.inventory);
    writeFileSync(join(OUT_DIR, "url-inventory-combined.json"), JSON.stringify(combined, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
