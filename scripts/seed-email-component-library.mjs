#!/usr/bin/env node
/**
 * Seed email_component_library with 10 MJML fragments: header_logo, hero_1–3, product_block_1–3, footer_logo.
 * Placeholders follow BRAND_EMAIL_FIELD_MAPPING. Run after migration 20250313000000_email_component_library.sql.
 *
 * Usage: node scripts/seed-email-component-library.mjs [CONTROL_PLANE_URL]
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");

// Premium email components — inspired by MJML.io templates (Racoon, Card, Arturia, Proof).
// Placeholders follow BRAND_EMAIL_FIELD_MAPPING; same keys so runner and brand substitution work unchanged.
const COMPONENTS = [
  {
    component_type: "header_logo",
    name: "Header with logo",
    description: "Single row: logo linked to site URL, optional tagline. Refined spacing and subtle border.",
    position: 0,
    placeholder_docs: ["logo", "siteUrl", "brandName"],
    mjml_fragment: `<mj-section background-color="#ffffff" padding="28px 40px 24px" css-class="header-section">
  <mj-column>
    <mj-image src="[logo]" alt="[brandName]" href="[siteUrl]" width="140px" align="center" padding="0" fluid-on-mobile="true" />
  </mj-column>
</mj-section>
<mj-section padding="0 40px">
  <mj-column>
    <mj-divider border-color="#e2e8f0" border-width="1px" padding-bottom="0" padding-top="0" />
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "hero_1",
    name: "Hero centered",
    description: "Full-width: headline, body, CTA. Strong hierarchy and generous whitespace.",
    position: 1,
    placeholder_docs: ["headline", "body", "cta_url", "cta_text", "brandColor"],
    mjml_fragment: `<mj-section background-color="#f8fafc" padding="56px 40px">
  <mj-column width="100%">
    <mj-text font-size="36px" font-weight="700" align="center" color="#0f172a" line-height="1.2" padding="0 16px" css-class="hero-headline">[headline]</mj-text>
    <mj-text font-size="17px" align="center" color="#475569" line-height="1.6" padding-top="20px" padding-left="24px" padding-right="24px">[body]</mj-text>
    <mj-button background-color="[brandColor]" href="[cta_url]" padding-top="32px" padding-bottom="8px" border-radius="8px" inner-padding="14px 32px" font-size="16px" font-weight="600">[cta_text]</mj-button>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "hero_2",
    name: "Hero with image",
    description: "Two-column: hero image + headline, body, CTA. Image stacks on mobile.",
    position: 2,
    placeholder_docs: ["image_url", "headline", "body", "cta_url", "cta_text", "brandColor"],
    mjml_fragment: `<mj-section background-color="#ffffff" padding="40px 24px">
  <mj-column width="48%" vertical-align="middle">
    <mj-image src="[image_url]" alt="[headline]" width="280px" padding="0 12px 0 0" fluid-on-mobile="true" />
  </mj-column>
  <mj-column width="52%" vertical-align="middle">
    <mj-text font-size="28px" font-weight="700" color="#0f172a" line-height="1.25" padding="0 0 16px 0">[headline]</mj-text>
    <mj-text font-size="16px" color="#475569" line-height="1.6" padding-bottom="24px">[body]</mj-text>
    <mj-button background-color="[brandColor]" href="[cta_url]" border-radius="8px" inner-padding="12px 28px" font-size="15px" font-weight="600">[cta_text]</mj-button>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "hero_overlay",
    name: "Hero full-bleed with overlay",
    description: "Full-width hero with background image and dark overlay; headline and CTA in white.",
    position: 8,
    placeholder_docs: ["image_url", "headline", "body", "cta_url", "cta_text", "brandColor"],
    mjml_fragment: `<mj-section background-url="[image_url]" background-width="600px" background-height="400px" padding="88px 32px" vertical-align="middle">
  <mj-column width="100%" vertical-align="middle">
    <mj-text font-size="34px" font-weight="700" color="#ffffff" align="center" line-height="1.2" padding-bottom="16px" text-shadow="0 1px 2px rgba(0,0,0,0.3)">[headline]</mj-text>
    <mj-text font-size="18px" color="#f1f5f9" align="center" line-height="1.5" padding-bottom="28px">[body]</mj-text>
    <mj-button background-color="[brandColor]" href="[cta_url]" align="center" border-radius="8px" inner-padding="14px 36px" font-size="16px" font-weight="600">[cta_text]</mj-button>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "hero_3",
    name: "Hero minimal",
    description: "Compact: headline and one line. Clean and scannable.",
    position: 3,
    placeholder_docs: ["headline", "body"],
    mjml_fragment: `<mj-section background-color="#f1f5f9" padding="32px 40px">
  <mj-column>
    <mj-text font-size="24px" font-weight="700" color="#0f172a" line-height="1.3">[headline]</mj-text>
    <mj-text font-size="15px" color="#64748b" line-height="1.5" padding-top="10px">[body]</mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "product_block_1",
    name: "Product single",
    description: "One product: image, title, link, description. Card-style with clear CTA.",
    position: 4,
    placeholder_docs: ["product A src", "product A title", "product A productUrl", "product A description"],
    mjml_fragment: `<mj-section padding="0" background-color="#f1f5f9">
  <mj-column padding="0"><mj-image src="[product A src]" alt="[product A title]" href="[product A productUrl]" width="100%" padding="0" /></mj-column>
</mj-section>
<mj-section background-color="#fafafa" padding="28px 40px 32px">
  <mj-column>
    <mj-text font-size="20px" font-weight="700"><a href="[product A productUrl]" style="color:#0f172a;text-decoration:none">[product A title]</a></mj-text>
    <mj-text font-size="15px" color="#475569" line-height="1.5" padding-top="8px">[product A description]</mj-text>
    <mj-button href="[product A productUrl]" background-color="#0f172a" border-radius="6px" inner-padding="10px 24px" font-size="14px" padding-top="20px">Shop now</mj-button>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "product_block_2",
    name: "Product 2-col",
    description: "Two products side by side (A, B). Polished cards with descriptions.",
    position: 5,
    placeholder_docs: ["product A src", "product A title", "product A productUrl", "product B src", "product B title", "product B productUrl"],
    mjml_fragment: `<mj-section background-color="#fafafa" padding="24px 20px">
  <mj-column width="50%" padding="8px">
    <mj-image src="[product A src]" alt="[product A title]" href="[product A productUrl]" width="100%" padding="0" />
    <mj-text font-size="16px" font-weight="600" padding="16px 0 6px"><a href="[product A productUrl]" style="color:#0f172a;text-decoration:none">[product A title]</a></mj-text>
    <mj-text font-size="13px" padding="0 0 8px"><a href="[product A productUrl]" style="color:[brandColor];text-decoration:none;font-weight:600">View product →</a></mj-text>
  </mj-column>
  <mj-column width="50%" padding="8px">
    <mj-image src="[product B src]" alt="[product B title]" href="[product B productUrl]" width="100%" padding="0" />
    <mj-text font-size="16px" font-weight="600" padding="16px 0 6px"><a href="[product B productUrl]" style="color:#0f172a;text-decoration:none">[product B title]</a></mj-text>
    <mj-text font-size="13px" padding="0 0 8px"><a href="[product B productUrl]" style="color:[brandColor];text-decoration:none;font-weight:600">View product →</a></mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "product_block_3",
    name: "Product grid",
    description: "Four products in a grid (A–D). Compact cards, mobile-friendly stack.",
    position: 6,
    placeholder_docs: ["product A src", "product A title", "product A productUrl", "product B src", "product B title", "product B productUrl", "product C src", "product C title", "product C productUrl", "product D src", "product D title", "product D productUrl"],
    mjml_fragment: `<mj-section background-color="#fafafa" padding="16px 20px 8px">
  <mj-column width="50%" padding="6px">
    <mj-image src="[product A src]" alt="[product A title]" href="[product A productUrl]" width="100%" padding="0" />
    <mj-text font-size="14px" font-weight="600" padding="12px 0 0"><a href="[product A productUrl]" style="color:#0f172a;text-decoration:none">[product A title]</a></mj-text>
  </mj-column>
  <mj-column width="50%" padding="6px">
    <mj-image src="[product B src]" alt="[product B title]" href="[product B productUrl]" width="100%" padding="0" />
    <mj-text font-size="14px" font-weight="600" padding="12px 0 0"><a href="[product B productUrl]" style="color:#0f172a;text-decoration:none">[product B title]</a></mj-text>
  </mj-column>
</mj-section>
<mj-section background-color="#fafafa" padding="8px 20px 24px">
  <mj-column width="50%" padding="6px">
    <mj-image src="[product C src]" alt="[product C title]" href="[product C productUrl]" width="100%" padding="0" />
    <mj-text font-size="14px" font-weight="600" padding="12px 0 0"><a href="[product C productUrl]" style="color:#0f172a;text-decoration:none">[product C title]</a></mj-text>
  </mj-column>
  <mj-column width="50%" padding="6px">
    <mj-image src="[product D src]" alt="[product D title]" href="[product D productUrl]" width="100%" padding="0" />
    <mj-text font-size="14px" font-weight="600" padding="12px 0 0"><a href="[product D productUrl]" style="color:#0f172a;text-decoration:none">[product D title]</a></mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "footer_logo",
    name: "Footer with logo",
    description: "Copyright, site link (brandColor), contact, social. Clear hierarchy.",
    position: 7,
    placeholder_docs: ["footerRights", "siteUrl", "contactInfo", "logo_white_url", "social media link", "social media icon", "brandColor"],
    mjml_fragment: `<mj-section padding="0 40px 16px">
  <mj-column>
    <mj-divider border-color="#e2e8f0" border-width="1px" padding-bottom="24px" padding-top="0" />
  </mj-column>
</mj-section>
<mj-section background-color="#0f172a" padding="32px 40px">
  <mj-column width="100%">
    <mj-image src="[logo_white_url]" alt="[brandName]" href="[siteUrl]" width="120px" align="center" padding="0 0 16px 0" />
    <mj-text font-size="13px" color="#94a3b8" align="center" line-height="1.5">[footerRights]</mj-text>
    <mj-text font-size="13px" align="center" padding-top="8px"><a href="[siteUrl]" style="color:[brandColor];font-weight:600;text-decoration:none">Visit our site</a></mj-text>
    <mj-text font-size="12px" color="#64748b" align="center" padding-top="12px">[contactInfo]</mj-text>
    <mj-social font-size="14px" icon-size="22px" mode="horizontal" padding-top="20px" icon-padding="8px">
      <mj-social-element name="facebook" href="[social media link]" src="[social media icon]" />
    </mj-social>
  </mj-column>
</mj-section>`,
  },
];

async function main() {
  const listRes = await fetch(`${base}/v1/email_component_library?limit=200`);
  if (!listRes.ok) throw new Error(`Failed to list components: ${await listRes.text()}`);
  const { items: existing } = await listRes.json();
  const byType = new Map((existing ?? []).map((x) => [x.component_type, x]));

  let created = 0;
  let updated = 0;
  for (const c of COMPONENTS) {
    const existingRow = byType.get(c.component_type);
    const payload = {
      component_type: c.component_type,
      name: c.name,
      description: c.description,
      mjml_fragment: c.mjml_fragment,
      placeholder_docs: c.placeholder_docs,
      position: c.position,
    };
    if (existingRow) {
      const res = await fetch(`${base}/v1/email_component_library/${existingRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`Failed to update ${c.component_type}:`, res.status, await res.text());
        process.exitCode = 1;
        continue;
      }
      updated += 1;
      console.log(`Updated: ${c.component_type} (${c.name})`);
      continue;
    }
    const res = await fetch(`${base}/v1/email_component_library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Failed to create ${c.component_type}:`, res.status, errText);
      if (errText.includes("use_context") && res.status === 500) {
        console.error("  (Staging DB may be missing use_context column. Run migration 20250314000000_email_component_library_use_context.sql)");
      }
      process.exitCode = 1;
      continue;
    }
    created += 1;
    console.log(`Created: ${c.component_type} (${c.name})`);
  }
  console.log(`Done. Created ${created}, updated ${updated}, total ${COMPONENTS.length} components.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
