#!/usr/bin/env node
/**
 * Create a brand profile from a JSON file via the Control Plane API.
 *
 * Usage:
 *   CONTROL_PLANE_API=https://localhost:3001 node scripts/create-brand-from-json.mjs scripts/brands/pharmacytime-com.brand.json
 *   CONTROL_PLANE_API=https://ai-factory-api-staging.onrender.com node scripts/create-brand-from-json.mjs scripts/brands/pharmacytime-com.brand.json
 *
 * JSON file may include: name, slug, identity, tone, visual_style, copy_style, design_tokens, deck_theme, report_theme.
 * The API requires `name`; optional `slug` overrides the default derived from name.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const apiBase = process.env.CONTROL_PLANE_API ?? "http://localhost:3001";
const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/create-brand-from-json.mjs <path-to-brand.json>");
  process.exit(1);
}

const absolutePath = jsonPath.startsWith("/") ? jsonPath : resolve(process.cwd(), jsonPath);
const raw = readFileSync(absolutePath, "utf8");
const payload = JSON.parse(raw);

const body = {
  name: payload.name,
  slug: payload.slug ?? undefined,
  identity: payload.identity ?? {},
  tone: payload.tone ?? {},
  visual_style: payload.visual_style ?? {},
  copy_style: payload.copy_style ?? {},
  design_tokens: payload.design_tokens ?? {},
  deck_theme: payload.deck_theme ?? {},
  report_theme: payload.report_theme ?? {},
};

async function main() {
  console.log("Control Plane API:", apiBase);
  console.log("Brand name:", body.name);
  if (body.slug) console.log("Slug:", body.slug);

  const res = await fetch(`${apiBase}/v1/brand_profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Create brand failed:", res.status, text);
    process.exit(1);
  }

  const created = await res.json();
  console.log("Created brand:", created.id, created.name, "(slug:", created.slug + ")");
  console.log("Console URL (if applicable): /brands/" + created.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
