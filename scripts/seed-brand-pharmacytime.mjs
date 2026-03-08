#!/usr/bin/env node
/**
 * Add or update Pharmacy Time brand with design tokens from pharmacytime.com.
 * Source: Design screenshots (Styles/Colors panels + Home, Product, Category pages).
 * Usage: node scripts/seed-brand-pharmacytime.mjs [CONTROL_PLANE_URL]
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");

const SITE = "https://pharmacytime.com";

// Palette from design: Linear/Primary purples #3B2160, #241437, #4B1F5E, #844CA0, #6D2C91; light lavender #E8E2EE; accent blue #00C0D4
const pharmacytimeBrand = {
  name: "Pharmacy Time",
  slug: "pharmacytime-com",
  status: "active",
  identity: {
    archetype: "trusted_care",
    industry: "health_wellness",
    tagline: "Weight Management personalized to you",
    mission:
      "Modern pharmacy and clinically guided weight loss. Personalized medical programs, GLP-1 options, licensed providers. Trusted by 10K+ patients. End-to-end care 100% online.",
    website: SITE,
    contact_email: "",
    location: "",
    values: ["quality", "trust", "personalization", "clinical_expertise"],
  },
  tone: {
    voice_descriptors: ["professional", "warm", "clear", "trustworthy", "approachable"],
    reading_level: "grade_8",
    formality: "professional",
    sentence_length: "medium",
  },
  visual_style: {
    density: "default",
    style_description:
      "Clean, modern health/telehealth. Purple-dominant palette: deep purple hero/footer/buttons, light lavender section backgrounds, white content areas. Accent blue for some icons. Card-based layout, sans-serif typography. H1 bold white on dark purple; H2/H3 bold dark on light; body regular.",
    image_style: "Professional photography: diverse individuals, medical products, doctors",
    icon_style: "Minimal line icons; social icons white on dark purple footer",
  },
  copy_style: {
    voice: "Warm but professional. Emphasize personalization, trust, clinical guidance. CTAs: Get Started, Start order, Add to Cart, Learn More, Sign Up Today.",
    banned_words: [],
    preferred_phrases: ["personalized", "clinically guided", "trusted", "weight management", "modern pharmacy"],
    cta_style: "Bold sans-serif, white on purple buttons (Get Started, Start order, Add to Cart)",
  },
  design_tokens: {
    color: {
      brand: {
        "50": "#f3eef6",
        "100": "#e8dcee",
        "200": "#c9a3d4",
        "300": "#a366b8",
        "400": "#844CA0",
        "500": "#6D2C91",
        "600": "#5B2478",
        "700": "#4B1F5E",
        "800": "#3B2160",
        "900": "#241437",
        primary: "#6D2C91",
        primary_dark: "#241437",
      },
      neutral: {
        "50": "#f8f9fa",
        "100": "#f1f3f5",
        "200": "#e8e2ee",
        "500": "#64748b",
        "700": "#334155",
        "900": "#1a1a1a",
      },
    },
    colors: {
      brand: {
        "50": "#f3eef6",
        "100": "#e8dcee",
        "200": "#c9a3d4",
        "300": "#a366b8",
        "400": "#844CA0",
        "500": "#6D2C91",
        "600": "#5B2478",
        "700": "#4B1F5E",
        "800": "#3B2160",
        "900": "#241437",
        primary: "#6D2C91",
        primary_dark: "#241437",
      },
      neutral: {
        "50": "#f8f9fa",
        "100": "#f1f3f5",
        "200": "#e8e2ee",
        "500": "#64748b",
        "700": "#334155",
        "900": "#1a1a1a",
      },
    },
    typography: {
      fonts: { heading: "Aventa, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", body: "Aventa, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", mono: "ui-monospace, monospace" },
      font_headings: "Aventa, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      font_body: "Aventa, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      heading: {
        h1: { size: "3.5rem", weight: 600, lineHeight: 1.2 },
        h2: { size: "2.5rem", weight: 600, lineHeight: 1.2 },
        h3: { size: "2rem", weight: 600, lineHeight: 1.2 },
        h4: { size: "1.5rem", weight: 600, lineHeight: 1.2 },
        h5: { size: "1.25rem", weight: 600, lineHeight: 1.2 },
        h6: { size: "1.125rem", weight: 600, lineHeight: 1.2 },
      },
      body: {
        default: { size: "1rem", weight: 400, lineHeight: 1.6 },
        small: { size: "0.875rem", weight: 400, lineHeight: 1.5 },
      },
      caption: { size: "0.875rem", weight: 400, lineHeight: 1.4 },
      display: { size: "2.75rem", weight: 400, lineHeight: 1.2, letterSpacing: "-0.02em" },
      fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    },
    logo: { url: `${SITE}/favicon.ico` },
    logo_url: `${SITE}/favicon.ico`,
    logo_white_url: "",
    cta_text: "Get Started",
    cta_link: SITE,
    contact_info: [],
    sitemap_url: "",
    sitemap_type: "",
    social_media: [
      { name: "Facebook", url: "https://www.facebook.com/pharmacytime" },
      { name: "Instagram", url: "https://www.instagram.com/pharmacytime" },
      { name: "X", url: "https://twitter.com/pharmacytime" },
      { name: "LinkedIn", url: "https://www.linkedin.com/company/pharmacytime" },
      { name: "YouTube", url: "https://www.youtube.com/@pharmacytime" },
    ],
    asset_urls: [],
    meta: {
      source: SITE,
      tokenized_at: new Date().toISOString(),
      notes: "Palette from design (purple #241437–#844CA0); typography: bold headings, regular body. Social URLs are placeholders—verify on site.",
    },
  },
  deck_theme: {
    chart_color_sequence: ["#6D2C91", "#4B1F5E", "#3B2160", "#844CA0", "#a366b8", "#241437"],
    font_config: { heading: "Aventa, sans-serif", body: "Aventa, sans-serif" },
    slide_master: { title_font: "Bebas Neue, Aventa, sans-serif", title_size: "2rem", title_weight: 700 },
  },
  report_theme: {
    header_style: { background: "#241437", text: "#ffffff" },
    section_spacing: "1.5rem",
  },
};

async function main() {
  const listRes = await fetch(`${base}/v1/brand_profiles?limit=200`);
  if (!listRes.ok) {
    console.error("Failed to list brands", listRes.status, await listRes.text());
    process.exit(1);
  }
  const { items } = await listRes.json();
  const existing = items.find(
    (b) =>
      (b.slug || "").toLowerCase() === "pharmacytime-com" ||
      (b.name || "").toLowerCase().includes("pharmacy time")
  );

  if (existing) {
    console.log("Updating existing brand:", existing.id, existing.name);
    const putRes = await fetch(`${base}/v1/brand_profiles/${existing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pharmacytimeBrand),
    });
    const putText = await putRes.text();
    if (!putRes.ok) {
      console.error("Error", putRes.status, putText);
      process.exit(1);
    }
    const updated = JSON.parse(putText);
    console.log("Updated brand:", updated.id, updated.name);
    console.log("Design tokens: purple palette (50–900), typography (bold H1–H3), deck_theme, report_theme, social_media placeholders.");
    return updated;
  }

  console.log("Creating new brand (Pharmacy Time not found).");
  const res = await fetch(`${base}/v1/brand_profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pharmacytimeBrand),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Error", res.status, text);
    process.exit(1);
  }
  const created = JSON.parse(text);
  console.log("Created brand:", created.id, created.name, created.slug);
  return created;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
