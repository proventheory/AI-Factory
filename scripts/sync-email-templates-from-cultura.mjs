#!/usr/bin/env node
/**
 * Pull email templates from Cultura/Focuz Supabase and push to our Control Plane.
 *
 * Env:
 *   CULTURA_SUPABASE_URL   - e.g. https://aimferclcnvhawzpruzn.supabase.co
 *   CULTURA_SUPABASE_ANON  - publishable/anon key
 *   CONTROL_PLANE_URL      - our API base (e.g. https://ai-factory-api-staging.onrender.com)
 *
 * Usage:
 *   CULTURA_SUPABASE_URL=... CULTURA_SUPABASE_ANON=... CONTROL_PLANE_URL=... node scripts/sync-email-templates-from-cultura.mjs
 *
 * Cultura templates table: id, type, img_count, imageUrl, mjml, json, sections (camelCase).
 * We only sync rows that have mjml set. Re-run skips templates that already exist (same name+type).
 */
import "dotenv/config";

const SUPABASE_URL = (process.env.CULTURA_SUPABASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_ANON = process.env.CULTURA_SUPABASE_ANON ?? "";
const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error("Set CULTURA_SUPABASE_URL and CULTURA_SUPABASE_ANON.");
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  "Content-Type": "application/json",
};

function nameFromImageUrl(imageUrl, type, id) {
  if (!imageUrl || typeof imageUrl !== "string") return `${type} ${id.slice(0, 8)}`;
  try {
    const pathname = new URL(imageUrl).pathname;
    const base = pathname.split("/").pop() ?? "";
    const name = base.replace(/\?.*$/, "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ");
    if (name.length > 2) return name.slice(0, 80);
  } catch (_) {}
  return `${type} ${id.slice(0, 8)}`;
}

async function fetchAllTemplates() {
  const out = [];
  const pageSize = 50;
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/templates?select=id,type,img_count,imageUrl,mjml,json,sections&order=id&offset=${offset}&limit=${pageSize}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    for (const row of page) {
      if (row.mjml != null && String(row.mjml).trim()) {
        out.push(row);
      }
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function existingNamesByType() {
  const set = new Set();
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${CONTROL_PLANE}/v1/email_templates?limit=${limit}&offset=${offset}`);
    if (!res.ok) return set;
    const data = await res.json();
    const items = data.items ?? [];
    for (const row of items) {
      set.add(`${row.type ?? ""}\t${(row.name ?? "").toLowerCase()}`);
    }
    if (items.length < limit) break;
    offset += limit;
  }
  return set;
}

async function main() {
  console.log("Fetching existing templates from Control Plane...");
  const existing = await existingNamesByType();
  console.log("Fetching templates from Cultura Supabase...");
  const templates = await fetchAllTemplates();
  console.log(`Found ${templates.length} templates with MJML.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of templates) {
    const name = nameFromImageUrl(t.imageUrl, t.type, t.id);
    const type = t.type ?? "newsletter";
    if (existing.has(`${type}\t${name.toLowerCase()}`)) {
      skipped++;
      console.log("Skip (exists):", name);
      continue;
    }

    const body = {
      type,
      name,
      image_url: t.imageUrl ?? null,
      mjml: typeof t.mjml === "string" ? t.mjml.replace(/\r\n/g, "\n") : t.mjml,
      img_count: t.img_count != null ? Number(t.img_count) : 0,
      template_json: t.json ?? null,
      sections_json: t.sections ?? null,
    };

    const res = await fetch(`${CONTROL_PLANE}/v1/email_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();

    if (res.ok) {
      const createdRow = JSON.parse(text);
      console.log("Created:", createdRow.id, name, `(${body.type}, img_count=${body.img_count})`);
      created++;
    } else {
      failed++;
      console.error("Error", name, res.status, text.slice(0, 200));
    }
  }

  console.log("\nDone. Created:", created, "Skipped:", skipped, "Failed:", failed);
  console.log("List: GET", `${CONTROL_PLANE}/v1/email_templates`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
