#!/usr/bin/env node
/**
 * Permanently delete brands by name, or delete all except one (--keep <id>).
 * Usage:
 *   node scripts/delete-brands-permanent.mjs <API_URL> [name1] [name2] ...
 *   node scripts/delete-brands-permanent.mjs <API_URL> --keep <brand_id>   (delete all brands except this id)
 * Example (keep only Pharmacy Time):
 *   node scripts/delete-brands-permanent.mjs https://ai-factory-api-staging.onrender.com --keep 06a03507-d2d3-4dda-a1b6-a8c3774ddc3d
 */
import "dotenv/config";

const args = process.argv.slice(2);
const API = args[0] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");

const keepIdx = args.indexOf("--keep");
const keepId = keepIdx >= 0 ? args[keepIdx + 1] : null;
const nameArgs = keepIdx >= 0 ? args.filter((_, i) => i !== 0 && i !== keepIdx && i !== keepIdx + 1) : args.slice(1);
const names = nameArgs.filter((a) => a && !a.startsWith("--"));

async function main() {
  const listRes = await fetch(`${base}/v1/brand_profiles?limit=200`);
  if (!listRes.ok) {
    console.error("Failed to list brands", listRes.status, await listRes.text());
    process.exit(1);
  }
  const { items } = await listRes.json();

  let toDelete;
  if (keepId) {
    toDelete = items.filter((b) => b.id !== keepId);
    console.log("Keeping brand id:", keepId);
    if (toDelete.length === 0) {
      console.log("No other brands to delete.");
      return;
    }
  } else {
    const matchNames = names.length ? names : ["Colonivpr", "Hello Tabs", "Sticky Green", "pharmacytime"];
    toDelete = items.filter((b) =>
      matchNames.some((n) => (b.name || "").toLowerCase() === n.toLowerCase() || (b.slug || "").toLowerCase() === n.toLowerCase().replace(/\s+/g, "-"))
    );
    if (toDelete.length === 0) {
      console.log("No matching brands found for:", matchNames.join(", "));
      return;
    }
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
