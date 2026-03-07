#!/usr/bin/env node
/**
 * Add footer social block to all email templates so [social media 1 icon] / [social media 1 link]
 * (and 2–5) appear in the footer and get filled by the runner. Skips templates that already have them.
 *
 * Env: CONTROL_PLANE_URL (e.g. https://ai-factory-api-staging.onrender.com)
 *
 * Usage: CONTROL_PLANE_URL=... node scripts/add-emma-footer-social-placeholders.mjs
 */
import "dotenv/config";

const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? "https://ai-factory-api-staging.onrender.com").replace(
  /\/$/,
  ""
);

// Dark footer backgrounds we recognise; insert social row before this section's closing tag.
const FOOTER_BG_PATTERNS = [/#292929/i, /#333333/i, /#333\b/i, /#2d2d2d/i, /#1a1a1a/i];

// MJML: insert a row with bracket placeholders so replaceBracketPlaceholders fills them in compiled HTML.
function buildSocialMjRaw() {
  const items = [];
  for (let n = 1; n <= 5; n++) {
    items.push(
      `<a href="[social media ${n} link]" target="_blank" style="display:inline-block;margin:0 6px;text-decoration:none;"><img src="[social media ${n} icon]" alt="" width="24" height="24" style="border:0;display:block;height:24px;width:24px;" /></a>`
    );
  }
  const cells = items.join("\n      ");
  return `<mj-raw><tr><td align="center" style="font-size:0px;padding:10px 25px 8px;word-break:break-word;">${cells}</td></tr></mj-raw>`;
}

function findFooterInsertPosition(mjml) {
  // Prefer a known dark-footer section
  for (const pat of FOOTER_BG_PATTERNS) {
    const footerIdx = mjml.search(pat);
    if (footerIdx !== -1) {
      const afterFooter = mjml.slice(footerIdx);
      const sectionEnd = afterFooter.indexOf("</mj-section>");
      if (sectionEnd !== -1) return footerIdx + sectionEnd;
    }
  }
  // Else insert before the last </mj-section> (footer is usually last)
  const lastSectionEnd = mjml.lastIndexOf("</mj-section>");
  if (lastSectionEnd !== -1) return lastSectionEnd;
  return -1;
}

async function fetchAllTemplates() {
  const out = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${CONTROL_PLANE}/v1/email_templates?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`List templates failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const items = data.items ?? data ?? [];
    if (!Array.isArray(items) || items.length === 0) break;
    out.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  const templates = await fetchAllTemplates();
  console.log("Found", templates.length, "template(s).");

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of templates) {
    const id = t.id;
    const name = t.name ?? id;

    const getRes = await fetch(`${CONTROL_PLANE}/v1/email_templates/${id}`);
    if (!getRes.ok) {
      console.warn("Skip", name, "- GET failed:", getRes.status);
      failed++;
      continue;
    }
    const template = await getRes.json();
    let mjml = template.mjml;
    if (typeof mjml !== "string" || !mjml.trim()) {
      skipped++;
      continue;
    }

    if (/\[social media \d+ (icon|link)\]/.test(mjml)) {
      skipped++;
      continue;
    }

    const insertPos = findFooterInsertPosition(mjml);
    if (insertPos === -1) {
      console.warn("Skip", name, "- no </mj-section> found.");
      failed++;
      continue;
    }

    const socialBlock = "\n  " + buildSocialMjRaw() + "\n  ";
    mjml = mjml.slice(0, insertPos) + socialBlock + mjml.slice(insertPos);

    const patchRes = await fetch(`${CONTROL_PLANE}/v1/email_templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mjml }),
    });
    if (!patchRes.ok) {
      console.warn("Skip", name, "- PATCH failed:", patchRes.status, await patchRes.text());
      failed++;
      continue;
    }
    console.log("Updated:", name, id);
    updated++;
  }

  console.log("Done. Updated:", updated, "| Skipped (already have social or no mjml):", skipped, "| Failed:", failed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
