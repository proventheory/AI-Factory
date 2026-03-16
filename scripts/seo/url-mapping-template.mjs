#!/usr/bin/env node
/**
 * URL mapping template: reads url_inventory.json (or -url-inventory.json) and outputs url_mapping.json
 * with existing_url filled and migration_url empty for manual or rule-based fill.
 *
 * Usage:
 *   node scripts/seo/url-mapping-template.mjs [path/to/url-inventory.json]
 *   node scripts/seo/url-mapping-template.mjs ./docs/seo-migration/stigmahemp-url-inventory.json
 *
 * Output: url_mapping.json in same dir as input (or ./docs/seo-migration/url_mapping.json).
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const inputPath = process.argv[2] ?? "./docs/seo-migration/stigmahemp-url-inventory.json";
const outPath = join(dirname(inputPath), "url_mapping.json");

let inventory;
try {
  const raw = readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw);
  inventory = Array.isArray(parsed.urls) ? { urls: parsed.urls, base_url: parsed.base_url } : { urls: parsed, base_url: "" };
  if (!inventory.urls?.length) {
    inventory.urls = Array.isArray(parsed) ? parsed : [];
  }
} catch (e) {
  console.error("Failed to read inventory:", e.message);
  process.exit(1);
}

const mapping = inventory.urls.map((u) => ({
  existing_url: typeof u === "string" ? u : (u.url ?? u.normalized_url),
  migration_url: null,
  redirect_type: null,
  priority: "medium",
  notes: null,
}));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(mapping, null, 2));
console.log(`Wrote ${mapping.length} rows to ${outPath}. Fill migration_url and redirect_type, then use for redirect config and verification.`);
