#!/usr/bin/env node
/**
 * Seed email templates (MJML) for Email Marketing wizard.
 * Includes defaults + Cultura-style layouts (hero, product grid, CTA) + "Dark hero (1 image)".
 *
 * Usage: node scripts/seed-email-templates.mjs [CONTROL_PLANE_URL]
 * Env: CONTROL_PLANE_URL or pass as first arg. Default: http://localhost:3001
 *
 * To see templates (and the new "Dark hero (1 image)") in the console Document Templates page,
 * run this against the same Control Plane URL your console uses (e.g. staging API URL).
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
  {
    type: "newsletter",
    name: "Stitch (1 image, 2 products)",
    img_count: 1,
    mjml: `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="[font_body]" />
      <mj-section padding="0" />
      <mj-column padding="0" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#FFF9EB" width="600">
    <!-- Header: cream, logo + brand left, nav right -->
    <mj-section background-color="#FFF9EB" padding="24px 32px" border-bottom="1px solid rgba(0,66,37,0.1)">
      <mj-column width="60%" vertical-align="middle">
        <mj-image src="[logo]" alt="[brandName]" href="[siteUrl]" width="120px" padding="0" align="left" />
        <mj-text font-family="[font_headings]" font-size="24px" font-weight="700" color="[brandColor]" padding="8px 0 0 0" align="left">[brandName]</mj-text>
      </mj-column>
      <mj-column width="40%" vertical-align="middle">
        <mj-text font-family="[font_headings]" font-size="11px" font-weight="700" color="[brandColor]" align="right" padding="0" letter-spacing="0.15em">
          <a href="[siteUrl]" style="color:[brandColor];text-decoration:none">SHOP</a>
          <span style="color:rgba(0,66,37,0.4);margin:0 8px">|</span>
          <a href="[siteUrl]" style="color:[brandColor];text-decoration:none">JOURNAL</a>
        </mj-text>
      </mj-column>
    </mj-section>
    <!-- Hero: background image + dark overlay + overlaid headline, body, and CTA button -->
    <mj-section padding="0">
      <mj-column width="100%" padding="0">
        <mj-raw>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-image:url([image_url]); background-size:cover; background-position:center; background-repeat:no-repeat; min-height:450px;">
            <tr>
              <td style="padding:0; vertical-align:middle;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:rgba(0,0,0,0.35); min-height:450px;">
                  <tr>
                    <td style="padding:48px 32px 56px; vertical-align:middle; text-align:center;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center">
                        <tr><td style="font-family:[font_headings], Georgia, serif; font-size:40px; font-weight:700; color:#ffffff; line-height:1.15; padding:0 16px 16px;">[headline]</td></tr>
                        <tr><td style="font-family:[font_body], sans-serif; font-size:18px; color:rgba(255,255,255,0.92); line-height:1.5; padding:0 24px 24px;">[body]</td></tr>
                        <tr><td style="padding:24px 0 0; text-align:center;">
                          <a href="[cta_url]" style="display:inline-block; font-family:[font_headings], sans-serif; background-color:[brandColor]; color:#ffffff; padding:16px 40px; border-radius:9999px; font-weight:700; font-size:15px; text-decoration:none;">[cta_text]</a>
                        </td></tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </mj-raw>
      </mj-column>
    </mj-section>
    <!-- Wavy divider: cream wave into coral (brand) section -->
    <mj-section padding="0" background-color="[brandColor]">
      <mj-column width="100%" padding="0">
        <mj-raw>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="line-height:0;font-size:0;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 120" preserveAspectRatio="none" width="100%" height="48" style="display:block;vertical-align:bottom;"><path fill="#FFF9EB" d="M0,80L48,85C96,90,192,100,288,98C384,96,480,82,576,78C672,74,768,80,864,85C960,90,1056,95,1152,92C1248,89,1344,79,1392,74L1440,69L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z"/></svg>
          </td></tr></table>
        </mj-raw>
      </mj-column>
    </mj-section>
    <!-- Product section: coral/brand bg, title "Artisanal Treats", 2 cards cream -->
    <mj-section background-color="[brandColor]" padding="32px 24px 40px">
      <mj-column width="100%">
        <mj-text font-family="[font_headings]" font-size="28px" font-weight="700" color="#ffffff" align="center" padding="0 0 8px">Artisanal Treats</mj-text>
        <mj-divider border-color="rgba(255,255,255,0.4)" border-width="2px" width="48px" padding-bottom="24px" align="center" />
      </mj-column>
    </mj-section>
    <mj-section background-color="[brandColor]" padding="0 24px 40px">
      <mj-column width="50%" padding="0 8px" vertical-align="top" background-color="#FFF9EB" border-radius="16px">
        <mj-image src="[product A src]" alt="[product A title]" href="[product A productUrl]" width="276px" padding="0" border-radius="12px 12px 0 0" fluid-on-mobile="true" />
        <mj-text font-family="[font_headings]" font-size="20px" font-weight="700" color="#004225" padding="16px 16px 4px">[product A title]</mj-text>
        <mj-text font-family="[font_body]" font-size="14px" color="rgba(0,66,37,0.65)" line-height="1.4" padding="0 16px 16px">[product A description]</mj-text>
        <mj-button font-family="[font_headings]" background-color="#004225" color="#ffffff" href="[product A productUrl]" border-radius="12px" inner-padding="12px 24px" font-size="12px" font-weight="700" padding="0 16px 16px 16px" letter-spacing="0.08em">SHOP NOW</mj-button>
      </mj-column>
      <mj-column width="50%" padding="0 8px" vertical-align="top" background-color="#FFF9EB" border-radius="16px">
        <mj-image src="[product B src]" alt="[product B title]" href="[product B productUrl]" width="276px" padding="0" border-radius="12px 12px 0 0" fluid-on-mobile="true" />
        <mj-text font-family="[font_headings]" font-size="20px" font-weight="700" color="#004225" padding="16px 16px 4px">[product B title]</mj-text>
        <mj-text font-family="[font_body]" font-size="14px" color="rgba(0,66,37,0.65)" line-height="1.4" padding="0 16px 16px">[product B description]</mj-text>
        <mj-button font-family="[font_headings]" background-color="#004225" color="#ffffff" href="[product B productUrl]" border-radius="12px" inner-padding="12px 24px" font-size="12px" font-weight="700" padding="0 16px 16px 16px" letter-spacing="0.08em">SHOP NOW</mj-button>
      </mj-column>
    </mj-section>
    <!-- Wavy divider: brand/coral wave into dark green -->
    <mj-section padding="0" background-color="#004225">
      <mj-column width="100%" padding="0">
        <mj-raw>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="line-height:0;font-size:0;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 120" preserveAspectRatio="none" width="100%" height="48" style="display:block;vertical-align:bottom;"><path fill="[brandColor]" d="M0,64L48,80C96,96,192,128,288,128C384,128,480,96,576,106C672,116,768,166,864,171C960,176,1056,139,1152,117C1248,95,1344,95,1392,95L1440,95L1440,120L0,120Z"/></svg>
          </td></tr></table>
        </mj-raw>
      </mj-column>
    </mj-section>
    <!-- Results That Matter: dark green, accent headline, CTA button -->
    <mj-section background-color="#004225" padding="48px 32px 56px">
      <mj-column width="100%">
        <mj-text font-family="[font_headings]" font-size="36px" font-weight="700" color="[brandColor]" align="center" padding="0 0 24px">Results That Matter</mj-text>
        <mj-text font-family="[font_body]" font-size="17px" color="rgba(255,249,235,0.88)" align="center" line-height="1.6" padding="0 16px 32px">Every one is unique. Discover the perfect fit tailored to you.</mj-text>
        <mj-button font-family="[font_headings]" background-color="[brandColor]" color="#004225" href="[siteUrl]" border-radius="9999px" inner-padding="18px 48px" font-size="14px" font-weight="800" align="center" letter-spacing="0.05em">TAKE THE QUIZ</mj-button>
      </mj-column>
    </mj-section>
    <!-- Footer: dark -->
    <mj-section background-color="#0f0f0f" padding="40px 32px">
      <mj-column width="100%">
        <mj-image src="[logo_white_url]" alt="[brandName]" href="[siteUrl]" width="90px" align="center" padding="0 0 16px" />
        <mj-text font-family="[font_headings]" font-size="18px" font-weight="700" color="#ffffff" align="center" padding="0 0 24px">[brandName]</mj-text>
        <mj-social font-size="14px" icon-size="20px" mode="horizontal" icon-padding="8px" padding-bottom="24px">
          <mj-social-element name="facebook" href="[social media link]" />
          <mj-social-element name="instagram" href="[social media 2 link]" />
        </mj-social>
        <mj-text font-family="[font_body]" font-size="11px" color="#94a3b8" align="center" line-height="1.5" letter-spacing="0.15em" text-transform="uppercase">[contactInfo]</mj-text>
        <mj-text font-family="[font_body]" font-size="11px" color="#94a3b8" align="center" padding-top="12px" letter-spacing="0.15em">[footerRights]</mj-text>
        <mj-text font-family="[font_body]" font-size="11px" align="center" padding-top="16px">
          <a href="[siteUrl]" style="color:[brandColor];text-decoration:none">Unsubscribe</a>
          <span style="color:rgba(255,255,255,0.2);margin:0 8px">|</span>
          <a href="[siteUrl]" style="color:[brandColor];text-decoration:none">Privacy Policy</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  },
];

/** Export for update-stitch-template-mjml.mjs (update existing Stitch template in DB). */
export { TEMPLATES };

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

if (process.argv[1]?.endsWith("seed-email-templates.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
