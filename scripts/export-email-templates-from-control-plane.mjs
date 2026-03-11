#!/usr/bin/env node
/**
 * Export all email templates from the Control Plane API to a JSON file.
 * Use this to snapshot your current templates (including any you synced from Cultura
 * and then adjusted) so they can be committed and restored later.
 *
 * Usage:
 *   CONTROL_PLANE_URL=https://ai-factory-api-staging.onrender.com node scripts/export-email-templates-from-control-plane.mjs
 *   node scripts/export-email-templates-from-control-plane.mjs --out data/cultura-templates/exported-templates.json
 *
 * Output: JSON array of { id, name, type, image_url, mjml, img_count, template_json, sections_json, created_at }
 * (fields needed to re-create via POST /v1/email_templates, minus id/created_at).
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const outArg = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] ?? process.argv[process.argv.indexOf("--out") + 1];
const OUT_PATH = outArg ? resolve(root, outArg) : resolve(root, "data/cultura-templates/exported-templates.json");

async function fetchAllTemplates() {
  const out = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${CONTROL_PLANE}/v1/email_templates?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();
    const items = data.items ?? [];
    out.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  console.log("Fetching templates from", CONTROL_PLANE, "...");
  const templates = await fetchAllTemplates();
  console.log("Found", templates.length, "templates.");

  const exportable = templates.map((t) => ({
    name: t.name,
    type: t.type ?? "newsletter",
    image_url: t.image_url ?? null,
    mjml: t.mjml ?? null,
    img_count: t.img_count != null ? Number(t.img_count) : 0,
    template_json: t.template_json ?? null,
    sections_json: t.sections_json ?? t.template_json ?? null,
    component_sequence: t.component_sequence ?? null,
    brand_profile_id: t.brand_profile_id ?? null,
    created_at: t.created_at,
    id: t.id,
  }));

  mkdirSync(resolve(OUT_PATH, ".."), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(exportable, null, 2), "utf8");
  console.log("Wrote", OUT_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
