#!/usr/bin/env node
/**
 * Delete email templates by exact name. Use to clear out generic/duplicate templates
 * before re-seeding a minimal set.
 *
 * Usage: node scripts/delete-email-templates-by-name.mjs <CONTROL_PLANE_URL> [name1] [name2] ...
 *   If no names given, deletes the default list (templates from the Document Templates table).
 *
 * Example: node scripts/delete-email-templates-by-name.mjs https://ai-factory-api-staging.onrender.com
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "";
const base = API.replace(/\/$/, "");

const DEFAULT_NAMES = [
  "Dark hero (1 image)",
  "Minimal announcement",
  "Two-column product spotlight",
  "Hero + CTA (Cultura-style)",
  "Single CTA",
  "Promo / Product Grid",
  "Simple Newsletter",
];

async function main() {
  if (!base) {
    console.error("Usage: node scripts/delete-email-templates-by-name.mjs <CONTROL_PLANE_URL> [name1] [name2] ...");
    process.exit(1);
  }
  const names = process.argv.slice(3).length > 0 ? process.argv.slice(3) : DEFAULT_NAMES;
  const res = await fetch(`${base}/v1/email_templates?limit=500`);
  if (!res.ok) {
    console.error("Failed to list templates:", res.status, await res.text());
    process.exit(1);
  }
  const { items } = await res.json();
  const toDelete = (items ?? []).filter((t) => names.includes(t.name));
  if (toDelete.length === 0) {
    console.log("No templates matched the names. Nothing to delete.");
    return;
  }
  console.log(`Deleting ${toDelete.length} template(s): ${toDelete.map((t) => t.name).join(", ")}`);
  for (const t of toDelete) {
    const del = await fetch(`${base}/v1/email_templates/${t.id}`, { method: "DELETE" });
    if (!del.ok) {
      console.error("Failed to delete", t.name, t.id, del.status, await del.text());
      continue;
    }
    console.log("Deleted:", t.name, t.id);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
