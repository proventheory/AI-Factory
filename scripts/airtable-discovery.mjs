#!/usr/bin/env node
/**
 * Fetch Airtable base schema (tables and fields) and write docs/airtable-discovery/schema_<baseId>.json.
 * Used by First Capital and other imports to know table names and field IDs.
 *
 * Usage:
 *   AIRTABLE_TOKEN=patXXX node scripts/airtable-discovery.mjs --base-id app6pjOKnxdrZsDWR
 *   npm run airtable:discovery -- --base-id app6pjOKnxdrZsDWR
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const token = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID || process.argv.find((a) => a.startsWith("--base-id="))?.split("=")[1] || process.argv[process.argv.indexOf("--base-id") + 1];

if (!token) {
  console.error("Set AIRTABLE_TOKEN or AIRTABLE_API_KEY");
  process.exit(1);
}
if (!baseId) {
  console.error("Set AIRTABLE_BASE_ID or pass --base-id <baseId>");
  process.exit(1);
}

const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});

if (!res.ok) {
  console.error("Airtable API error:", res.status, await res.text());
  process.exit(1);
}

const schema = await res.json();
const outDir = join(root, "docs", "airtable-discovery");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `schema_${baseId}.json`);
writeFileSync(outPath, JSON.stringify(schema, null, 2), "utf8");
console.log("Wrote", outPath);
console.log("Tables:", schema.tables?.map((t) => t.name).join(", ") || "none");
