/**
 * Extract brand tokens from a live website URL: colors, fonts, logo, sitemap.
 * Fetches the page and parses HTML/CSS to pull real values (no placeholders).
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { Parser } from "xml2js";

export interface TokenizeFromUrlResult {
  name: string;
  website: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  font_headings: string | null;
  font_body: string | null;
  sitemap_url: string | null;
  sitemap_type: string;
  title: string | null;
  meta_description: string | null;
  raw_colors: string[];
  raw_fonts: string[];
}

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_RE = /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g;
const CSS_VAR_COLOR_RE = /--[\w-]*(?:color|primary|brand|accent|bg)[\w-]*\s*:\s*([^;}+]+)/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}+]+)(?:\s*;|\s*})/g;
const GOOGLE_FONT_FAMILY_RE = /family=([^&:]+)(?::|&|$)/g;

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("URL is required");
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    u.pathname = ""; // base origin
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    throw new Error("Invalid URL");
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function normalizeHex(hex: string): string {
  const h = hex.replace(/^#/, "");
  if (h.length === 3) return `#${h.split("").map((c) => c + c).join("")}`;
  return h.length === 6 ? `#${h}` : hex;
}

function parseColorsFromCss(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(HEX_RE)) {
    const normalized = normalizeHex(`#${m[1]}`);
    if (normalized.length === 7) out.push(normalized);
  }
  for (const m of css.matchAll(RGB_RE)) {
    out.push(rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  for (const m of css.matchAll(CSS_VAR_COLOR_RE)) {
    const val = m[1].trim();
    const hexMatch = val.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
    if (hexMatch) out.push(normalizeHex(`#${hexMatch[1]}`));
    const rgbMatch = val.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgbMatch) out.push(rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])));
  }
  return out;
}

function parseFontsFromCss(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(FONT_FAMILY_RE)) {
    const stack = m[1].trim().split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    if (stack[0]) out.push(stack[0]);
  }
  return out;
}

function parseFontsFromGoogleLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(GOOGLE_FONT_FAMILY_RE)) {
    const name = decodeURIComponent(m[1].trim().replace(/\+/g, " "));
    if (name && !/^\d+$/.test(name)) out.push(name);
  }
  return out;
}

function isLikelyNeutral(hex: string): boolean {
  const h = hex.replace(/^#/, "");
  if (h.length === 3) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const gray = (r + g + b) / 3;
  const diff = Math.abs(r - gray) + Math.abs(g - gray) + Math.abs(b - gray);
  return diff < 30 || gray > 250 || gray < 15;
}

function pickPrimarySecondary(hexes: string[]): { primary: string | null; secondary: string | null } {
  const counts = new Map<string, number>();
  for (const h of hexes) {
    const normalized = h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
    if (!isLikelyNeutral(normalized)) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    primary: sorted[0]?.[0] ?? null,
    secondary: sorted[1]?.[0] ?? sorted[0]?.[0] ?? null,
  };
}

/** Detect platform from sitemap URL path and/or page HTML (e.g. Shopify uses sitemap_products_1.xml). */
function inferSitemapType(sitemapUrl: string | null, htmlSnapshot: string): string {
  const htmlLower = htmlSnapshot.toLowerCase();
  const isShopify =
    htmlLower.includes("shopify") ||
    htmlLower.includes("cdn.shopify.com") ||
    htmlLower.includes("shopify.com/s/files");
  if (isShopify) return "shopify";
  if (sitemapUrl) {
    const lower = sitemapUrl.toLowerCase();
    try {
      const path = new URL(sitemapUrl).pathname.toLowerCase();
      if (path.includes("sitemap_products") || path.includes("shopify")) return "shopify";
    } catch {
      if (lower.includes("shopify")) return "shopify";
    }
    if (lower.includes("bigcommerce")) return "bigcommerce";
    if (lower.includes("drupal")) return "drupal";
  }
  return "ecommerce";
}

/**
 * Fetch homepage HTML and extract brand tokens.
 */
export async function tokenizeBrandFromUrl(inputUrl: string): Promise<TokenizeFromUrlResult> {
  const baseUrl = normalizeUrl(inputUrl);
  const origin = new URL(baseUrl).origin;

  const response = await axios.get(baseUrl, {
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: (s) => s === 200,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandTokenizer/1.0)" },
  });

  const html = response.data as string;
  const $ = cheerio.load(html);

  const resolve = (href: string | undefined): string | null => {
    if (!href) return null;
    try {
      return new URL(href, origin).href;
    } catch {
      return null;
    }
  };

  // Name from title or domain
  const titleEl = $("title").first().text().trim();
  const domainName = new URL(baseUrl).hostname.replace(/^www\./, "").split(".")[0];
  const name = titleEl || domainName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Logo: header img, or [alt*="logo"], or first img in nav/home link
  let logoUrl: string | null =
    resolve($('header img[alt*="logo" i]').first().attr("src")) ??
    resolve($('img[alt*="logo" i]').first().attr("src")) ??
    resolve($('a[href="/"] img').first().attr("src")) ??
    resolve($("header img").first().attr("src")) ??
    resolve($('nav img').first().attr("src")) ??
    null;
  if (!logoUrl && $('link[rel="apple-touch-icon"]').length) {
    logoUrl = resolve($('link[rel="apple-touch-icon"]').attr("href"));
  }
  if (!logoUrl) {
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage && /logo|brand|icon/i.test(ogImage)) logoUrl = resolve(ogImage);
  }

  // Collect all CSS for color/font extraction
  let allCss = "";
  $("style").each((_, el) => {
    const text = $(el).html();
    if (text) allCss += text;
  });
  $("[style]").each((_, el) => {
    const s = $(el).attr("style");
    if (s) allCss += ` .x{${s}}`;
  });
  const rawColors = parseColorsFromCss(allCss);
  const fontsFromCss = parseFontsFromCss(allCss);
  const fontsFromGoogle = parseFontsFromGoogleLinks(html);
  const rawFonts = [...new Set([...fontsFromCss, ...fontsFromGoogle])];
  const { primary: primary_color, secondary: secondary_color } = pickPrimarySecondary(rawColors);
  const font_headings = rawFonts[0] ?? null;
  const font_body = rawFonts[1] ?? rawFonts[0] ?? null;

  // Meta description
  const meta_description =
    $('meta[name="description"]').attr("content")?.trim() ??
    $('meta[property="og:description"]').attr("content")?.trim() ??
    null;

  // Sitemap: link rel="sitemap" or try common paths (including Shopify sitemap_products_1.xml)
  let sitemap_url: string | null = resolve($('link[rel="sitemap"]').attr("href"));
  if (!sitemap_url) {
    const candidates = [
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_products_1.xml`,
      `${origin}/sitemap_products.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/sitemap-index.xml`,
      `${origin}/sitemap_index.xml.gz`,
    ];
    for (const url of candidates) {
      try {
        const res = await axios.get(url, {
          timeout: 8000,
          maxRedirects: 2,
          validateStatus: (s) => s === 200,
          responseType: "text",
        });
        const body = res.data as string;
        if (body.includes("<urlset") || body.includes("<sitemapindex")) {
          sitemap_url = url;
          if (body.includes("<sitemapindex")) {
            const parser = new Parser();
            const parsed = (await parser.parseStringPromise(body)) as {
              sitemapindex?: { sitemap?: Array<{ loc?: string[] }> };
            };
            const locs = parsed?.sitemapindex?.sitemap?.flatMap((s) => s.loc ?? []) ?? [];
            const productSitemap = locs.find((loc) => /product|products|item/i.test(loc));
            if (productSitemap) sitemap_url = productSitemap;
          }
          break;
        }
      } catch {
        continue;
      }
    }
  }
  const sitemap_type = inferSitemapType(sitemap_url ?? "", html);

  return {
    name,
    website: baseUrl,
    logo_url: logoUrl,
    primary_color,
    secondary_color,
    font_headings,
    font_body,
    sitemap_url,
    sitemap_type,
    title: titleEl || null,
    meta_description,
    raw_colors: [...new Set(rawColors)].slice(0, 20),
    raw_fonts: [...new Set(rawFonts)].slice(0, 10),
  };
}
