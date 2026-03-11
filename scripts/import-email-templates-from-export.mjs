#!/usr/bin/env node
/**
 * Restore email templates from a JSON export (e.g. from export-email-templates-from-control-plane.mjs).
 * POSTs each template to the Control Plane; skips id/created_at.
 *
 * Usage:
 *   CONTROL_PLANE_URL=https://ai-factory-api-staging.onrender.com node scripts/import-email-templates-from-export.mjs
 *   node scripts/import-email-templates-from-export.mjs --in data/cultura-templates/exported-templates.json
 */
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const inArg = process.argv.find((a) => a.startsWith("--in="))?.split("=")[1] ?? process.argv[process.argv.indexOf("--in") + 1];
const IN_PATH = inArg ? resolve(root, inArg) : resolve(root, "data/cultura-templates/exported-templates.json");

async function main() {
  if (!existsSync(IN_PATH)) {
    console.error("Export file not found:", IN_PATH);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(IN_PATH, "utf8"));
  const templates = Array.isArray(raw) ? raw : [];
  if (templates.length === 0) {
    console.log("No templates in file.");
    return;
  }

  console.log("Importing", templates.length, "templates to", CONTROL_PLANE, "...");
  let created = 0;
  let failed = 0;
  for (const t of templates) {
    const body = {
      name: t.name,
      type: t.type ?? "newsletter",
      image_url: t.image_url ?? null,
      mjml: t.mjml ?? null,
      img_count: t.img_count != null ? Number(t.img_count) : 0,
      template_json: t.template_json ?? null,
      sections_json: t.sections_json ?? t.template_json ?? null,
      component_sequence: t.component_sequence ?? null,
      brand_profile_id: t.brand_profile_id ?? null,
    };
    const res = await fetch(`${CONTROL_PLANE}/v1/email_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      created++;
      console.log("Created:", body.name);
    } else {
      failed++;
      console.error("Failed:", body.name, res.status, await res.text());
    }
  }
  console.log("Done. Created:", created, "Failed:", failed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
