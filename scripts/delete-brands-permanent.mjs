#!/usr/bin/env node
/**
 * Permanently delete brands by name (matches slug or name).
 * Usage: node scripts/delete-brands-permanent.mjs <API_URL> [name1] [name2] ...
 * Example: node scripts/delete-brands-permanent.mjs https://ai-factory-api-staging.onrender.com Colonivpr "Hello Tabs" "Sticky Green" pharmacytime
 * With no names: deletes Colonivpr, Hello Tabs, Sticky Green, pharmacytime (the four archived from the screenshot).
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");

const DEFAULT_NAMES = ["Colonivpr", "Hello Tabs", "Sticky Green", "pharmacytime"];
const names = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_NAMES;

async function main() {
  const listRes = await fetch(`${base}/v1/brand_profiles?limit=200`);
  if (!listRes.ok) {
    console.error("Failed to list brands", listRes.status, await listRes.text());
    process.exit(1);
  }
  const { items } = await listRes.json();
  const toDelete = items.filter(
    (b) => names.some((n) => (b.name || "").toLowerCase() === n.toLowerCase() || (b.slug || "").toLowerCase() === n.toLowerCase().replace(/\s+/g, "-"))
  );
  if (toDelete.length === 0) {
    console.log("No matching brands found for:", names.join(", "));
    return;
  }
  console.log("Permanently deleting:", toDelete.map((b) => `${b.name} (${b.id})`).join(", "));
  for (const brand of toDelete) {
    const res = await fetch(`${base}/v1/brand_profiles/${brand.id}?permanent=true`, { method: "DELETE" });
    const text = await res.text();
    if (!res.ok) {
      console.error(`Failed to delete ${brand.name}:`, res.status, text);
      continue;
    }
    const data = JSON.parse(text);
    console.log("Deleted:", brand.name, data.deleted ? "(permanent)" : "(archived - API may not support permanent yet)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
