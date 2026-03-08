#!/usr/bin/env node
/**
 * Update existing "Stitch (1 image, 2 products)" template(s) in the Control Plane DB
 * with the current MJML from the seed (hero with cover/no-repeat, product image widths, etc.).
 * Use this after changing the Stitch template in seed-email-templates.mjs so deployed/staging
 * templates get the fix without creating duplicates.
 *
 * Usage:
 *   CONTROL_PLANE_URL=https://ai-factory-api-staging.onrender.com node scripts/update-stitch-template-mjml.mjs
 *   node scripts/update-stitch-template-mjml.mjs http://localhost:3001
 */
import "dotenv/config";
import { TEMPLATES } from "./seed-email-templates.mjs";

const API = (process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");

const STITCH_NAME = "Stitch (1 image, 2 products)";
const stitch = TEMPLATES.find((t) => t.name && t.name.includes("Stitch") && t.name.includes("2 products"));
if (!stitch?.mjml) {
  console.error("Stitch template not found in seed (TEMPLATES).");
  process.exit(1);
}

async function main() {
  const res = await fetch(`${API}/v1/email_templates?limit=200`);
  if (!res.ok) {
    console.error("Failed to list templates:", res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const items = data.items ?? [];
  const stitchTemplates = items.filter(
    (t) => t.name && t.name.includes("Stitch") && t.name.includes("2 products")
  );
  if (stitchTemplates.length === 0) {
    console.log("No Stitch (1 image, 2 products) template found in the API. Seed first: node scripts/seed-email-templates.mjs", API);
    process.exit(0);
  }
  for (const t of stitchTemplates) {
    const patchRes = await fetch(`${API}/v1/email_templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mjml: stitch.mjml, img_count: stitch.img_count ?? 1 }),
    });
    if (!patchRes.ok) {
      console.error("Failed to PATCH", t.id, t.name, patchRes.status, await patchRes.text());
      continue;
    }
    console.log("Updated:", t.id, t.name);
  }
  console.log("Done. Re-run a generate with the Stitch template to see the fixed email.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
