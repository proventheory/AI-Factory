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

const COMPONENTS = [
  {
    component_type: "header_logo",
    name: "Header with logo",
    description: "Single row: logo linked to site URL, optional tagline.",
    position: 0,
    placeholder_docs: ["logo", "siteUrl", "brandName"],
    mjml_fragment: `<mj-section background-color="#ffffff" padding="20px 24px">
  <mj-column>
    <mj-image src="[logo]" alt="[brandName]" href="[siteUrl]" width="120px" align="left" />
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "hero_1",
    name: "Hero centered",
    description: "Full-width: headline, body, CTA button.",
    position: 1,
    placeholder_docs: ["headline", "body", "cta_url", "cta_text", "brandColor"],
    mjml_fragment: `<mj-section background-color="#f8fafc" padding="40px 24px">
  <mj-column>
    <mj-text font-size="28px" font-weight="bold" align="center" color="#1e293b">[headline]</mj-text>
    <mj-text font-size="16px" align="center" color="#475569" padding-top="12px">[body]</mj-text>
    <mj-button background-color="[brandColor]" href="[cta_url]" padding-top="24px">[cta_text]</mj-button>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "hero_2",
    name: "Hero with image",
    description: "Two-column: hero image + headline and body.",
    position: 2,
    placeholder_docs: ["image_url", "headline", "body", "brandColor"],
    mjml_fragment: `<mj-section background-color="#ffffff" padding="32px 24px">
  <mj-column width="50%">
    <mj-image src="[image_url]" alt="[headline]" width="280px" />
  </mj-column>
  <mj-column width="50%">
    <mj-text font-size="24px" font-weight="bold" color="#1e293b">[headline]</mj-text>
    <mj-text font-size="15px" color="#475569" padding-top="12px">[body]</mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "hero_3",
    name: "Hero minimal",
    description: "Compact: headline only or headline + one line.",
    position: 3,
    placeholder_docs: ["headline", "body"],
    mjml_fragment: `<mj-section background-color="#f1f5f9" padding="24px 24px">
  <mj-column>
    <mj-text font-size="22px" font-weight="bold" color="#1e293b">[headline]</mj-text>
    <mj-text font-size="14px" color="#64748b" padding-top="8px">[body]</mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "product_block_1",
    name: "Product single",
    description: "One product: image, title, link, description.",
    position: 4,
    placeholder_docs: ["product A src", "product A title", "product A productUrl", "product A description"],
    mjml_fragment: `<mj-section background-color="#ffffff" padding="24px">
  <mj-column>
    <mj-image src="[product A src]" alt="[product A title]" href="[product A productUrl]" width="100%" />
    <mj-text font-size="18px" font-weight="bold"><a href="[product A productUrl]" style="color:#1e293b">[product A title]</a></mj-text>
    <mj-text font-size="14px" color="#475569">[product A description]</mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "product_block_2",
    name: "Product 2-col",
    description: "Two products side by side (A, B).",
    position: 5,
    placeholder_docs: ["product A src", "product A title", "product A productUrl", "product B src", "product B title", "product B productUrl"],
    mjml_fragment: `<mj-section background-color="#ffffff" padding="24px">
  <mj-column width="50%">
    <mj-image src="[product A src]" alt="[product A title]" href="[product A productUrl]" width="100%" />
    <mj-text font-size="16px" font-weight="bold"><a href="[product A productUrl]" style="color:#1e293b">[product A title]</a></mj-text>
  </mj-column>
  <mj-column width="50%">
    <mj-image src="[product B src]" alt="[product B title]" href="[product B productUrl]" width="100%" />
    <mj-text font-size="16px" font-weight="bold"><a href="[product B productUrl]" style="color:#1e293b">[product B title]</a></mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "product_block_3",
    name: "Product grid",
    description: "Four products in a grid (A–D).",
    position: 6,
    placeholder_docs: ["product A src", "product A title", "product A productUrl", "product B src", "product B title", "product B productUrl", "product C src", "product C title", "product C productUrl", "product D src", "product D title", "product D productUrl"],
    mjml_fragment: `<mj-section background-color="#ffffff" padding="24px">
  <mj-column width="50%">
    <mj-image src="[product A src]" alt="[product A title]" href="[product A productUrl]" width="100%" />
    <mj-text font-size="14px"><a href="[product A productUrl]" style="color:#1e293b">[product A title]</a></mj-text>
  </mj-column>
  <mj-column width="50%">
    <mj-image src="[product B src]" alt="[product B title]" href="[product B productUrl]" width="100%" />
    <mj-text font-size="14px"><a href="[product B productUrl]" style="color:#1e293b">[product B title]</a></mj-text>
  </mj-column>
</mj-section>
<mj-section background-color="#ffffff" padding="0 24px 24px">
  <mj-column width="50%">
    <mj-image src="[product C src]" alt="[product C title]" href="[product C productUrl]" width="100%" />
    <mj-text font-size="14px"><a href="[product C productUrl]" style="color:#1e293b">[product C title]</a></mj-text>
  </mj-column>
  <mj-column width="50%">
    <mj-image src="[product D src]" alt="[product D title]" href="[product D productUrl]" width="100%" />
    <mj-text font-size="14px"><a href="[product D productUrl]" style="color:#1e293b">[product D title]</a></mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    component_type: "footer_logo",
    name: "Footer with logo",
    description: "Copyright, site link, contact, social icons.",
    position: 7,
    placeholder_docs: ["footerRights", "siteUrl", "contactInfo", "social media link", "social media icon"],
    mjml_fragment: `<mj-section background-color="#1e293b" padding="24px">
  <mj-column>
    <mj-text font-size="12px" color="#94a3b8" align="center">[footerRights] · <a href="[siteUrl]" style="color:#94a3b8">Visit site</a></mj-text>
    <mj-text font-size="12px" color="#94a3b8" align="center" padding-top="8px">[contactInfo]</mj-text>
    <mj-social font-size="14px" icon-size="24px" mode="horizontal" padding-top="12px">
      <mj-social-element name="facebook" href="[social media link]" src="[social media icon]" />
    </mj-social>
  </mj-column>
</mj-section>`,
  },
];

async function main() {
  let created = 0;
  for (const c of COMPONENTS) {
    const res = await fetch(`${base}/v1/email_component_library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        component_type: c.component_type,
        name: c.name,
        description: c.description,
        mjml_fragment: c.mjml_fragment,
        placeholder_docs: c.placeholder_docs,
        position: c.position,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Failed to create ${c.component_type}:`, res.status, err);
      process.exitCode = 1;
      continue;
    }
    created += 1;
    console.log(`Created: ${c.component_type} (${c.name})`);
  }
  console.log(`Done. Created ${created}/${COMPONENTS.length} components.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
