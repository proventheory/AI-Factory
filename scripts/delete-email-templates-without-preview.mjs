#!/usr/bin/env node
/**
 * Delete email templates that have no preview image (image_url null or empty).
 *
 * Usage: node scripts/delete-email-templates-without-preview.mjs [CONTROL_PLANE_URL]
 * Env: CONTROL_PLANE_URL or pass as first arg. Default: http://localhost:3001
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");

async function main() {
  console.log("Fetching templates from", base);
  const res = await fetch(`${base}/v1/email_templates?limit=200`);
  if (!res.ok) {
    console.error("Failed to list templates:", res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const items = data?.items ?? [];
  const noPreview = items.filter((t) => !t.image_url || String(t.image_url).trim() === "");
  console.log(`Total templates: ${items.length}. Without preview image: ${noPreview.length}`);

  if (noPreview.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  for (const t of noPreview) {
    const delRes = await fetch(`${base}/v1/email_templates/${t.id}`, { method: "DELETE" });
    if (delRes.ok) {
      console.log("Deleted:", t.id, t.name ?? t.type);
    } else {
      console.error("Failed to delete", t.id, delRes.status, await delRes.text());
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
