#!/usr/bin/env node
/**
 * Seed 2–3 email templates (MJML) for Email Marketing wizard.
 * Usage: node scripts/seed-email-templates.mjs [CONTROL_PLANE_URL]
 * Env: CONTROL_PLANE_URL or pass as first arg. Default: http://localhost:3001
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");

const TEMPLATES = [
  {
    type: "newsletter",
    name: "Simple Newsletter",
    img_count: 1,
    mjml: `<mjml>
  <mj-body background-color="#f4f4f4">
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" align="center">{{header}}</mj-text>
        <mj-text font-size="14px" color="#666666" align="center">{{subhead}}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text>{{body}}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-button background-color="#2563eb" href="{{cta_url}}">{{cta_text}}</mj-button>
      </mj-column>
    </mj-section>
    <mj-section padding="20px">
      <mj-column>
        <mj-text font-size="12px" color="#999999" align="center">{{footer}}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  },
  {
    type: "promo",
    name: "Promo / Product Grid",
    img_count: 4,
    mjml: `<mjml>
  <mj-body background-color="#f4f4f4">
    <mj-section background-color="#ffffff" padding="24px">
      <mj-column>
        <mj-text font-size="28px" font-weight="bold" align="center">{{title}}</mj-text>
        <mj-text font-size="16px" color="#555" align="center">{{description}}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="16px">
      <mj-column width="50%">
        <mj-image src="{{product_1_image}}" alt="Product 1" href="{{product_1_url}}" />
        <mj-text font-size="14px" align="center">{{product_1_title}}</mj-text>
      </mj-column>
      <mj-column width="50%">
        <mj-image src="{{product_2_image}}" alt="Product 2" href="{{product_2_url}}" />
        <mj-text font-size="14px" align="center">{{product_2_title}}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="16px">
      <mj-column width="50%">
        <mj-image src="{{product_3_image}}" alt="Product 3" href="{{product_3_url}}" />
        <mj-text font-size="14px" align="center">{{product_3_title}}</mj-text>
      </mj-column>
      <mj-column width="50%">
        <mj-image src="{{product_4_image}}" alt="Product 4" href="{{product_4_url}}" />
        <mj-text font-size="14px" align="center">{{product_4_title}}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="20px">
      <mj-column>
        <mj-text font-size="12px" color="#999" align="center">{{footer}}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  },
  {
    type: "newsletter",
    name: "Single CTA",
    img_count: 0,
    mjml: `<mjml>
  <mj-body background-color="#ffffff">
    <mj-section padding="40px 24px">
      <mj-column>
        <mj-text font-size="22px" font-weight="bold">{{headline}}</mj-text>
        <mj-text font-size="16px" line-height="1.6">{{message}}</mj-text>
        <mj-button background-color="#16a34a" href="{{cta_link}}" padding-top="24px">{{cta_label}}</mj-button>
      </mj-column>
    </mj-section>
    <mj-section padding="24px">
      <mj-column>
        <mj-text font-size="12px" color="#888">{{footer}}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  },
];

async function main() {
  console.log("Seeding email templates at", base);
  for (const t of TEMPLATES) {
    const res = await fetch(`${base}/v1/email_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: t.type,
        name: t.name,
        mjml: t.mjml,
        img_count: t.img_count ?? 0,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("Error creating template", t.name, res.status, text);
      continue;
    }
    const created = JSON.parse(text);
    console.log("Created:", created.id, t.name, `(${t.type})`);
  }
  console.log("Done. List templates: GET", `${base}/v1/email_templates`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
