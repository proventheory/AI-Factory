#!/usr/bin/env node
/**
 * Add Sticky Green brand and tokenize it (design_tokens, identity, tone).
 * Source: https://stickygreenflower.com/
 * Usage: node scripts/seed-brand-sticky-green.mjs [CONTROL_PLANE_URL]
 * Env: CONTROL_PLANE_URL or pass as first arg. Default: http://localhost:3001
 */
import "dotenv/config";

const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const base = API.replace(/\/$/, "");

const stickyGreenBrand = {
  name: "Sticky Green",
  slug: "sticky-green",
  identity: {
    archetype: "trusted_craft",
    industry: "hemp_wellness",
    tagline: "Premium THCa Flower, Exotic Strains & Hemp Products",
    mission:
      "Family-owned brand founded in 2018. Trusted nationwide by 1M+ customers. High-quality flower you can trust — verified potency, consistent quality. Commitment to quality, innovation, and integrity.",
    website: "https://stickygreenflower.com/",
    contact_email: "stickygreen@gbimportsusa.com",
    location: "Fallbrook, CA",
  },
  tone: {
    voice_descriptors: ["trustworthy", "premium", "friendly", "clear", "compliant"],
    reading_level: "grade_9",
    formality: "neutral",
    density: "default",
  },
  visual_style: {
    density: "default",
    style_description:
      "Clean, modern e-commerce. Green-forward natural palette. Premium product photography. Prominent CTAs and trust badges (Free Shipping $70+, codes like GREEN25).",
  },
  copy_style: {
    voice: "Warm but professional. Emphasize quality, trust, and value. Promo-driven (deals, codes). FDA-compliant language.",
    banned_words: [],
  },
  design_tokens: {
    colors: {
      brand: {
        "500": "#16a34a",
        "600": "#15803d",
        primary: "#16a34a",
        primary_dark: "#15803d",
      },
    },
    color: { brand: { "500": "#16a34a", "600": "#15803d" } },
    typography: {
      fonts: { heading: "Inter", body: "Inter" },
      font_headings: "Inter",
      font_body: "Inter",
    },
    logo_url: "",
    meta: {
      source: "https://stickygreenflower.com/",
      tokenized_at: new Date().toISOString(),
    },
  },
};

async function main() {
  console.log("POST", `${base}/v1/brand_profiles`);
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
