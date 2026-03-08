#!/usr/bin/env node
/**
 * Add or update Sticky Green brand with full design tokens, identity, tone, and themes.
 * Source: https://stickygreenflower.com/ (screenshots + site content).
 * Usage: node scripts/seed-brand-sticky-green.mjs [CONTROL_PLANE_URL]
 * Env: CONTROL_PLANE_URL or pass as first arg. Default: http://localhost:3001
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");

const SITE = "https://stickygreenflower.com/";

const stickyGreenBrand = {
  name: "Sticky Green",
  slug: "sticky-green",
  status: "active",
  identity: {
    archetype: "trusted_craft",
    industry: "hemp_wellness",
    tagline: "Premium THCa Flower, Exotic Strains & Hemp Products",
    mission:
      "Sticky Green is a family-owned brand, founded in 2018. Over the years, we've grown into a trusted leader in the industry by staying true to our commitment to quality, innovation, and integrity. Trusted nationwide by 1M+ customers. High-quality flower you can trust — verified potency, consistent quality.",
    website: SITE,
    contact_email: "stickygreen@gbimportsusa.com",
    location: "Fallbrook, CA",
    values: ["quality", "innovation", "integrity", "trust"],
  },
  tone: {
    voice_descriptors: ["trustworthy", "premium", "friendly", "clear", "compliant", "warm"],
    reading_level: "grade_9",
    formality: "neutral",
    sentence_length: "medium",
  },
  visual_style: {
    density: "default",
    style_description:
      "Clean, modern e-commerce. Green-forward natural palette. Premium product photography (flower, vapes, seltzers). Dark cosmic or light sky backgrounds for product blocks. Prominent CTAs (Shop Now, Subscribe) and trust badges (Free Shipping $70+, GREEN25). Teal accent for outlines and product visuals. FDA disclaimer in reddish-brown bar.",
    image_style: "Premium product shots, close-up flower, lifestyle cans and vapes",
    icon_style: "Minimal line icons for nav, cart, search; cannabis leaf in logo",
  },
  copy_style: {
    voice:
      "Warm but professional. Emphasize quality, trust, and value. Promo-driven (deals, codes like GREEN25, STICKy70). FDA-compliant language. Community hashtags: #STICKYFAM, #CLOUD9, #EXOTICFLOWER.",
    banned_words: [],
    preferred_phrases: ["high quality", "verified potency", "consistent quality", "trusted nationwide"],
    cta_style: "Uppercase bold (SHOP NOW, SHOP 100MG SELTZER, Subscribe)",
  },
  design_tokens: {
    color: {
      brand: {
        "50": "#e6f4ea",
        "100": "#b3e0c0",
        "200": "#80cc96",
        "300": "#4db86d",
        "400": "#26a350",
        "500": "#009933",
        "600": "#007a29",
        "700": "#005c1f",
        "800": "#003d14",
        "900": "#00331a",
        primary: "#009933",
        primary_dark: "#00331a",
      },
      neutral: {
        "50": "#f8faf8",
        "100": "#f1f5f1",
        "200": "#e2e8e2",
        "500": "#64748b",
        "700": "#334155",
        "900": "#0f172a",
      },
    },
    colors: {
      brand: {
        "50": "#e6f4ea",
        "100": "#b3e0c0",
        "200": "#80cc96",
        "300": "#4db86d",
        "400": "#26a350",
        "500": "#009933",
        "600": "#007a29",
        "700": "#005c1f",
        "800": "#003d14",
        "900": "#00331a",
        primary: "#009933",
        primary_dark: "#00331a",
      },
      neutral: {
        "50": "#f8faf8",
        "100": "#f1f5f1",
        "200": "#e2e8e2",
        "500": "#64748b",
        "700": "#334155",
        "900": "#0f172a",
      },
    },
    typography: {
      fonts: { heading: "Inter", body: "Inter", mono: "ui-monospace, monospace" },
      font_headings: "Inter",
      font_body: "Inter",
      heading: {
        h1: { size: "2.25rem", weight: 700, lineHeight: 1.2 },
        h2: { size: "1.875rem", weight: 700, lineHeight: 1.25 },
        h3: { size: "1.5rem", weight: 600, lineHeight: 1.3 },
        h4: { size: "1.25rem", weight: 600, lineHeight: 1.35 },
        h5: { size: "1.125rem", weight: 600, lineHeight: 1.4 },
        h6: { size: "1rem", weight: 600, lineHeight: 1.5 },
      },
      body: {
        default: { size: "1rem", weight: 400, lineHeight: 1.5 },
        small: { size: "0.875rem", weight: 400, lineHeight: 1.5 },
      },
      caption: { size: "0.875rem", weight: 400, lineHeight: 1.4 },
      fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    },
    logo: { url: "" },
    logo_url: "",
    logo_white_url: "",
    cta_text: "Shop Now",
    cta_link: SITE,
    contact_info: [
      { type: "phone", value: "(210) 593-8426" },
      { type: "address", value: "40722 Daily Road, Fallbrook, CA 92028" },
    ],
    sitemap_url: "https://stickygreenflower.com/sitemap_products.xml",
    sitemap_type: "shopify",
    social_media: [
      { name: "Facebook", url: "https://www.facebook.com/stickygreenflower" },
      { name: "X", url: "https://twitter.com/stickygreen" },
      { name: "Instagram", url: "https://www.instagram.com/stickygreenflower" },
      { name: "Pinterest", url: "https://www.pinterest.com/stickygreen" },
      { name: "TikTok", url: "https://www.tiktok.com/@stickygreen" },
    ],
    asset_urls: [],
    meta: {
      source: SITE,
      tokenized_at: new Date().toISOString(),
      notes: "Full palette and typography from stickygreenflower.com; logo URL add in Console.",
    },
  },
  deck_theme: {
    chart_color_sequence: ["#009933", "#007a29", "#005c1f", "#26a350", "#4db86d", "#00331a"],
    font_config: { heading: "Inter", body: "Inter" },
    slide_master: { title_font: "Inter", title_size: "1.875rem", title_weight: 700 },
  },
  report_theme: {
    header_style: { background: "#00331a", text: "#ffffff" },
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
    (b) => (b.slug || "").toLowerCase() === "sticky-green" || (b.name || "").toLowerCase().includes("sticky green")
  );

  if (existing) {
    console.log("Updating existing brand:", existing.id, existing.name);
    const putRes = await fetch(`${base}/v1/brand_profiles/${existing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stickyGreenBrand),
    });
    const putText = await putRes.text();
    if (!putRes.ok) {
      console.error("Error", putRes.status, putText);
      process.exit(1);
    }
    const updated = JSON.parse(putText);
    console.log("Updated brand:", updated.id, updated.name);
    console.log("Design tokens: full palette (50–900), typography scale, contact_info, social_media, deck_theme, report_theme.");
    return updated;
  }

  console.log("Creating new brand (Sticky Green not found).");
  const res = await fetch(`${base}/v1/brand_profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stickyGreenBrand),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Error", res.status, text);
    process.exit(1);
  }
  const created = JSON.parse(text);
  console.log("Created brand:", created.id, created.name, created.slug);
  console.log("Design tokens synced to brand_design_tokens_flat (if table exists).");
  return created;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
