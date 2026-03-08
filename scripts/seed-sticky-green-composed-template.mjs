#!/usr/bin/env node
/**
 * Create one email template composed from component library: header_logo → hero_1 (no image) → product_block_2 → footer_logo.
 * 0 content images, 2 products. Uses Sticky Green as brand_profile_id (resolved by slug).
 * Run after: migration 20250313000001, seed-email-component-library.mjs, seed-brand-sticky-green.mjs
 *
 * Usage: node scripts/seed-sticky-green-composed-template.mjs [CONTROL_PLANE_URL]
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");
const TEMPLATE_NAME = "Sticky Green - Composed";
const SEQUENCE = ["header_logo", "hero_1", "product_block_2", "footer_logo"];

async function resolveStickyGreenBrandId() {
  const res = await fetch(`${base}/v1/brand_profiles?search=sticky-green&limit=5`);
  if (!res.ok) throw new Error(`Failed to list brands: ${await res.text()}`);
  const { items } = await res.json();
  const brand = items.find((b) => (b.slug || "").toLowerCase() === "sticky-green" || (b.name || "").toLowerCase().includes("sticky green"));
  if (!brand) throw new Error("Sticky Green brand not found. Run seed-brand-sticky-green.mjs first.");
  return brand.id;
}

async function main() {
  const brandProfileId = await resolveStickyGreenBrandId();
  const listRes = await fetch(`${base}/v1/email_component_library?limit=200`);
  if (!listRes.ok) throw new Error(`Failed to list components: ${await listRes.text()}`);
  const { items } = await listRes.json();
  const byType = new Map(items.map((c) => [c.component_type, c]));
  const ids = [];
  for (const type of SEQUENCE) {
    const c = byType.get(type);
    if (!c) throw new Error(`Component not found: ${type}. Run seed-email-component-library.mjs first.`);
    ids.push(c.id);
  }
  const listTpl = await fetch(`${base}/v1/email_templates?brand_profile_id=${brandProfileId}&limit=100`);
  if (!listTpl.ok) throw new Error(`Failed to list templates: ${await listTpl.text()}`);
  const { items: templates } = await listTpl.json();
  const existing = templates.find((t) => t.name === TEMPLATE_NAME);
  if (existing) {
    const patchRes = await fetch(`${base}/v1/email_templates/${existing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_sequence: JSON.stringify(ids), img_count: 0 }),
    });
    if (!patchRes.ok) throw new Error(`Failed to update template: ${await patchRes.text()}`);
    console.log("Updated email template:", existing.id, TEMPLATE_NAME);
  } else {
    const body = {
      type: "newsletter",
      name: TEMPLATE_NAME,
      brand_profile_id: brandProfileId,
      component_sequence: ids,
      mjml: null,
      img_count: 0,
    };
    const createRes = await fetch(`${base}/v1/email_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!createRes.ok) throw new Error(`Failed to create template: ${await createRes.text()}`);
    const template = await createRes.json();
    console.log("Created email template:", template.id, template.name);
  }
  console.log("Component sequence:", SEQUENCE.join(" → "));
  console.log("Slots: 0 content images, 2 products.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
