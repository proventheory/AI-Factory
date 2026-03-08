#!/usr/bin/env node
/**
 * Seed email templates (MJML) for Email Marketing wizard.
 * Includes defaults + Cultura-style layouts (hero, product grid, CTA).
 *
 * Usage: node scripts/seed-email-templates.mjs [CONTROL_PLANE_URL]
 * Env: CONTROL_PLANE_URL or pass as first arg. Default: http://localhost:3001
 *
 * If you get "relation email_templates does not exist", run the migration on the
 * same DB the Control Plane uses (e.g. Render DATABASE_URL):
 *   DATABASE_URL="postgresql://..." node scripts/run-email-templates-migration.mjs
 * Then run this seed again.
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
  {
    type: "promo",
    name: "Hero + CTA (Cultura-style)",
    img_count: 1,
    mjml: `<mjml>
  <mj-body background-color="#f8f9fa">
    <mj-section background-color="#ffffff" padding="32px 24px">
      <mj-column>
        <mj-text font-size="14px" color="#666" align="center">{{prehead}}</mj-text>
        <mj-text font-size="28px" font-weight="bold" align="center" padding-top="8px">{{headline}}</mj-text>
        <mj-text font-size="16px" color="#555" align="center" line-height="1.6">{{subhead}}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="0 24px 24px">
      <mj-column>
        <mj-image src="{{hero_image}}" alt="Hero" href="{{cta_url}}" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="0 24px 32px">
      <mj-column>
        <mj-button background-color="#2563eb" href="{{cta_url}}" padding="16px 32px">{{cta_text}}</mj-button>
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
    type: "promo",
    name: "Two-column product spotlight",
    img_count: 2,
    mjml: `<mjml>
  <mj-body background-color="#ffffff">
    <mj-section padding="24px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" align="center">{{title}}</mj-text>
        <mj-text font-size="14px" color="#666" align="center">{{description}}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="16px 24px">
      <mj-column width="50%">
        <mj-image src="{{product_1_image}}" alt="Product 1" href="{{product_1_url}}" />
        <mj-text font-size="14px" font-weight="bold" align="center">{{product_1_title}}</mj-text>
        <mj-text font-size="12px" color="#555" align="center">{{product_1_description}}</mj-text>
      </mj-column>
      <mj-column width="50%">
        <mj-image src="{{product_2_image}}" alt="Product 2" href="{{product_2_url}}" />
        <mj-text font-size="14px" font-weight="bold" align="center">{{product_2_title}}</mj-text>
        <mj-text font-size="12px" color="#555" align="center">{{product_2_description}}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="24px">
      <mj-column>
        <mj-button background-color="#16a34a" href="{{cta_url}}" align="center">{{cta_text}}</mj-button>
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
    name: "Minimal announcement",
    img_count: 0,
    mjml: `<mjml>
  <mj-body background-color="#ffffff">
    <mj-section padding="48px 24px">
      <mj-column>
        <mj-text font-size="12px" color="#888" align="center">{{eyebrow}}</mj-text>
        <mj-text font-size="26px" font-weight="bold" align="center" padding-top="8px">{{headline}}</mj-text>
        <mj-text font-size="16px" color="#444" align="center" line-height="1.7" padding-top="16px">{{body}}</mj-text>
        <mj-button background-color="#111" href="{{cta_url}}" padding-top="24px">{{cta_text}}</mj-button>
      </mj-column>
    </mj-section>
    <mj-section padding="24px">
      <mj-column>
        <mj-text font-size="11px" color="#999" align="center">{{footer}}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  },
  {
    type: "newsletter",
    name: "Dark hero (1 image)",
    img_count: 1,
    mjml: `<mjml>
  <mj-body background-color="#1E3730">
    <mj-section background-color="#1E3730" padding="28px 32px 24px">
      <mj-column width="100%">
        <mj-image src="[logo]" alt="[brandName]" href="[siteUrl]" width="140px" align="left" padding="0" />
        <mj-text font-size="18px" font-weight="700" color="[brandColor]" align="left" padding-top="8px" padding-left="0">[tagline]</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#1E3730" padding="24px 32px 16px">
      <mj-column>
        <mj-text font-size="32px" font-weight="700" color="[brandColor]" line-height="1.2" padding="0">[headline]</mj-text>
        <mj-text font-size="16px" color="#ffffff" line-height="1.6" padding-top="20px">[body]</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#1E3730" padding="24px 32px">
      <mj-column>
        <mj-image src="[image_url]" alt="[headline]" width="100%" padding="0 8px" border-radius="12px" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#1E3730" padding="32px 32px 24px">
      <mj-column>
        <mj-text font-size="16px" font-weight="700" color="[brandColor]" align="center" padding-bottom="20px">Sign up to start creating effective campaigns.</mj-text>
        <mj-button background-color="[brandColor]" color="#1E3730" href="[cta_url]" border-radius="24px" inner-padding="14px 40px" font-size="14px" font-weight="700" align="center">[cta_text]</mj-button>
      </mj-column>
    </mj-section>
    <mj-section background-color="#264A3E" padding="28px 32px">
      <mj-column width="60%">
        <mj-image src="[logo]" alt="[brandName]" href="[siteUrl]" width="100px" align="left" padding="0" />
      </mj-column>
      <mj-column width="40%" vertical-align="middle">
        <mj-text font-size="13px" color="#ffffff" align="right" padding="0">Follow us</mj-text>
        <mj-social font-size="14px" icon-size="20px" mode="horizontal" padding-top="8px" align="right" icon-padding="4px">
          <mj-social-element name="instagram" href="[social media link]" />
        </mj-social>
      </mj-column>
    </mj-section>
    <mj-section background-color="#264A3E" padding="0 32px 28px">
      <mj-column>
        <mj-text font-size="12px" color="#94a3b8" line-height="1.5" padding="0">[footerRights]</mj-text>
        <mj-text font-size="12px" color="#94a3b8" padding-top="12px">This message was sent to your email. <a href="[siteUrl]" style="color:[brandColor];text-decoration:none">Unsubscribe</a> or update your profile.</mj-text>
        <mj-text font-size="12px" color="#94a3b8" padding-top="12px">[contactInfo]</mj-text>
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
