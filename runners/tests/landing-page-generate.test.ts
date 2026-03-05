/**
 * Unit tests for landing page HTML generation.
 * Run: npm test (or npx tsx --test runners/tests/landing-page-generate.test.ts)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLandingHtml } from "../src/handlers/landing-page-generate.js";
import type { BrandContext } from "../src/brand-context.js";

describe("buildLandingHtml", () => {
  it("includes headline, body, and CTA when brand is null", () => {
    const html = buildLandingHtml({
      brand: null,
      headline: "Welcome",
      body: "Get started.",
      ctaText: "Sign up",
    });
    assert.ok(html.includes("Welcome"));
    assert.ok(html.includes("Get started."));
    assert.ok(html.includes("Sign up"));
    assert.ok(html.includes("<!DOCTYPE html"));
    assert.ok(html.includes("<h1>"));
    assert.ok(html.includes("class=\"cta\""));
  });

  it("escapes HTML in headline and body", () => {
    const html = buildLandingHtml({
      brand: null,
      headline: "<script>alert(1)</script>",
      body: "a & b",
      ctaText: "Go",
    });
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("a &amp; b"));
    assert.ok(!html.includes("<script>"));
  });

  it("uses brand design_tokens for CSS variables", () => {
    const brand: BrandContext = {
      name: "Test Co",
      design_tokens: {
        colors: {
          brand: { "500": "#0066cc", "600": "#004499", primary: "#0066cc", primary_dark: "#004499" },
          text: { primary: "#111", secondary: "#666" },
          surface: { base: "#fff" },
        },
        typography: {
          fonts: { heading: "Aventa, sans-serif", body: "Inter, sans-serif" },
        },
      },
      identity: {},
      copy_style: {},
    };
    const html = buildLandingHtml({
      brand,
      headline: "Hi",
      body: "Body",
      ctaText: "CTA",
    });
    assert.ok(html.includes("--lp-primary: #0066cc"));
    assert.ok(html.includes("--lp-font-heading: Aventa, sans-serif"));
    assert.ok(html.includes("--lp-font-body: Inter, sans-serif"));
  });

  it("renders two-part wordmark (bold + light) in header", () => {
    const brand: BrandContext = {
      name: "Pharmacytime",
      design_tokens: {
        logo: {
          wordmark_bold: "Pharmacy",
          wordmark_light: "time",
          type: "wordmark",
        },
        colors: { brand: { "500": "#0066cc" } },
      },
      identity: { website: "https://pharmacytime.com" },
      copy_style: {},
    };
    const html = buildLandingHtml({
      brand,
      headline: "Headline",
      body: "Body",
      ctaText: "Go",
    });
    assert.ok(html.includes("lp-logo-bold"));
    assert.ok(html.includes("lp-logo-light"));
    assert.ok(html.includes("Pharmacy"));
    assert.ok(html.includes("time"));
    assert.ok(html.includes("https://pharmacytime.com"));
    assert.ok(html.includes('class="lp-header"'));
  });

  it("renders single wordmark when no bold/light parts", () => {
    const brand: BrandContext = {
      name: "Acme",
      design_tokens: {
        logo: { wordmark: "Acme Inc", type: "wordmark" },
        colors: { brand: { "500": "#000" } },
      },
      identity: {},
      copy_style: {},
    };
    const html = buildLandingHtml({
      brand,
      headline: "Hi",
      body: "Body",
      ctaText: "Go",
    });
    assert.ok(html.includes("Acme Inc"));
    assert.ok(html.includes("lp-logo-link"));
  });

  it("renders logo image when logo.url is set", () => {
    const brand: BrandContext = {
      name: "Logo Brand",
      design_tokens: {
        logo: { url: "https://example.com/logo.png" },
        colors: { brand: { "500": "#000" } },
      },
      identity: {},
      copy_style: {},
    };
    const html = buildLandingHtml({
      brand,
      headline: "Hi",
      body: "Body",
      ctaText: "Go",
    });
    assert.ok(html.includes('src="https://example.com/logo.png"'));
    assert.ok(html.includes("lp-logo-img"));
  });
});
