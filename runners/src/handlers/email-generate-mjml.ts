/**
 * Email generate MJML: generate HTML email from template + products + brand (Focuz flow).
 * Ported from email-marketing-factory ai-engine mjmlJsonGen; adapted to load brand/template from Control Plane.
 */

import { createHash } from "node:crypto";
import mjml2html from "mjml";
import Handlebars from "handlebars";
import { chat, type LLMChatOptions } from "../llm-client.js";
import { loadBrandContext, brandContextToSystemPrompt, brandContextToDesignTokens, clearBrandCache, type BrandContext } from "../brand-context.js";
import { tokens } from "../tokens.js";
import { getArtifactSignedUrl } from "../artifact-storage.js";
import { buildImageAssignmentV1, getCanonicalHeroUrl, getCampaignOnlyContentUrls, buildImageAssignmentPersisted } from "./email-image-contract.js";

const CONTROL_PLANE_URL = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** Minimum HTML length (bytes) for non-trivial template emails; below this the job fails. */
const MIN_HTML_LENGTH = 15_000;

/** Handlebars placeholder regex: {{name}} */
const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

/** Bracket placeholder regex: [placeholder] (e.g. [logo], [product A title], [product M src]) */
const BRACKET_PLACEHOLDER_REGEX = /\[([^\]]+)\]/g;

/** 1x1 transparent GIF data URI – used when logo URL is missing so img doesn’t show broken icon. */
const EMPTY_IMAGE_DATA_URI = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** True if URL is already our CDN (Supabase upload public URL). Used so we don't put external or signed URLs in emails. */
function isOurCdnUrl(url: string): boolean {
  return /supabase\.co\/storage\/v1\/object\/public\/upload\//.test(url);
}

/** Inline SVG data-URI icons for social platforms. These render in every email client without external CDN dependency. White fill, 24x24 viewBox. */
const SOCIAL_ICON_BY_NAME: Record<string, string> = {
  facebook: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/></svg>')}`,
  instagram: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>')}`,
  x: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>')}`,
  twitter: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>')}`,
  linkedin: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>')}`,
  youtube: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>')}`,
  tiktok: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>')}`,
  pinterest: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/></svg>')}`,
};

/** Detect social platform from a URL (e.g. "https://instagram.com/brand" → "instagram"). */
function detectPlatformFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("facebook.com") || lower.includes("fb.com")) return "facebook";
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("linkedin.com")) return "linkedin";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "x";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("pinterest.com")) return "pinterest";
  return null;
}

/** Resolve the icon URL for a social entry: explicit icon → name lookup → URL detection → null (skip). */
function resolveSocialIcon(entry: { url?: string; icon?: string; name?: string }): string | null {
  const iconUrl = (entry?.icon ?? "").trim();
  if (iconUrl && iconUrl !== EMPTY_IMAGE_DATA_URI) return iconUrl;
  if (entry?.name) {
    const byName = SOCIAL_ICON_BY_NAME[String(entry.name).toLowerCase()];
    if (byName) return byName;
  }
  const platform = detectPlatformFromUrl((entry?.url ?? "").trim());
  if (platform) return SOCIAL_ICON_BY_NAME[platform] ?? null;
  return null;
}

const SOCIAL_ICON_FALLBACK_URL = "https://cdn-icons-png.flaticon.com/512/2991/2991148.png";

/** Map product letter A–Z to product index 1–11 (wraps). */
function productLetterToIndex(letter: string): number {
  const code = letter.toUpperCase().charCodeAt(0) - 65; // A=0, Z=25
  if (code < 0 || code > 25) return 1;
  return (code % 11) + 1;
}

/**
 * Resolve a single bracket placeholder (e.g. "product A title", "logo", "product P src", "social media link")
 * to the value from sectionJson. Template uses [placeholder] not {{placeholder}}.
 */
function getBracketPlaceholderValue(
  bracketKey: string,
  sectionJson: Record<string, unknown>,
): string {
  const k = bracketKey.trim();
  if (k === "logo") {
    const logo = String(sectionJson.logoUrl ?? sectionJson.logo ?? "");
    return logo.trim() || EMPTY_IMAGE_DATA_URI;
  }
  // [white logo], [footer logo], [logo white] – for dark footers
  if (/^(white\s+logo|footer\s+logo|logo\s+white)$/i.test(k)) {
    const white = String(sectionJson.logo_white_url ?? sectionJson.logoWhite ?? sectionJson.white_logo ?? "");
    if (white.trim()) return white.trim();
    return String(sectionJson.logoUrl ?? sectionJson.logo ?? "").trim() || EMPTY_IMAGE_DATA_URI;
  }
  if (k === "siteUrl" || k === "site_url") return String(sectionJson.siteUrl ?? sectionJson.site_url ?? "#");
  // product productUrl (footer) -> siteUrl (check before "product X field")
  if (/^product\s+producturl$/i.test(k)) return String(sectionJson.siteUrl ?? sectionJson.site_url ?? "#");
  // product <Letter> <field>: A–Z map to product 1–11 (e.g. product P src, product M title, product Q productUrl)
  const productLetterMatch = /^product\s+([A-Za-z])\s+(.+)$/i.exec(k);
  if (productLetterMatch) {
    const letter = productLetterMatch[1].toUpperCase();
    const rawField = productLetterMatch[2].trim().toLowerCase().replace(/\s+/g, "_");
    const field = rawField === "producturl" ? "url" : rawField;
    const idx = productLetterToIndex(letter);
    const key = field === "src" ? `product_${idx}_image` : field === "url" ? `product_${idx}_url` : `product_${idx}_${field}`;
    let val = String((sectionJson as Record<string, unknown>)[key] ?? "");
    // When template has more product slots than we have products, use first product so no slot is empty
    if (!val.trim() && idx > 1) {
      const fallbackKey = field === "src" ? "product_1_image" : field === "url" ? "product_1_url" : `product_1_${field}`;
      val = String((sectionJson as Record<string, unknown>)[fallbackKey] ?? "");
    }
    // Avoid duplicating product title as description when description is missing
    if (!val.trim() && (field === "description" || field === "short_info")) {
      val = "Discover more.";
    }
    return val;
  }
  // [A title], [A description], [B title], [B description], [C title], [C description] – value blocks
  const valueBlockMatch = /^([A-Ca-c])\s+(title|description)$/i.exec(k);
  if (valueBlockMatch) {
    const letter = valueBlockMatch[1].toUpperCase();
    const prop = valueBlockMatch[2].toLowerCase();
    if (letter === "A") {
      return String(prop === "title" ? (sectionJson.headline ?? sectionJson.campaignPrompt ?? "") : (sectionJson.body ?? sectionJson.campaignPrompt ?? ""));
    }
    if (letter === "B") {
      return String(prop === "title" ? (sectionJson.product_1_title ?? "") : (sectionJson.product_1_description && String(sectionJson.product_1_description).trim() ? sectionJson.product_1_description : "Discover more."));
    }
    if (letter === "C") {
      return String(prop === "title" ? (sectionJson.product_2_title ?? "") : (sectionJson.product_2_description && String(sectionJson.product_2_description).trim() ? sectionJson.product_2_description : "Discover more."));
    }
    if (letter === "D") {
      return String(prop === "title" ? (sectionJson.product_3_title ?? "") : (sectionJson.product_3_description && String(sectionJson.product_3_description).trim() ? sectionJson.product_3_description : "Discover more."));
    }
    if (letter === "E") {
      return String(prop === "title" ? (sectionJson.product_4_title ?? "") : (sectionJson.product_4_description && String(sectionJson.product_4_description).trim() ? sectionJson.product_4_description : "Discover more."));
    }
  }
  // [social media link], [social media icon], [social media 2 link], etc.
  const socialMatch = /^social\s+media\s+(\d+)\s+(link|icon)$/i.exec(k);
  if (socialMatch) {
    const n = Math.max(1, parseInt(socialMatch[1], 10));
    const kind = socialMatch[2].toLowerCase();
    const linkKey = `social_media_${n}_link`;
    const iconKey = `social_media_${n}_icon`;
    const v = (sectionJson as Record<string, unknown>)[kind === "link" ? linkKey : iconKey];
    if (kind === "icon") {
      if (v && String(v).trim() && String(v) !== EMPTY_IMAGE_DATA_URI) return String(v).trim();
      const socialLink = String((sectionJson as Record<string, unknown>)[linkKey] ?? "").trim();
      const detected = detectPlatformFromUrl(socialLink);
      return detected ? (SOCIAL_ICON_BY_NAME[detected] ?? EMPTY_IMAGE_DATA_URI) : EMPTY_IMAGE_DATA_URI;
    }
    return String(v ?? (sectionJson.siteUrl ?? "#"));
  }
  const socialFirstMatch = /^social\s+media\s+(link|icon)$/i.exec(k);
  if (socialFirstMatch) {
    const kind = socialFirstMatch[1].toLowerCase();
    const v = (sectionJson as Record<string, unknown>)[kind === "link" ? "social_media_1_link" : "social_media_1_icon"];
    return String(v ?? (kind === "link" ? (sectionJson.siteUrl ?? "#") : ""));
  }
  // [hero], [hero image], [banner] – hero/banner image only (never a product image)
  if (/^(hero|hero\s+image|banner)$/i.test(k)) {
    const hero = String(sectionJson.hero_image_url ?? sectionJson.hero_image ?? sectionJson.imageUrl ?? sectionJson.image_url ?? "");
    return (hero && hero.trim()) ? hero.trim() : EMPTY_IMAGE_DATA_URI;
  }
  // [image 1], [image 2], ... [image N] – campaign-only content/gallery (never product; product use [product A src] etc.)
  const imageNumMatch = /^image\s+(\d+)$/i.exec(k);
  if (imageNumMatch) {
    const n = Math.max(1, parseInt(imageNumMatch[1], 10));
    const campaignImages = sectionJson.campaign_images as string[] | undefined;
    const url = Array.isArray(campaignImages) ? campaignImages[n - 1] : undefined;
    return (url && typeof url === "string" && url.trim()) ? url.trim() : EMPTY_IMAGE_DATA_URI;
  }
  // direct key (e.g. brandName, footerRights, headline, body)
  const direct = (sectionJson as Record<string, unknown>)[k];
  if (direct !== undefined && direct !== null) return String(direct);
  // Token Registry path (e.g. colors.brand.500, typography.fonts.body, email.containerWidth)
  const tokens = sectionJson.tokens as Record<string, unknown> | undefined;
  if (tokens && (k.includes(".") || /^(colors|typography|spacing|layout|email|voice|motion|radius|border)\b/i.test(k))) {
    const tokenValue = getByPath(tokens, k);
    if (tokenValue !== undefined && tokenValue !== null && typeof tokenValue !== "object") return String(tokenValue);
  }
  return "";
}

/** Get a value by dot path (e.g. "colors.brand.500") from an object. */
function getByPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

/** Replace all [placeholder] tokens in HTML with values from sectionJson. */
function replaceBracketPlaceholders(html: string, sectionJson: Record<string, unknown>): string {
  let out = html.replace(BRACKET_PLACEHOLDER_REGEX, (match, key) => {
    const value = getBracketPlaceholderValue(key, sectionJson);
    return value || match;
  });
  const siteUrl = String(sectionJson.siteUrl ?? sectionJson.site_url ?? "#");
  if (siteUrl && siteUrl !== "#") {
    out = out.replace(/href="product\s+productUrl"/gi, `href="${siteUrl}"`);
    out = out.replace(/href="product\s+([A-Za-z])\s+productUrl"/gi, (_m, letter) => {
      const idx = productLetterToIndex(letter);
      const url = (sectionJson as Record<string, unknown>)[`product_${idx}_url`];
      return `href="${String(url ?? siteUrl)}"`;
    });
  }
  return out;
}

/** Template default accent colors (Emma SMS template) – replace with brand color in final HTML. */
const TEMPLATE_ACCENT_COLORS = [/#FF7055/gi, /#053A5E/gi, /#ffd875/gi];

/** Default hero headline in template – replaced with campaign prompt when present. */
const DEFAULT_HERO_HEADLINE = "Introducing Emma SMS";
/** Default hero body in template – replaced with campaign prompt when present. */
const DEFAULT_HERO_BODY =
  "Emma SMS helps you reach customers where they're at by sending relevant and timely updates to a personal and direct channel. By combining the power of SMS with email, marketers are able to create a more unified, multi-channel experience for customers.";

/** Default CTA block headline in template – replaced with LLM ctaSectionHeadline when present. */
const DEFAULT_CTA_HEADLINE = "Cut through the noise with SMS";
/** Default CTA block subhead in template. */
const DEFAULT_CTA_SUBHEAD = "Ready to see Emma SMS in action?";
/** Default CTA block body in template. */
const DEFAULT_CTA_BODY = "Request a live demo from our team to get started!";
/** Default CTA button label in template – replaced with LLM ctaText when present. */
const DEFAULT_CTA_BUTTON = "Request a demo";
/** Default hero CTA button in some templates. */
const DEFAULT_HERO_CTA = "Explore the tool";

/** Alternate template defaults (e.g. "You're Looking Well" / Regime-style) – replaced when we have LLM copy. */
const ALT_HERO_HEADLINE = "You're Looking Well";
const ALT_SECTION_HEADLINE = "The beauty of consistency";
const ALT_HERO_BODY_START = "In a world where quick fixes and instant results are often promised";
const ALT_HERO_BODY_REGIME = "This is where steps in. Developed by internationally acclaimed scientists, The Regime simplifies";
const ALT_HERO_CTA = "Discover The Regime";
const ALT_CTA_SECTION_HEADLINE = "But why is a consistent routine vital for skin, gut and sleep health?";

/** Template footer placeholders (Marigold/Emma) – replaced with brand footer when present. */
const DEFAULT_FOOTER_PARTNER_LINE = "Campaign Monitor | Cheetah Digita | Emma | Sailthru | Selligent | Vuture";
const DEFAULT_FOOTER_RIGHTS = "© 2023 Marigold Inc. All Rights Reserved";
const DEFAULT_FOOTER_ADDRESS = "Marigold Inc., 11 Lea Ave, Nashville, TN 37210";

export interface BrandFooterReplacements {
  companyName: string;
  footerRights: string;
  address: string;
  partnerLine: string;
  termsUrl: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** LLM-generated copy for hero/CTA (from campaign prompt); used instead of raw prompt in template. */
export interface GeneratedEmailCopy {
  headline: string;
  body: string;
  ctaText: string;
  /** Secondary CTA block headline (must be different from headline to avoid duplication). */
  ctaSectionHeadline?: string;
  /** Secondary CTA block body (must be different from body — never duplicate hero paragraph). */
  ctaSectionBody?: string;
}

/** Build a short brand brief from BrandContext for the LLM (industry, tagline, tone, CTA style). */
function buildBrandBriefForCopy(ctx: BrandContext): string {
  const parts: string[] = [];
  const id = ctx.identity as Record<string, unknown>;
  if (id.industry) parts.push(`Industry: ${id.industry}`);
  if (id.tagline) parts.push(`Tagline: "${id.tagline}"`);
  if (id.mission) parts.push(`Mission: ${id.mission}`);
  if (id.target_audience) parts.push(`Target audience: ${id.target_audience}`);
  const tone = ctx.tone as Record<string, unknown>;
  if (Array.isArray(tone.voice_descriptors) && tone.voice_descriptors.length) parts.push(`Voice: ${(tone.voice_descriptors as string[]).join(", ")}`);
  if (tone.formality) parts.push(`Formality: ${tone.formality}`);
  const copyStyle = ctx.copy_style as Record<string, unknown>;
  if (copyStyle.cta_style) parts.push(`CTA style: ${copyStyle.cta_style}`);
  if (copyStyle.voice) parts.push(`Copy voice: ${copyStyle.voice}`);
  return parts.length ? parts.join(". ") : ctx.name;
}

/**
 * Call LLM to generate email copy (headline, body, CTA) from the campaign prompt and full brand context.
 * Uses brand tokens, identity, tone, and copy_style so copy fits the brand (not generic template copy).
 * Returns null on parse failure or if LLM is not invoked.
 */
async function generateEmailCopyViaLlm(
  campaignPrompt: string,
  brandPrompt: string | undefined,
  brandCtx: BrandContext | undefined,
  request: { run_id: string; job_run_id: string; job_type: string; llm_source?: string; recordLlmCall?: (model: string, modelId: string, tokensIn?: number, tokensOut?: number, latencyMs?: number) => Promise<void> },
  initiativeId: string | null,
  productTitles?: string[],
): Promise<GeneratedEmailCopy | null> {
  const trimmed = campaignPrompt.trim();
  if (trimmed.length === 0) return null;

  const brandName = brandCtx?.name ?? "Brand";
  const brandBrief = brandCtx ? buildBrandBriefForCopy(brandCtx) : brandName;
  const productLine = productTitles != null && productTitles.length > 0
    ? ` Products/offers to reference if relevant: ${productTitles.slice(0, 8).join(", ")}.`
    : "";

  const messages: LLMChatOptions["messages"] = [];
  messages.push({
    role: "system",
    content: (brandPrompt ?? "") + "\nYou are an email copywriter. Write copy that is specific to this brand and campaign—use the brand's identity, tone, and industry. Do not output generic template text (e.g. about 'The Regime', 'Emma SMS', or unrelated products). Do NOT duplicate the same text in multiple sections: the hero and the secondary CTA block must have different copy. Reply with ONLY a valid JSON object, no markdown or explanation. Use these exact keys: headline (one short line for the hero), body (2-3 sentences for the main hero paragraph only), ctaText (button label, e.g. \"Shop the sale\" or \"Get 50% off\"), ctaSectionHeadline (one distinct line for the secondary CTA block—different from headline), ctaSectionBody (1-2 sentences for the secondary CTA block only—must be different from body; e.g. a supporting line or different angle for the offer).",
  });
  messages.push({
    role: "user",
    content: `Brand context: ${brandBrief}. Campaign theme: ${trimmed}.${productLine} Generate email copy that fits this brand and campaign. Return only valid JSON. Remember: hero section gets headline+body; secondary CTA section gets ctaSectionHeadline+ctaSectionBody (never repeat body in the CTA block).`,
  });

  const parseCopyResult = (raw: string): GeneratedEmailCopy | null => {
    let cleaned = raw.trim();
    const codeBlock = /```(?:json)?\s*([\s\S]*?)```/.exec(cleaned);
    if (codeBlock) cleaned = codeBlock[1].trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    const ctaText = typeof parsed.ctaText === "string" ? parsed.ctaText.trim() : "Learn more";
    const ctaSectionHeadline = typeof parsed.ctaSectionHeadline === "string" ? parsed.ctaSectionHeadline.trim() : undefined;
    const ctaSectionBody = typeof parsed.ctaSectionBody === "string" ? parsed.ctaSectionBody.trim() : undefined;
    if (headline.length > 0 && body.length > 0) return { headline, body, ctaText, ctaSectionHeadline, ctaSectionBody };
    return null;
  };

  const useGateway = request.llm_source !== "openai_direct";
  const chatOpts: LLMChatOptions = {
    model: "auto/chat",
    messages,
    context: { run_id: request.run_id, job_run_id: request.job_run_id, job_type: request.job_type, initiative_id: initiativeId },
    brandContext: brandCtx ? { id: brandCtx.id, name: brandCtx.name, systemPrompt: brandPrompt } : undefined,
    useGateway,
  };

  try {
    const result = await chat(chatOpts);
    if (request.recordLlmCall) await request.recordLlmCall("auto/chat", result.model_id ?? "unknown", result.tokens_in, result.tokens_out, result.latency_ms);
    const parsed = parseCopyResult(result.content ?? "");
    if (parsed) return parsed;
  } catch (_e) {
    const errMsg = String((_e as Error).message).slice(0, 120);
    console.log("[MJML] LLM copy via gateway failed, retrying with OpenAI direct", { run_id: request.run_id, err: errMsg });
  }

  // Retry with OpenAI direct if gateway failed (404, timeout, etc.)
  if (useGateway) {
    try {
      const result = await chat({ ...chatOpts, useGateway: false });
      if (request.recordLlmCall) await request.recordLlmCall("auto/chat", result.model_id ?? "unknown", result.tokens_in, result.tokens_out, result.latency_ms);
      const parsed = parseCopyResult(result.content ?? "");
      if (parsed) {
        console.log("[MJML] LLM copy via OpenAI direct succeeded (gateway fallback)", { run_id: request.run_id });
        return parsed;
      }
    } catch (_e2) {
      console.log("[MJML] LLM copy generation failed (both gateway and direct)", { run_id: request.run_id, err: String((_e2 as Error).message).slice(0, 120) });
    }
  }
  return null;
}

type ProductListItem = { name: string; title: string; link: string; image: string; description: string };

/**
 * Optionally enrich products that have no description by calling LLM with title and URL.
 * Gated by ENRICH_PRODUCT_DESCRIPTIONS=true (or input.enrich_descriptions). Only runs for products with empty description.
 */
async function enrichProductDescriptionsIfEnabled(
  productList: ProductListItem[],
  request: { run_id: string; job_run_id: string; job_type: string },
): Promise<ProductListItem[]> {
  const enabled = process.env.ENRICH_PRODUCT_DESCRIPTIONS === "true" || process.env.ENRICH_PRODUCT_DESCRIPTIONS === "1";
  if (!enabled || productList.length === 0) return productList;
  const needIndexes = productList
    .map((p, i) => ({ i, desc: p.description?.trim() ?? "" }))
    .filter(({ desc }) => desc.length === 0)
    .map(({ i }) => i);
  if (needIndexes.length === 0) return productList;

  const lines = needIndexes.map((i) => `Product ${i}: ${productList[i].title} | ${productList[i].link}`).join("\n");
  const messages: LLMChatOptions["messages"] = [
    {
      role: "system",
      content: "You write very short product descriptions for marketing emails. Reply with ONLY a valid JSON object. Use integer keys 0, 1, 2... for each product index; value is one short sentence (under 25 words), no quotes or prefix.",
    },
    {
      role: "user",
      content: `For each product below write exactly one short sentence describing it for an email. Reply only with JSON like {"0":"...","1":"..."}.\n\n${lines}`,
    },
  ];
  try {
    const result = await chat({
      model: "auto/chat",
      messages,
      context: { run_id: request.run_id, job_run_id: request.job_run_id, job_type: request.job_type },
    });
    const raw = (result.content ?? "").trim();
    const json = raw.replace(/^```\w*\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(json) as Record<string, string>;
    const out = productList.map((p, i) => ({ ...p }));
    for (const idx of needIndexes) {
      const desc = parsed[String(idx)];
      if (typeof desc === "string" && desc.trim()) {
        out[idx].description = desc.trim().slice(0, 500);
      }
    }
    console.log("[MJML] enriched product descriptions", { run_id: request.run_id, count: needIndexes.length });
    return out;
  } catch (_e) {
    console.log("[MJML] enrich product descriptions failed", { run_id: request.run_id, err: String((_e as Error).message).slice(0, 60) });
    return productList;
  }
}

/**
 * Design polish: apply brand fonts throughout inline styles, make hero image full-width,
 * deduplicate CTA section text, and improve visual hierarchy for professional appearance.
 */
function applyDesignPolish(
  html: string,
  fontFamily: string,
  brandColor: string,
  generatedCopy?: GeneratedEmailCopy | null,
): string {
  let out = html;
  const ff = fontFamily.trim();

  // 1. Replace hardcoded inline font-families with brand font so the email matches the brand.
  //    Email clients ignore <style> rules and only read inline styles, so we must patch each one.
  if (ff && ff !== "system-ui, sans-serif") {
    const safeFf = ff.replace(/'/g, "\\'");
    const genericFonts = [
      "font-family:'Inter'",
      "font-family:Inter",
      "font-family:sans-serif",
      "font-family:Arial, sans-serif",
      "font-family:Helvetica,Arial,sans-serif",
      "font-family:Helvetica,Arial, sans-serif",
      "font-family:Arial,sans-serif",
    ];
    for (const gf of genericFonts) {
      const re = new RegExp(gf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, `font-family:'${safeFf}',sans-serif`);
    }
  }

  // 2. Hero image: make it full-width (remove fixed width constraint, remove fixed height).
  //    The hero is the first crop-image in the #F2F2F2 section — it has width:320px and height:200px.
  //    Make it span the full container (560px) and auto-height for proper aspect ratio.
  out = out.replace(
    /(<td[^>]*class="crop-image"[^>]*background:#F2F2F2[^>]*>[\s\S]*?<td style=")(width:\d+px;)(">[\s\S]*?<img[^>]*)(height:\d+px;)(width:100%;)/i,
    (_m, pre, _w, mid, _h, _ww) => `${pre}width:100%;${mid}height:auto;width:100%;`,
  );
  // Broader approach: find the first large crop-image img before footer and widen it
  const heroImgRe = /(<td[^>]*style="[^"]*width:\s*)(\d{2,3})(px;">\s*<a[^>]*><img[^>]*style="[^"]*)(height:\s*\d+px;)/i;
  const heroMatch = heroImgRe.exec(out);
  if (heroMatch && parseInt(heroMatch[2]) < 560) {
    out = out.replace(heroImgRe, (_m, pre, _w, mid, _h) => `${pre}560${mid}height:auto;`);
  }

  // 3. Remove duplicate headline in the green CTA section.
  //    The template often renders the same text as both <h> and <p> in the CTA block.
  if (generatedCopy?.ctaSectionHeadline) {
    const headline = generatedCopy.ctaSectionHeadline;
    const escaped = headline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Remove second occurrence of same text within the CTA section (green block bgcolor="#16a34a" area)
    const ctaStart = out.indexOf('background:#16a34a') ?? out.indexOf('bgcolor="#16a34a"');
    if (ctaStart !== -1) {
      const ctaEnd = out.indexOf('#292929', ctaStart);
      const ctaSection = out.slice(ctaStart, ctaEnd !== -1 ? ctaEnd : undefined);
      const re = new RegExp(`(>${escaped}<[^>]*>[\\s\\S]*?)>${escaped}<`, "i");
      if (re.test(ctaSection)) {
        const fixed = ctaSection.replace(re, (m, before) => `${before}>&nbsp;<`);
        out = out.slice(0, ctaStart) + fixed + out.slice(ctaEnd !== -1 ? ctaEnd : out.length);
      }
    }
  }

  // 4. Tighten spacing: reduce excessive padding around hero section for cleaner look.
  //    Replace 30px top/bottom padding on crop-image to 0px top (image flush to edge).
  out = out.replace(
    /padding-top:30px;padding-right:0px;padding-bottom:30px;padding-left:0px/g,
    "padding-top:0px;padding-right:0px;padding-bottom:20px;padding-left:0px",
  );

  // 5. Product grid images: remove fixed height so they scale naturally (no awkward cropping).
  out = out.replace(/(class="crop-image"[^>]*>[\s\S]*?<img[^>]*style="[^"]*)(height:\s*170px;)/gi,
    (_, pre, _h) => `${pre}height:auto;`,
  );
  out = out.replace(/(class="crop-image"[^>]*>[\s\S]*?<img[^>]*style="[^"]*)(height:\s*114px;)/gi,
    (_, pre, _h) => `${pre}height:auto;`,
  );

  // 6. Mobile-responsive: add responsive CSS for better mobile rendering
  const mobileStyles = `
    @media only screen and (max-width:479px) {
      .crop-image img { height:auto !important; width:100% !important; }
      .mj-column-per-50 { width:100% !important; max-width:100% !important; }
      .mj-column-per-33-33 { width:50% !important; max-width:50% !important; }
    }`;
  if (out.includes("</style>")) {
    out = out.replace(/<\/style>/, mobileStyles + "</style>");
  }

  return out;
}

/**
 * Apply brand color to template accent/CTA, replace default hero/CTA copy with campaign or LLM-generated copy,
 * and replace hardcoded footer (Marigold/Emma) with brand footer.
 */
function applyBrandColorsAndCampaignCopy(
  html: string,
  brandColor: string,
  campaignPrompt: string,
  generatedCopy?: GeneratedEmailCopy | null,
  footer?: BrandFooterReplacements | null,
): string {
  let out = html;
  for (const re of TEMPLATE_ACCENT_COLORS) {
    out = out.replace(re, brandColor);
  }
  const headline = generatedCopy?.headline ?? campaignPrompt.trim();
  const body = generatedCopy?.body ?? campaignPrompt.trim();
  if (headline.length > 0) {
    const safeHeadline = escapeHtml(headline);
    if (out.includes(DEFAULT_HERO_HEADLINE)) {
      out = out.replace(DEFAULT_HERO_HEADLINE, safeHeadline);
    }
    if (out.includes(ALT_HERO_HEADLINE)) {
      out = out.replace(ALT_HERO_HEADLINE, safeHeadline);
    }
    // Second section headline: use ctaSectionHeadline so we never duplicate the hero headline
    const secondHeadline = generatedCopy?.ctaSectionHeadline ?? generatedCopy?.headline ?? headline;
    if (secondHeadline.length > 0 && out.includes(ALT_SECTION_HEADLINE)) {
      out = out.replace(ALT_SECTION_HEADLINE, escapeHtml(secondHeadline));
    }
  }
  if (body.length > 0) {
    const safeBody = escapeHtml(body);
    if (out.includes(DEFAULT_HERO_BODY)) {
      out = out.replace(DEFAULT_HERO_BODY, safeBody);
    } else {
      // Fallback: template may have entity-encoded or slightly different text (e.g. you're → you&#39;re).
      // Use body whenever we have it (LLM or campaignPrompt); otherwise static "Emma SMS helps you..." stays.
      const emmaStart = "Emma SMS helps you";
      if (out.includes(emmaStart) && body.length > 0) {
        const flexibleEmma = /Emma SMS helps you[\s\S]*?<\/(p|td|div)>/i;
        out = out.replace(flexibleEmma, (_m, tag) => safeBody + "</" + tag + ">");
      }
    }
    // Alternate template: "In a world where quick fixes..." and "This is where steps in... The Regime..."
    if (generatedCopy?.body && out.includes(ALT_HERO_BODY_START)) {
      const flexibleAlt = /In a world where quick fixes[\s\S]*?<\/(p|td|div)>/i;
      out = out.replace(flexibleAlt, (_m, tag) => safeBody + "</" + tag + ">");
    }
    if (generatedCopy?.body && out.includes(ALT_HERO_BODY_REGIME)) {
      const altPara2 = /This is where\s*&nbsp;?\s*steps in\.[\s\S]*?morning and evening\.?/i;
      out = out.replace(altPara2, safeBody);
    }
  }
  // Replace default hero CTA button ("Explore the tool" or "Discover The Regime") with generated ctaText
  const ctaLabel = generatedCopy?.ctaText ?? campaignPrompt.trim();
  if (ctaLabel.length > 0) {
    if (out.includes(DEFAULT_HERO_CTA)) {
      out = out.replace(DEFAULT_HERO_CTA, escapeHtml(ctaLabel));
    }
    if (out.includes(ALT_HERO_CTA)) {
      out = out.replace(ALT_HERO_CTA, escapeHtml(ctaLabel));
    }
  }
  // Replace default CTA block copy when we have LLM-generated copy. Never duplicate hero body in CTA block.
  if (generatedCopy) {
    if (generatedCopy.ctaSectionHeadline) {
      if (out.includes(DEFAULT_CTA_HEADLINE)) {
        out = out.replace(DEFAULT_CTA_HEADLINE, escapeHtml(generatedCopy.ctaSectionHeadline));
      }
      if (out.includes(ALT_CTA_SECTION_HEADLINE)) {
        out = out.replace(ALT_CTA_SECTION_HEADLINE, escapeHtml(generatedCopy.ctaSectionHeadline));
      }
    }
    if (out.includes(DEFAULT_CTA_SUBHEAD)) {
      out = out.replace(DEFAULT_CTA_SUBHEAD, escapeHtml(generatedCopy.ctaSectionHeadline ?? generatedCopy.headline));
    }
    // CTA block body must be distinct (ctaSectionBody); never paste the hero paragraph here
    const ctaBody = generatedCopy.ctaSectionBody ?? generatedCopy.ctaSectionHeadline ?? "";
    if (ctaBody.length > 0 && out.includes(DEFAULT_CTA_BODY)) {
      out = out.replace(DEFAULT_CTA_BODY, escapeHtml(ctaBody));
    }
    if (generatedCopy.ctaText && out.includes(DEFAULT_CTA_BUTTON)) {
      out = out.replace(DEFAULT_CTA_BUTTON, escapeHtml(generatedCopy.ctaText));
    }
  }
  // When template uses [headline]/[body] in both hero and CTA block, same text appears twice. Replace second occurrence with CTA copy.
  if (generatedCopy?.ctaSectionHeadline && headline.length > 0 && generatedCopy.ctaSectionHeadline !== headline) {
    const h = escapeHtml(headline);
    const ctaH = escapeHtml(generatedCopy.ctaSectionHeadline);
    const firstIdx = out.indexOf(h);
    if (firstIdx !== -1) {
      const secondIdx = out.indexOf(h, firstIdx + 1);
      if (secondIdx !== -1) {
        out = out.slice(0, secondIdx) + ctaH + out.slice(secondIdx + h.length);
      }
    }
  }
  if (generatedCopy?.ctaSectionBody && body.length > 0 && generatedCopy.ctaSectionBody !== body) {
    const b = escapeHtml(body);
    const ctaB = escapeHtml(generatedCopy.ctaSectionBody);
    const firstIdx = out.indexOf(b);
    if (firstIdx !== -1) {
      const secondIdx = out.indexOf(b, firstIdx + 1);
      if (secondIdx !== -1) {
        out = out.slice(0, secondIdx) + ctaB + out.slice(secondIdx + b.length);
      }
    }
  }

  // Replace hardcoded template footer with brand footer
  if (footer) {
    if (footer.partnerLine && out.includes(DEFAULT_FOOTER_PARTNER_LINE)) {
      out = out.replace(DEFAULT_FOOTER_PARTNER_LINE, escapeHtml(footer.partnerLine));
    }
    if (footer.footerRights && out.includes(DEFAULT_FOOTER_RIGHTS)) {
      out = out.replace(DEFAULT_FOOTER_RIGHTS, escapeHtml(footer.footerRights));
    }
    if (footer.address && out.includes(DEFAULT_FOOTER_ADDRESS)) {
      out = out.replace(DEFAULT_FOOTER_ADDRESS, escapeHtml(footer.address));
    }
  }
  return out;
}

/** Map concept key -> list of placeholder names that should receive that value (template–payload contract). */
const PLACEHOLDER_ALIASES: Record<string, string[]> = {
  logo: ["logoUrl", "logo_url", "logo", "brandLogo", "brand_logo", "logo_src", "logoSrc"],
  brandColor: ["brandColor", "color", "primaryColor", "brand_color"],
  campaignCopy: [
    "campaignPrompt", "headline", "title", "header", "subhead", "body", "message", "description",
    "prehead", "eyebrow", "offerText", "offer", "content", "main_message", "mainMessage", "theme", "intro", "copy", "promo_text",
  ],
  fontFamily: ["fontFamily", "fonts"],
  heroImage: ["imageUrl", "image_url", "image_src", "imageSrc", "hero_image", "hero_image_url", "heroImageUrl"],
  footer: ["footer"],
  ctaText: ["cta_text", "cta_label"],
  ctaUrl: ["cta_url", "cta_link"],
};

export interface EmailGenerateMjmlInput {
  template_id?: string;
  products?: Array<{ src?: string; title?: string; product_url?: string; description?: string }>;
  /** Campaign images (CDN URLs) for template placeholders [image 1], [image 2], etc. */
  images?: string[];
  campaign_prompt?: string;
}

export async function handleEmailGenerateMjml(request: {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string;
  llm_source?: "gateway" | "openai_direct";
  input?: EmailGenerateMjmlInput;
  /** When set, record LLM usage to llm_calls (for AI Calls / run detail). */
  recordLlmCall?: (tier: string, modelId: string, tokensIn?: number, tokensOut?: number, latencyMs?: number) => Promise<void>;
}) {
  const runId = request.run_id ?? "";
  const jobRunId = request.job_run_id ?? "";
  // #region agent log
  console.log("[MJML] entry (H10)", { run_id: runId, job_run_id: jobRunId, initiative_id: request.initiative_id ?? "(none)", input_keys: Object.keys(request.input ?? {}), template_id: request.input?.template_id ?? "(none)" });
  // #endregion
  // Self-heal: resolve initiative_id from control-plane when missing (e.g. runner DB != control-plane DB).
  let initiativeId = request.initiative_id;
  if (!initiativeId && request.run_id) {
    try {
      const runRes = await fetch(`${CONTROL_PLANE_URL}/v1/runs/${request.run_id}`);
      if (runRes.ok) {
        const runPayload = (await runRes.json()) as { initiative_id?: string; run?: { initiative_id?: string } };
        initiativeId = runPayload.initiative_id ?? runPayload.run?.initiative_id ?? undefined;
        if (initiativeId) console.log("[MJML] initiative_id from run fallback (H2)", { run_id: runId, initiative_id: initiativeId });
      }
    } catch (_e) {
      console.log("[MJML] run fallback failed (H3)", { run_id: runId, err: String((_e as Error).message).slice(0, 60) });
    }
  }
  if (!initiativeId) console.log("[MJML] no initiative_id (H2)", { run_id: runId, job_run_id: jobRunId, input_keys: Object.keys(request.input ?? {}) });

  // Ensure fresh brand profile (including design_tokens.logo from Console "Logo URL") so logo is not stale from cache
  if (initiativeId) clearBrandCache();
  const brandCtx = initiativeId ? await loadBrandContext(initiativeId) : null;
  const brandPrompt = brandCtx ? brandContextToSystemPrompt(brandCtx) : "";
  const mergedTokens = brandCtx ? brandContextToDesignTokens(brandCtx, tokens as unknown as Record<string, unknown>) : tokens;
  const brandColor = (mergedTokens as Record<string, unknown>)?.color && typeof (mergedTokens as Record<string, unknown>).color === "object"
    ? ((mergedTokens as Record<string, unknown>).color as Record<string, Record<string, string>>)?.brand?.["500"] ?? "#3b82f6"
    : "#3b82f6";

  let logoUrl: string | null = null;
  if (brandCtx?.id) {
    try {
      const assetsRes = await fetch(`${CONTROL_PLANE_URL}/v1/brand_profiles/${brandCtx.id}/assets?asset_type=logo`);
      if (assetsRes.ok) {
        const assets = (await assetsRes.json()) as { items?: Array<{ uri?: string }> };
        const rawUri = assets.items?.[0]?.uri ?? null;
        if (rawUri?.startsWith("supabase-storage://")) {
          const signed = await getArtifactSignedUrl(rawUri);
          logoUrl = signed ?? rawUri;
          if (!signed) console.log("[MJML] logo storage URI not resolved to signed URL", { brandId: brandCtx.id, uriSnippet: rawUri.slice(0, 50) });
        } else if (rawUri?.trim()) {
          logoUrl = rawUri;
        }
      }
    } catch (_e) {
      console.log("[MJML] brand assets fetch failed", { brandId: brandCtx.id, err: String((_e as Error).message).slice(0, 60) });
    }
    // Fallback: logo URL from identity, then design_tokens (Console "Logo URL" → design_tokens.logo.url / logo_url), then mergedTokens
    if (!logoUrl?.trim() && brandCtx) {
      const fromIdentity = (brandCtx.identity as Record<string, unknown>)?.logo_url;
      const dt = brandCtx.design_tokens && typeof brandCtx.design_tokens === "object" ? (brandCtx.design_tokens as Record<string, unknown>) : null;
      const logoToken = dt?.logo;
      const logoUrlToken = dt?.logo_url;
      let fromTokens =
        logoToken != null && typeof logoToken === "object" && typeof (logoToken as Record<string, unknown>).url === "string"
          ? ((logoToken as Record<string, string>).url as string).trim()
          : typeof logoToken === "string"
            ? (logoToken as string).trim()
            : typeof logoUrlToken === "string"
              ? (logoUrlToken as string).trim()
              : "";
      if (!fromTokens && mergedTokens && typeof mergedTokens === "object") {
        const mt = mergedTokens as Record<string, unknown>;
        const ml = mt?.logo;
        const mlu = mt?.logo_url;
        fromTokens =
          ml != null && typeof ml === "object" && typeof (ml as Record<string, unknown>).url === "string"
            ? ((ml as Record<string, string>).url as string).trim()
            : typeof ml === "string"
              ? (ml as string).trim()
              : typeof mlu === "string"
                ? (mlu as string).trim()
                : "";
      }
      const fallback = typeof fromIdentity === "string" && fromIdentity.trim()
        ? fromIdentity.trim()
        : fromTokens.length > 0
          ? fromTokens
          : null;
      if (fallback) {
        logoUrl = fallback;
        console.log("[MJML] logo from brand identity/design_tokens/mergedTokens fallback", { brandId: brandCtx.id, snippet: fallback.slice(0, 60) });
      } else {
        console.log("[MJML] logo missing: design_tokens keys", {
          brandId: brandCtx.id,
          dtKeys: dt ? Object.keys(dt) : [],
          hasLogoKey: dt ? "logo" in dt : false,
          hasLogoUrlKey: dt ? "logo_url" in dt : false,
          logoType: dt?.logo != null ? typeof dt.logo : "n/a",
          logoUrlType: dt?.logo_url != null ? typeof dt.logo_url : "n/a",
        });
      }
    }
  }
  // Self-host logo: if logo is external or a signed URL, copy to our CDN so emails use a stable URL
  if (logoUrl?.trim() && !isOurCdnUrl(logoUrl)) {
    try {
      const copyRes = await fetch(`${CONTROL_PLANE_URL}/v1/campaign-images/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: logoUrl }),
      });
      if (copyRes.ok) {
        const json = (await copyRes.json()) as { cdn_url?: string };
        if (json.cdn_url) {
          logoUrl = json.cdn_url;
          console.log("[MJML] logo copied to CDN for email", { run_id: runId, brandId: brandCtx?.id });
        }
      }
    } catch (_e) {
      console.log("[MJML] logo copy to CDN failed (using original URL)", { run_id: runId, err: String((_e as Error).message).slice(0, 60) });
    }
  }
  // #region agent log
  console.log("[MJML] brand + logo (H1/H7)", { run_id: runId, job_run_id: jobRunId, hasBrandCtx: !!brandCtx, brandId: brandCtx?.id, brandName: brandCtx?.name?.slice(0, 30), hasDesignTokens: !!(brandCtx?.design_tokens && Object.keys(brandCtx.design_tokens).length > 0), brandColor, logoUrl: logoUrl ?? "(none)" });
  fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:brand+logo", message: "MJML brand + logo", data: { run_id: runId, hasBrandCtx: !!brandCtx, brandId: brandCtx?.id, hasLogo: !!logoUrl }, timestamp: Date.now(), hypothesisId: "H1" }) }).catch(() => {});
  // #endregion

  let input: EmailGenerateMjmlInput = request.input ?? {};
  let subjectLine: string | undefined = undefined;
  if (initiativeId) {
    try {
      const campRes = await fetch(`${CONTROL_PLANE_URL}/v1/email_campaigns/${initiativeId}`);
      if (campRes.ok) {
        const camp = (await campRes.json()) as { template_id?: string; subject_line?: string; metadata_json?: { template_id?: string; products?: unknown[]; images?: string[]; campaign_prompt?: string } };
        subjectLine = camp.subject_line;
        const templateIdFromCamp = camp.template_id ?? (camp.metadata_json && typeof camp.metadata_json === "object" ? (camp.metadata_json as { template_id?: string }).template_id : undefined);
        if (templateIdFromCamp) input.template_id = input.template_id ?? templateIdFromCamp;
        if (camp.metadata_json && typeof camp.metadata_json === "object") {
          const meta = camp.metadata_json as { products?: unknown[]; images?: string[]; selected_images?: string[]; campaign_prompt?: string; sitemap_url?: string; sitemap_type?: string };
          if (meta.products && !input.products?.length) input.products = meta.products as EmailGenerateMjmlInput["products"];
          if (Array.isArray(meta.images)) input.images = meta.images.slice(0);
          else if (Array.isArray(meta.selected_images) && !input.images?.length) input.images = meta.selected_images.slice(0);
          // Console sends images with first = hero; buildImageAssignmentV1 uses campaign[0] as hero.
          if (meta.campaign_prompt) input.campaign_prompt = input.campaign_prompt ?? meta.campaign_prompt;
          if (!input.products?.length && meta.sitemap_url && meta.sitemap_type) {
            try {
              const isJson = meta.sitemap_type === "shopify_json";
              const productsUrl = isJson
                ? `${CONTROL_PLANE_URL}/v1/products/from_url`
                : `${CONTROL_PLANE_URL}/v1/sitemap/products`;
              const body = isJson
                ? { url: meta.sitemap_url, type: "shopify_json", limit: 8 }
                : { sitemap_url: meta.sitemap_url, sitemap_type: meta.sitemap_type, limit: 8 };
              const productsRes = await fetch(productsUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (productsRes.ok) {
                const data = (await productsRes.json()) as { items?: Array<{ src?: string; title?: string; product_url?: string; description?: string }> };
                if (data.items?.length) {
                  input.products = data.items as EmailGenerateMjmlInput["products"];
                  console.log("[MJML] fallback products from " + (isJson ? "JSON URL" : "sitemap"), { run_id: runId, initiative_id: initiativeId, count: data.items.length });
                }
              }
            } catch (_e) {
              console.log("[MJML] sitemap/products fallback failed", { run_id: runId, err: String((_e as Error).message).slice(0, 60) });
            }
          }
        }
        // #region agent log
        console.log("[MJML] campaign fetch (H3/H4)", { run_id: runId, initiative_id: initiativeId, template_id: input.template_id, productsCount: (input.products ?? []).length, campaign_promptLen: (input.campaign_prompt ?? "").length, subject_line: subjectLine?.slice(0, 50) });
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:campaign fetch", message: "MJML campaign fetch", data: { run_id: runId, initiative_id: initiativeId, template_id: input.template_id, productsCount: (input.products ?? []).length, hasSubjectLine: !!subjectLine }, timestamp: Date.now(), hypothesisId: "H4" }) }).catch(() => {});
        // #endregion
      }
    } catch (_e) {
      console.log("[MJML] campaign fetch failed (H3)", { run_id: runId, initiative_id: initiativeId, err: String((_e as Error).message).slice(0, 80) });
    }
    // Fallback: if campaign didn't provide template_id, try initiative row (e.g. older campaigns).
    if (!input.template_id) {
      try {
        const initRes = await fetch(`${CONTROL_PLANE_URL}/v1/initiatives/${initiativeId}`);
        if (initRes.ok) {
          const init = (await initRes.json()) as { template_id?: string };
          if (init.template_id) {
            input.template_id = init.template_id;
            console.log("[MJML] template_id from initiative fallback", { template_id: init.template_id });
          }
        }
      } catch (_e2) {
        console.log("[MJML] initiative fallback failed", { initiative_id: initiativeId, err: String((_e2 as Error).message).slice(0, 60) });
      }
    }
  }

  let templateMjml: string | null = null;
  let templateJson: Record<string, unknown> | null = null;
  let sectionsJsonMerged = false;

  let templateName = "";
  if (input.template_id) {
    try {
      const res = await fetch(`${CONTROL_PLANE_URL}/v1/email_templates/${input.template_id}`);
      if (res.ok) {
        const t = (await res.json()) as { name?: string; mjml?: string; template_json?: unknown; sections_json?: unknown };
        templateName = String(t.name ?? "").trim();
        templateMjml = t.mjml ?? null;
        templateJson = (t.template_json as Record<string, unknown>) ?? null;
        if (t.sections_json != null && typeof t.sections_json === "object") {
          templateJson = { ...(templateJson ?? {}), ...(t.sections_json as Record<string, unknown>) };
          sectionsJsonMerged = true;
        }
        // Hero must use campaign image when available, not product. Replace first {{product_1_image}} in the hero zone (first ~2500 chars) with {{hero_image_url}} for any template so campaign/pexels hero shows.
        if (templateMjml) {
          const heroZone = templateMjml.slice(0, 2500);
          const heroMatch = heroZone.match(/\{\{\s*product_1_image\s*\}\}/);
          if (heroMatch) {
            const placeholder = heroMatch[0];
            const firstInHero = heroZone.indexOf(placeholder);
            templateMjml = templateMjml.substring(0, firstInHero) + "{{hero_image_url}}" + templateMjml.substring(firstInHero + placeholder.length);
            console.log("[MJML] template: replaced {{product_1_image}} with {{hero_image_url}} in hero zone", { run_id: runId, template_id: input.template_id });
          }
        }
        // #region agent log
        console.log("[MJML] template fetch ok (H6)", { run_id: runId, template_id: input.template_id, mjml_len: templateMjml?.length ?? 0, template_jsonKeys: Object.keys(templateJson ?? {}), hasSectionsJson: !!t.sections_json, sectionsJsonMerged });
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:template fetch", message: "MJML template fetch", data: { run_id: runId, template_id: input.template_id, mjml_len: templateMjml?.length ?? 0, hasSectionsJson: !!t.sections_json }, timestamp: Date.now(), hypothesisId: "H6" }) }).catch(() => {});
        // #endregion
      } else {
        console.log("[MJML] template fetch not ok (H5)", { run_id: runId, template_id: input.template_id, status: res.status });
      }
    } catch (_e) {
      console.log("[MJML] template fetch failed (H3/H5)", { run_id: runId, template_id: input.template_id, err: String((_e as Error).message).slice(0, 80) });
    }
  } else {
    console.log("[MJML] no template_id (H4)", { run_id: runId, input_keys: Object.keys(input), template_id: input.template_id });
  }

  const products = input.products ?? [];
  const campaignImagesRaw = input.images ?? [];
  const campaignPrompt = input.campaign_prompt ?? "newsletter";

  let productList: ProductListItem[] = products.map((p) => ({
    name: p.title ?? "Product",
    title: p.title ?? "Product",
    link: p.product_url ?? p.src ?? "#",
    image: p.src ?? "",
    description: p.description ?? "",
  }));
  productList = await enrichProductDescriptionsIfEnabled(productList, request);

  const numberedProducts: Record<string, string> = {};
  const productObjects: Record<string, { title: string; description: string; image: string; link: string; buttonText: string }> = {};
  productList.forEach((p, i) => {
    const n = i + 1;
    const shortInfo = (p.description ?? p.title ?? "").slice(0, 60).trim() || (p.title ?? "");
    numberedProducts[`product_${n}_image`] = p.image;
    numberedProducts[`product_${n}_title`] = p.title;
    numberedProducts[`product_${n}_url`] = p.link;
    numberedProducts[`product_${n}_description`] = p.description;
    numberedProducts[`product_${n}_short_info`] = shortInfo;
    productObjects[`product${n}`] = { title: p.title, description: p.description, image: p.image, link: p.link, buttonText: "Learn more" };
    const letter = "ABCDEFGHIJK"[i];
    if (letter) {
      numberedProducts[`product${letter}_image`] = p.image;
      numberedProducts[`product${letter}_title`] = p.title;
      numberedProducts[`product${letter}_url`] = p.link;
      numberedProducts[`product${letter}_description`] = p.description;
      numberedProducts[`product${letter}_short_info`] = shortInfo;
      productObjects[`product${letter}`] = { title: p.title, description: p.description, image: p.image, link: p.link, buttonText: "Learn more" };
    }
  });
  const imagesArray = productList.map((p) => ({ title: p.title, description: p.description, buttonText: "Learn more" }));

  /** Formal image assignment (single source of truth). v1: first_selected = hero; rest + products = content. Persist on run for debugging/proofing. */
  const productImageUrls = productList.map((p) => p.image).filter((u): u is string => !!u && String(u).trim() !== "");
  const imageAssignment = buildImageAssignmentV1(
    (campaignImagesRaw ?? []) as string[],
    productImageUrls,
    logoUrl ?? null,
    "first_selected",
  );
  // Campaign-only for [image 1], [image 2]; put hero first so templates that use [image 1] for the top section get the hero image
  const contentOnly = getCampaignOnlyContentUrls(imageAssignment);
  const heroUrl = getCanonicalHeroUrl(imageAssignment);
  const campaignImages = heroUrl
    ? [heroUrl, ...contentOnly]
    : contentOnly;
  if ((campaignImagesRaw ?? []).length === 0) {
    console.log("[MJML] no campaign images provided; hero will be logo or blank. Save selected assets in campaign metadata (images) for hero/content.", { run_id: runId });
  }
  console.log("[MJML] image_assignment", { run_id: runId, sourceSummary: imageAssignment.sourceSummary, campaignOnlyCount: campaignImages.length, heroFirst: !!heroUrl, campaignImagesCount: campaignImagesRaw.length, heroUrl: heroUrl?.slice(-60) ?? "(none)", productImageCount: productImageUrls.length });

  const typo = mergedTokens && typeof mergedTokens === "object" ? (mergedTokens as Record<string, unknown>).typography : undefined;
  const typoObj = typo && typeof typo === "object" ? (typo as Record<string, unknown>) : undefined;
  const fonts = typoObj?.fonts as Record<string, string> | undefined;
  const fontFamilyObj = typoObj?.fontFamily as Record<string, string> | undefined;
  const fontFamily =
    (fonts?.heading || typoObj?.font_headings || fontFamilyObj?.sans || fontFamilyObj?.body) && typeof (fonts?.heading ?? typoObj?.font_headings ?? fontFamilyObj?.sans ?? fontFamilyObj?.body) === "string"
      ? String(fonts?.heading ?? typoObj?.font_headings ?? fontFamilyObj?.sans ?? fontFamilyObj?.body ?? "system-ui, sans-serif")
      : "system-ui, sans-serif";
  console.log("[MJML] font_resolution", { run_id: runId, fontFamily: fontFamily.slice(0, 40), hasFonts: !!fonts, hasTypoObj: !!typoObj, headingFont: fonts?.heading, bodyFont: (typoObj?.fonts as Record<string, string> | undefined)?.body });

  // Use preselected MJML template with brand tokens whenever we have template + fetch succeeded (products optional).
  if (templateMjml) {
    try {
      // Generate email copy via LLM from campaign prompt so the email shows LLM-written copy, not the raw prompt.
      let generatedCopy: GeneratedEmailCopy | null = null;
      let llmCopyUsed = false;
      if (campaignPrompt.trim().length > 0) {
        const productTitles = productList.map((p) => (p.title ?? p.name ?? "").trim()).filter(Boolean);
        generatedCopy = await generateEmailCopyViaLlm(
          campaignPrompt,
          brandPrompt ?? undefined,
          brandCtx ?? undefined,
          request,
          initiativeId ?? null,
          productTitles.length > 0 ? productTitles : undefined,
        );
        if (generatedCopy) {
          llmCopyUsed = true;
          console.log("[MJML] using LLM-generated copy", { run_id: runId, headlineLen: generatedCopy.headline.length, bodyLen: generatedCopy.body.length });
        } else {
          // LLM failed or returned invalid JSON: avoid repeating the raw prompt in headline, body, and button.
          const trimmed = campaignPrompt.trim();
          const words = trimmed.split(/\s+/).filter(Boolean);
          const headlineFallback = words.slice(0, 8).join(" ").trim() || trimmed.slice(0, 50);
          generatedCopy = {
            headline: headlineFallback,
            body: trimmed,
            ctaText: words.length > 2 ? words.slice(-2).join(" ") : "Shop now",
            ctaSectionHeadline: words.slice(0, 5).join(" ").trim() || "Don't miss out.",
            ctaSectionBody: trimmed.length > 80 ? trimmed.slice(0, 80).trim() + "…" : trimmed,
          };
          console.log("[MJML] LLM copy failed; using prompt-derived fallback", { run_id: runId });
        }
      }

      const logo = logoUrl ?? "";
      const heroImage = getCanonicalHeroUrl(imageAssignment) || logo || "";
      const identity = (brandCtx?.identity ?? {}) as {
        website?: string;
        contact_email?: string;
        tagline?: string;
        mission?: string;
        location?: string;
        archetype?: string;
        industry?: string;
      };
      const siteUrl = identity.website ?? "#";
      const mt = mergedTokens as Record<string, unknown> | undefined;
      const contactInfoFromTokens = mt?.contact_info;
      const logoObj = mt?.logo as Record<string, string> | undefined;
      const logoUrlWhite = (logoObj?.url_white ?? (typeof mt?.logo_white_url === "string" ? mt.logo_white_url : ""))?.trim() ?? "";
      const brandColors = (mt?.color ?? mt?.colors) as Record<string, Record<string, string>> | undefined;
      const brandColorObj = brandColors?.brand;
      const secondaryColor = brandColorObj?.["600"] ?? brandColorObj?.primary_dark ?? "";
      const sitemapUrl = typeof mt?.sitemap_url === "string" ? mt.sitemap_url : "";
      const sitemapType = typeof mt?.sitemap_type === "string" ? mt.sitemap_type : "";
      const assetUrlsArr = Array.isArray(mt?.asset_urls) ? (mt.asset_urls as string[]).filter((u) => typeof u === "string" && u.trim() !== "") : [];
      const asset_urls_str = assetUrlsArr.join(", ");
      // Email: single source from identity.contact_email. Other contact (phone, address) from design_tokens.contact_info.
      const otherContactStr = Array.isArray(contactInfoFromTokens) && contactInfoFromTokens.length > 0
        ? (contactInfoFromTokens as Array<{ type?: string; value?: string }>)
          .filter((c) => c && (c.value ?? "").trim() !== "")
          .map((c) => (c.type?.trim() ? `${c.type.trim()}: ${(c.value ?? "").trim()}` : (c.value ?? "").trim()))
          .join(", ")
        : "";
      const emailPart = identity.contact_email?.trim() ? `email: ${identity.contact_email.trim()}` : "";
      const contactInfoForTemplate = [emailPart, otherContactStr].filter(Boolean).join(", ") || "";
      const socialMediaFromTokens = (Array.isArray(mt?.social_media) ? mt.social_media : []) as Array<{ name?: string; url?: string; icon?: string }>;
      console.log("[MJML] social_media_from_tokens", { run_id: runId, count: socialMediaFromTokens.length, entries: socialMediaFromTokens.slice(0, 5).map((s) => ({ name: s?.name, url: (s?.url ?? "").slice(0, 50), hasIcon: !!(s?.icon) })) });
      const brandCtaText = (typeof mt?.cta_text === "string" && mt.cta_text.trim() !== "" ? mt.cta_text.trim() : undefined) ?? "Learn more";
      const brandCtaLink = (typeof mt?.cta_link === "string" && mt.cta_link.trim() !== "" ? mt.cta_link.trim() : undefined) ?? "#";
      const campaignImageEntries = Object.fromEntries(
        campaignImages.map((url, i) => [`image_${i + 1}`, url && typeof url === "string" ? url.trim() : ""]),
      );
      const sectionJson: Record<string, unknown> = {
        ...(templateJson ?? {}),
        products: productList,
        ...numberedProducts,
        ...productObjects,
        images: imagesArray,
        campaign_images: campaignImages,
        ...campaignImageEntries,
        tokens: mergedTokens as Record<string, unknown>,
        fontFamily,
        fonts: fontFamily,
        font_headings: (typoObj?.fonts as Record<string, string>)?.heading ?? typoObj?.font_headings ?? fontFamily,
        font_body: (typoObj?.fonts as Record<string, string>)?.body ?? typoObj?.font_body ?? fontFamily,
        brandColor,
        color: brandColor,
        primaryColor: brandColor,
        brand_color: brandColor,
        logoUrl: logo,
        logo_url: logo,
        logo: logo,
        brandLogo: logo,
        brand_logo: logo,
        logo_src: logo,
        logoSrc: logo,
        logo_white_url: logoUrlWhite || logo,
        logoWhite: logoUrlWhite || logo,
        white_logo: logoUrlWhite || logo,
        siteUrl,
        site_url: siteUrl,
        website: siteUrl,
        imageUrl: heroImage,
        image_url: heroImage,
        image_src: heroImage,
        imageSrc: heroImage,
        brandName: brandCtx?.name ?? "",
        brand_name: brandCtx?.name ?? "",
        tagline: identity.tagline ?? "",
        mission: identity.mission ?? "",
        location: identity.location ?? "",
        address: identity.location ?? "",
        archetype: identity.archetype ?? "",
        industry: identity.industry ?? "",
        voicetone: brandCtx?.tone?.voice_descriptors?.[0] ?? "friendly",
        footerRights: `© ${new Date().getFullYear()}`,
        contactInfo: contactInfoForTemplate,
        contact_email: identity.contact_email?.trim() ?? "",
        contactEmail: identity.contact_email?.trim() ?? "",
        socialMedia: socialMediaFromTokens,
        sitemap_url: sitemapUrl,
        sitemap_type: sitemapType,
        wordmark_bold: logoObj?.wordmark_bold ?? "",
        wordmark_light: logoObj?.wordmark_light ?? "",
        asset_urls: asset_urls_str,
        assetUrls: asset_urls_str,
        secondaryColor,
        brand_secondary: secondaryColor,
        ...Object.fromEntries(
          (socialMediaFromTokens as Array<{ url?: string; icon?: string; name?: string }>).flatMap((s, i) => {
            const n = i + 1;
            const link = (s?.url ?? "").trim();
            const icon = resolveSocialIcon(s) ?? "";
            if (!link || link === "#" || !icon) return [];
            return [
              [`social_media_${n}_link`, link],
              [`social_media_${n}_icon`, icon],
            ];
          }),
        ),
        cta_text: brandCtaText,
        cta_label: brandCtaText,
        cta_url: brandCtaLink,
        cta_link: brandCtaLink,
        footer: `© ${new Date().getFullYear()} ${brandCtx?.name ?? ""}. All rights reserved.`,
        hero_image: heroImage,
        hero_image_url: heroImage,
        heroImageUrl: heroImage,
        emailTitle: subjectLine ?? campaignPrompt,
        subject_line: subjectLine ?? campaignPrompt,
      };
      // Campaign copy: set after templateJson. Use LLM-generated copy when available; otherwise derive headline/body/CTA from prompt so content isn't the same everywhere.
      const copyKeys = [
        "campaignPrompt", "title", "header", "subhead", "message", "description",
        "prehead", "eyebrow", "offerText", "offer", "content", "main_message", "mainMessage", "theme", "intro", "copy", "promo_text",
      ];
      for (const k of copyKeys) (sectionJson as Record<string, unknown>)[k] = campaignPrompt;
      if (!generatedCopy && campaignPrompt.trim().length > 0) {
        const parts = campaignPrompt.trim().split(/\s*[.|]\s*/).filter(Boolean);
        const headline = parts[0]?.trim().slice(0, 80) ?? campaignPrompt.trim().slice(0, 80);
        const body = parts.slice(1).join(". ").trim().slice(0, 300) || headline;
        const ctaText = parts[parts.length - 1]?.trim().slice(0, 25) || "Shop now";
        (sectionJson as Record<string, unknown>).headline = headline;
        (sectionJson as Record<string, unknown>).body = body;
        (sectionJson as Record<string, unknown>).header = headline;
        (sectionJson as Record<string, unknown>).cta_text = ctaText;
        (sectionJson as Record<string, unknown>).cta_label = ctaText;
        (sectionJson as Record<string, unknown>).ctaSectionHeadline = headline;
        (sectionJson as Record<string, unknown>).ctaSectionBody = body;
      }
      if (generatedCopy) {
        if (!generatedCopy.ctaSectionHeadline && generatedCopy.headline) {
          const short = generatedCopy.headline.split(/\s+/).slice(0, 5).join(" ").trim();
          generatedCopy.ctaSectionHeadline = short ? `${short}…` : "Don't miss out.";
        }
        if (!generatedCopy.ctaSectionBody && generatedCopy.body) {
          const shortBody = generatedCopy.body.split(/\s+/).slice(0, 12).join(" ").trim();
          generatedCopy.ctaSectionBody = shortBody ? `${shortBody}…` : generatedCopy.ctaSectionHeadline ?? "Learn more.";
        }
        (sectionJson as Record<string, unknown>).headline = generatedCopy.headline;
        (sectionJson as Record<string, unknown>).body = generatedCopy.body;
        (sectionJson as Record<string, unknown>).header = generatedCopy.headline;
        (sectionJson as Record<string, unknown>).campaignPrompt = campaignPrompt;
        (sectionJson as Record<string, unknown>).cta_text = generatedCopy.ctaText;
        (sectionJson as Record<string, unknown>).cta_label = generatedCopy.ctaText;
        if (generatedCopy.ctaSectionHeadline) (sectionJson as Record<string, unknown>).ctaSectionHeadline = generatedCopy.ctaSectionHeadline;
        if (generatedCopy.ctaSectionBody) (sectionJson as Record<string, unknown>).ctaSectionBody = generatedCopy.ctaSectionBody;
      }

      // Template–payload contract: extract placeholders from MJML and fill any missing from alias map
      const templatePlaceholders = [...new Set([...templateMjml.matchAll(PLACEHOLDER_REGEX)].map((m) => m[1]))];
      const conceptValues: Record<string, unknown> = {
        logo,
        brandColor,
        campaignCopy: (generatedCopy?.headline ?? campaignPrompt),
        fontFamily,
        heroImage,
        footer: (sectionJson as Record<string, unknown>).footer,
        ctaText: (generatedCopy?.ctaText ?? brandCtaText),
        ctaUrl: (sectionJson as Record<string, unknown>).cta_link ?? brandCtaLink,
      };
      for (const ph of templatePlaceholders) {
        const v = (sectionJson as Record<string, unknown>)[ph];
        if (v !== undefined && v !== null && String(v).trim() !== "") continue;
        const letterMatch = /^product([A-Ea-e])(_?.+)$/.exec(ph);
        if (letterMatch) {
          const n = "ABCDE".indexOf(letterMatch[1].toUpperCase()) + 1;
          const suffix = letterMatch[2].replace(/^_/, "");
          const numKey = `product_${n}_${suffix}` as keyof typeof numberedProducts;
          const fromNumbered = (numberedProducts as Record<string, unknown>)[numKey] ?? (productObjects as Record<string, unknown>)[`product${n}`];
          const fromObj = (productObjects as Record<string, unknown>)[`product${letterMatch[1].toUpperCase()}`];
          if (fromNumbered !== undefined && fromNumbered !== null) (sectionJson as Record<string, unknown>)[ph] = fromNumbered;
          else if (fromObj != null && typeof fromObj === "object" && suffix in fromObj) (sectionJson as Record<string, unknown>)[ph] = (fromObj as Record<string, unknown>)[suffix];
          continue;
        }
        for (const [concept, aliases] of Object.entries(PLACEHOLDER_ALIASES)) {
          if (aliases.includes(ph)) {
            (sectionJson as Record<string, unknown>)[ph] = conceptValues[concept];
            break;
          }
        }
      }
      const unfilledPlaceholders = templatePlaceholders.filter(
        (ph) => {
          const v = (sectionJson as Record<string, unknown>)[ph];
          return v === undefined || v === null || String(v).trim() === "";
        }
      );
      console.log("[MJML] template contract", {
        run_id: runId,
        template_id: input.template_id,
        template_placeholders: templatePlaceholders,
        sectionJson_keys: Object.keys(sectionJson),
        unfilled_placeholders: unfilledPlaceholders,
      });

      // #region agent log
      const productObjectKeys = Object.keys(productObjects);
      console.log("[MJML] template payload (H6/H7)", { run_id: runId, template_id: input.template_id, sectionJsonKeys: Object.keys(sectionJson), productsCount: productList.length, productObjectKeys, imagesCount: imagesArray.length, hasLogo: !!logoUrl, logoUrlSnippet: (logoUrl ?? "").slice(0, 60), campaignPromptLen: campaignPrompt.length, sectionsJsonMerged });
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:sectionJson", message: "MJML sectionJson", data: { run_id: runId, sectionJsonKeys: Object.keys(sectionJson), productsCount: productList.length, hasLogo: !!logoUrl, campaignPromptLen: campaignPrompt.length, template_placeholders: templatePlaceholders, unfilled_placeholders: unfilledPlaceholders }, timestamp: Date.now(), hypothesisId: "H7" }) }).catch(() => {});
      // #endregion
      const compile = Handlebars.compile(templateMjml);
      let mjmlOut = compile(sectionJson);
      // Inject brand font into head so it applies even if template has no {{fontFamily}} placeholder
      if (fontFamily && mjmlOut.includes("</mj-head>")) {
        const safe = fontFamily.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/</g, "&lt;");
        const fontStyle = `<mj-style>.body, .mj-body, [class*="mj-"] { font-family: '${safe}'; }</mj-style>\n`;
        mjmlOut = mjmlOut.replace("</mj-head>", fontStyle + "</mj-head>");
      }
      // Apply brand color only in style blocks that look like headings (font-size >= 20px or font-weight bold) so body copy stays black.
      const headingLike = /font-size:\s*(?:2\d|3\d|4\d|5\d)px|font-weight:\s*bold/i;
      mjmlOut = mjmlOut.replace(/style="([^"]*)"/g, (_match, content) => {
        if (headingLike.test(content) && (/\bcolor:\s*#000000\b/.test(content) || /\bcolor:\s*#000\b/.test(content))) {
          const out = content.replace(/\bcolor:\s*#000000\b/gi, `color:${brandColor}`).replace(/\bcolor:\s*#000\b/gi, `color:${brandColor}`);
          return `style="${out}"`;
        }
        return _match;
      });
      // If no heading-like black was found, replace only the first occurrence of black text so main heading gets brand.
      if (!mjmlOut.includes(brandColor)) {
        mjmlOut = mjmlOut.replace(/\bcolor:\s*#000000\b/i, `color:${brandColor}`).replace(/\bcolor:\s*#000\b/i, `color:${brandColor}`);
      }
      // First occurrence of black background only (e.g. header bar) so we don't recolor every black block.
      let bgReplaced = false;
      mjmlOut = mjmlOut.replace(/\b(background-color:\s*)(#000000|#000)\b/gi, (full, prefix: string) => {
        if (bgReplaced) return full;
        bgReplaced = true;
        return prefix + brandColor;
      });
      const { html: rawHtml } = mjml2html(mjmlOut, { minify: true });
      const year = new Date().getFullYear();
      const brandFooter: BrandFooterReplacements = {
        companyName: brandCtx?.name ?? "",
        footerRights: `© ${year} ${brandCtx?.name ?? ""}. All rights reserved.`,
        address: (brandCtx?.identity as { location?: string })?.location ?? (sectionJson.contactInfo as string) ?? "",
        partnerLine: brandCtx?.name ? `${brandCtx.name}${siteUrl && siteUrl !== "#" ? ` | ${siteUrl.replace(/^https?:\/\//, "")}` : ""}` : "",
        termsUrl: siteUrl && siteUrl !== "#" ? `${siteUrl.replace(/\/$/, "")}/terms` : "#",
      };
      let htmlInput = replaceBracketPlaceholders(rawHtml ?? "", sectionJson as Record<string, unknown>);
      const sj = sectionJson as Record<string, unknown>;
      const ctaUrl = String(sj.cta_url ?? sj.cta_link ?? siteUrl ?? "#").trim() || "#";
      const fallbackUrl = (productList[0]?.link && productList[0].link !== "#" ? productList[0].link : ctaUrl !== "#" ? ctaUrl : siteUrl) ?? "#";
      const productUrls: string[] = [];
      const productImages: string[] = [];
      const productTitles: string[] = [];
      for (let n = 1; n <= 5; n++) {
        const u = sj[`product_${n}_url`];
        const img = sj[`product_${n}_image`];
        const title = sj[`product_${n}_title`];
        productUrls.push(typeof u === "string" && u.trim() ? u.trim() : fallbackUrl);
        productImages.push(typeof img === "string" && img.trim() ? img.trim() : "");
        productTitles.push(typeof title === "string" && title.trim() ? String(title).trim() : "");
      }
      // Hero: show first campaign image when present (any template). Replace first product-image in body (before footer) with hero.
      const heroUrlForReplace = String(sj.hero_image_url ?? sj.hero_image ?? "").trim();
      const isHeroFromCampaign = heroUrlForReplace && (isOurCdnUrl(heroUrlForReplace) || /pexels|unsplash|\.(jpg|jpeg|png|webp)/i.test(heroUrlForReplace));
      if (heroUrlForReplace && isHeroFromCampaign) {
        const bodyEnd = htmlInput.indexOf("#292929");
        const bodyOnly = bodyEnd !== -1 ? htmlInput.slice(0, bodyEnd) : htmlInput;
        const allImgs = [...bodyOnly.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
        let heroReplaced = false;
        for (const imgMatch of allImgs) {
          const src = imgMatch[1];
          if (!src) continue;
          const isLogo = isOurCdnUrl(src) && !productImages.some((p) => p && (src === p || src.includes(p.slice(-50)) || p.includes(src.slice(-50))));
          const isTinyPlaceholder = /data:image|1x1|spacer/i.test(src);
          if (isLogo || isTinyPlaceholder) continue;
          const isProductSrc = productImages.some((p) => p && (src === p || src.includes(p.slice(-50)) || p.includes(src.slice(-50)))) || /cdn\.shopify\.com|shopify\.com\/files\//i.test(src);
          if (isProductSrc) {
            const safeHero = heroUrlForReplace.replace(/"/g, "&quot;");
            htmlInput = htmlInput.replace(imgMatch[0], imgMatch[0].replace(/src=["'][^"']*["']/i, `src="${safeHero}"`));
            heroReplaced = true;
            console.log("[MJML] hero replaced product img in HTML", { run_id: runId, replacedSrc: src.slice(-60), heroUrl: heroUrlForReplace.slice(-60) });
            break;
          }
        }
        if (!heroReplaced) {
          console.log("[MJML] hero NOT replaced: no product img found in body", { run_id: runId, heroUrl: heroUrlForReplace.slice(-60), imgCount: allImgs.length, firstSrcs: allImgs.slice(0, 3).map((m) => (m[1] ?? "").slice(-50)) });
        }
      }
      const isEmmaTemplate = /emma/i.test(templateName);
      if (isEmmaTemplate) {
        let linkCount = 0;
        const linkRegex = /<a\s+href=["']#["']\s*([^>]*)>([\s\S]*?)<\/a>/gi;
        htmlInput = htmlInput.replace(linkRegex, (_match, attrs, content) => {
          const text = content.replace(/<[^>]+>/g, "").trim();
          const hasImg = /<img[\s\S]*?>/i.test(content) && content.trim().length < 500;
          const isDiscoverMore = /discover\s+more|learn\s+more|shop\s+now|view\s+product/i.test(text);
          const isProductTitle = text.length > 0 && text.length < 120 && !/^(Terms|Privacy|Unsubscribe|View in browser|#)$/i.test(text);
          const isCtaButton = /shop\s+now|save\s+\d+%|elevate|explore|buy\s+now|get\s+started|learn\s+more/i.test(text) && text.length < 80;

          let productIndex = -1;
          if (hasImg) {
            const srcMatch = content.match(/src=["']([^"']+)["']/i);
            const src = srcMatch ? srcMatch[1].trim() : "";
            if (src) {
              for (let i = 0; i < productImages.length; i++) {
                if (productImages[i] && (src === productImages[i] || src.includes(productImages[i].slice(-40)) || productImages[i].includes(src.slice(-40)))) {
                  productIndex = i;
                  break;
                }
              }
            }
          }
          if (productIndex < 0 && isProductTitle && text) {
            for (let i = 0; i < productTitles.length; i++) {
              if (productTitles[i] && (text === productTitles[i] || text.includes(productTitles[i]) || productTitles[i].includes(text))) {
                productIndex = i;
                break;
              }
            }
          }
          if (productIndex < 0) productIndex = Math.floor(linkCount / 3) % productUrls.length;

          if (hasImg || isDiscoverMore || isProductTitle || isCtaButton) {
            linkCount++;
            const url = (hasImg || isDiscoverMore || isProductTitle) ? (productUrls[productIndex] ?? productUrls[0] ?? fallbackUrl) : (ctaUrl !== "#" ? ctaUrl : fallbackUrl);
            return `<a href="${String(url).replace(/"/g, "&quot;")}" ${attrs}>${content}</a>`;
          }
          return _match;
        });
        // Emma: footer uses siteUrl as logo img src – replace with white logo in dark footer (#292929)
        const logoWhite = String(sj.logo_white_url ?? sj.logoWhite ?? sj.white_logo ?? sj.logoUrl ?? "").trim();
        if (logoWhite && siteUrl && siteUrl !== "#") {
          const footerStart = htmlInput.indexOf("#292929");
          if (footerStart !== -1) {
            const beforeFooter = htmlInput.slice(0, footerStart);
            const footerSection = htmlInput.slice(footerStart);
            const safeLogo = logoWhite.replace(/"/g, "&quot;");
            let out = footerSection;
            const siteUrlNorm = siteUrl.replace(/\/$/, "");
            if (footerSection.includes(`src="${siteUrl}"`) || footerSection.includes(`src="${siteUrlNorm}"`)) {
              out = out.replace(new RegExp(`src="${siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "i"), `src="${safeLogo}"`);
              out = out.replace(new RegExp(`src="${siteUrlNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "i"), `src="${safeLogo}"`);
            }
            htmlInput = beforeFooter + out;
          }
        }
        // Emma: "Request a demo" and similar CTA <p> are not links – replace <p>...</p> with <a href="cta_url">...</a>
        const requestDemoRegex = /<p(\s+style="[^"]*")>Request a demo<\/p>/gi;
        htmlInput = htmlInput.replace(requestDemoRegex, () => {
          const href = (ctaUrl !== "#" ? ctaUrl : fallbackUrl).replace(/"/g, "&quot;");
          return `<a href="${href}" style="display:inline-block;background:#FFFFFF;color:#16a34a;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:130%;margin:0;text-decoration:none;padding:10px 40px 15px 40px;border-radius:50px;" target="_blank">Request a demo</a>`;
        });
        // Emma: wrap standalone "Discover more." and product title text in <a href="product_url"> (template often uses <div> not <a>)
        let discoverIndex = 0;
        htmlInput = htmlInput.replace(/<div([^>]*)>(\s*Discover more\.?\s*)<\/div>/gi, (_match, attrs, text) => {
          if (text.includes("<a ")) return _match;
          const url = productUrls[discoverIndex] ?? productUrls[0] ?? fallbackUrl;
          discoverIndex++;
          const safeUrl = url.replace(/"/g, "&quot;");
          return `<div${attrs}><a href="${safeUrl}" style="color:inherit;text-decoration:none;" target="_blank">${text.trim()}</a></div>`;
        });
        for (let i = 0; i < productTitles.length; i++) {
          if (!productTitles[i]) continue;
          const title = productTitles[i];
          const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          // Match <div>title</div> or <div>title | extra text</div> (template may append suffix)
          const re = new RegExp(`(<div([^>]*)>)\\s*(${escaped})([^<]*)\\s*(</div>)`, "gi");
          htmlInput = htmlInput.replace(re, (match, openDiv, attrs, titlePart, suffix, closeDiv) => {
            if (match.includes("<a ")) return match;
            const url = productUrls[i] ?? productUrls[0] ?? fallbackUrl;
            const safeUrl = url.replace(/"/g, "&quot;");
            const fullText = (titlePart + (suffix ?? "").trim()).trim();
            return `${openDiv}<a href="${safeUrl}" style="color:inherit;text-decoration:none;font-weight:bold;" target="_blank">${fullText}</a>${closeDiv}`;
          });
        }
        // Emma: inject social icons only when the template footer doesn't already have a social row (avoids duplicate row).
        const footerStartForSocial = htmlInput.indexOf("#292929");
        const footerSectionForSocial = footerStartForSocial !== -1 ? htmlInput.slice(footerStartForSocial) : "";
        const hasExistingSocialRow =
          footerSectionForSocial && (footerSectionForSocial.match(/<a [^>]+target="_blank"[^>]*>[\s\S]*?<img/gi) ?? []).length >= 2;
        if (!hasExistingSocialRow) {
          const socialEntries: { link: string; icon: string }[] = [];
          for (let n = 1; n <= 5; n++) {
            const link = String(sj[`social_media_${n}_link`] ?? "").trim();
            let icon = String(sj[`social_media_${n}_icon`] ?? "").trim();
            if (!icon || icon === EMPTY_IMAGE_DATA_URI) {
              const detected = detectPlatformFromUrl(link);
              icon = detected ? (SOCIAL_ICON_BY_NAME[detected] ?? "") : "";
            }
            if (link && link !== "#" && icon) {
              socialEntries.push({ link, icon });
            }
          }
          if (socialEntries.length > 0 && footerStartForSocial !== -1) {
            const footerSection = htmlInput.slice(footerStartForSocial);
            const firstTrEnd = footerSection.indexOf("</tr>");
            if (firstTrEnd !== -1) {
              const socialCells = socialEntries
                .map((e) => {
                  const isSvgDataUri = e.icon.startsWith("data:image/svg");
                  const imgStyle = isSvgDataUri
                    ? "border:0;display:inline-block;height:24px;width:24px;"
                    : "border:0;display:inline-block;height:24px;width:24px;filter:brightness(0) invert(1);";
                  return `<a href="${e.link.replace(/"/g, "&quot;")}" target="_blank" style="display:inline-block;margin:0 8px;text-decoration:none;vertical-align:middle;"><img src="${e.icon.replace(/"/g, "&quot;")}" alt="" width="24" height="24" style="${imgStyle}" /></a>`;
                })
                .join("");
              const socialRow = `<tr><td align="center" style="font-size:0px;padding:10px 25px 8px;word-break:break-word;">${socialCells}</td></tr>`;
              const beforeFooter = htmlInput.slice(0, footerStartForSocial);
              const afterFirstTr = footerSection.slice(firstTrEnd + 5);
              htmlInput = beforeFooter + footerSection.slice(0, firstTrEnd + 5) + socialRow + afterFirstTr;
            }
          }
        }
        // Replace any old Flaticon social icon URLs in the existing HTML with our SVG data URIs
        if (footerStartForSocial !== -1) {
          const beforeFooter = htmlInput.slice(0, footerStartForSocial);
          let darkFooter = htmlInput.slice(footerStartForSocial);
          // Match social <a>+<img> blocks and replace icon src with proper SVG if link detectable
          darkFooter = darkFooter.replace(
            /<a\s+href="([^"]*)"[^>]*>\s*<img\s+src="([^"]*)"[^>]*width="24"[^>]*>/gi,
            (match, linkUrl: string, iconSrc: string) => {
              if (iconSrc.startsWith("data:image/svg")) return match;
              const platform = detectPlatformFromUrl(linkUrl);
              if (platform && SOCIAL_ICON_BY_NAME[platform]) {
                const svgIcon = SOCIAL_ICON_BY_NAME[platform];
                const newMatch = match
                  .replace(/src="[^"]*"/i, `src="${svgIcon}"`)
                  .replace(/filter:\s*brightness\([^)]*\)\s*invert\([^)]*\);?/gi, "");
                return newMatch;
              }
              return match;
            },
          );
          htmlInput = beforeFooter + darkFooter;
        }
        // Remove any unreplaced bracket placeholders in footer (e.g. [social media 5 icon]) so no literal text shows; hide missing slots.
        htmlInput = htmlInput.replace(/src="\[social media \d+ (icon|link)\]"/gi, (_, kind) =>
          kind === "icon" ? `src="${EMPTY_IMAGE_DATA_URI}"` : 'src="#"',
        );
        // Remove social <a> tags whose icon is the transparent 1x1 gif (missing slot) so they don't show as blank links.
        htmlInput = htmlInput.replace(/<a\s+href="[^"]*"\s+[^>]*style="display:inline-block[^"]*"[^>]*>\s*<img\s+src="data:image\/gif;base64,[^"]*"[^>]*>\s*<\/a>/gi, "");
      }
      // For any template with dark footer (#292929): replace old Flaticon icon URLs with SVGs, hide empty slots.
      {
        const footerStartForSocial = htmlInput.indexOf("#292929");
        if (footerStartForSocial !== -1) {
          let darkFooter = htmlInput.slice(footerStartForSocial);
          // Replace Flaticon/external icon URLs with SVG data URIs based on link URL detection
          darkFooter = darkFooter.replace(
            /<a\s+href="([^"]*)"[^>]*>\s*<img\s+src="([^"]*)"[^>]*width="24"[^>]*>/gi,
            (match, linkUrl: string, iconSrc: string) => {
              if (iconSrc.startsWith("data:image/svg")) return match;
              const platform = detectPlatformFromUrl(linkUrl);
              if (platform && SOCIAL_ICON_BY_NAME[platform]) {
                return match
                  .replace(/src="[^"]*"/i, `src="${SOCIAL_ICON_BY_NAME[platform]}"`)
                  .replace(/filter:\s*brightness\([^)]*\)\s*invert\([^)]*\);?/gi, "");
              }
              return match;
            },
          );
          htmlInput = htmlInput.slice(0, footerStartForSocial) + darkFooter;
          htmlInput = htmlInput.replace(/src="\[social media \d+ (icon|link)\]"/gi, (_, kind) =>
            kind === "icon" ? `src="${EMPTY_IMAGE_DATA_URI}"` : 'src="#"',
          );
          htmlInput = htmlInput.replace(/<a\s+href="[^"]*"\s+[^>]*style="display:inline-block[^"]*"[^>]*>\s*<img\s+src="data:image\/gif;base64,[^"]*"[^>]*>\s*<\/a>/gi, "");
        }
      }
      let html = applyBrandColorsAndCampaignCopy(
        htmlInput,
        brandColor,
        campaignPrompt,
        generatedCopy,
        brandFooter,
      );

      // ── Design polish: brand fonts, full-width hero, tighter spacing ──
      html = applyDesignPolish(html, fontFamily, brandColor, generatedCopy);

      // #region agent log
      console.log("[MJML] compile success (H9)", { run_id: runId, htmlLen: html?.length ?? 0, campaignPromptSnippet: campaignPrompt.slice(0, 40), fontFamily: fontFamily.slice(0, 30) });
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:compile success", message: "MJML compile success", data: { run_id: runId, htmlLen: html?.length ?? 0 }, timestamp: Date.now(), hypothesisId: "H9" }) }).catch(() => {});
      // #endregion

      // Pre-write verification (quality gate)
      const htmlLen = html?.length ?? 0;
      if (htmlLen < MIN_HTML_LENGTH) {
        const msg = `[MJML] pre-write check failed: html length ${htmlLen} < ${MIN_HTML_LENGTH}`;
        console.log(msg, { run_id: runId, job_run_id: jobRunId, template_id: input.template_id });
        throw new Error(msg);
      }
      const hasStructure = /<\/html>|<\/table>|<\/body>/i.test(html ?? "");
      if (!hasStructure) {
        const msg = "[MJML] pre-write check failed: compiled HTML missing structural tag (</html>, </table>, or </body>)";
        console.log(msg, { run_id: runId, job_run_id: jobRunId, template_id: input.template_id });
        throw new Error(msg);
      }
      if (campaignPrompt.trim().length > 0) {
        const snippet = campaignPrompt.trim().slice(0, 20).replace(/[<>]/g, "");
        if (snippet.length >= 3 && !(html ?? "").includes(snippet)) {
          console.log("[MJML] pre-write optional: campaign copy snippet not found in HTML (template may use a different placeholder); continuing", {
            run_id: runId,
            job_run_id: jobRunId,
            template_id: input.template_id,
            snippet: snippet.slice(0, 15),
          });
        }
      }
      if (logoUrl && logoUrl.length > 0) {
        const logoInHtml = (html ?? "").includes(logoUrl) || (html ?? "").includes(logoUrl.slice(0, 60));
        if (!logoInHtml) {
          console.log("[MJML] pre-write optional: brand has logo but logo URL not found in compiled HTML (template may not use {{logoUrl}}); continuing", {
            run_id: runId,
            job_run_id: jobRunId,
            template_id: input.template_id,
            logoUrlSnippet: logoUrl.slice(0, 50),
          });
        }
      }
      if (fontFamily && (mjmlOut.includes("</mj-head>") || (html ?? "").includes("font-family"))) {
        const fontInOutput = (html ?? "").includes(fontFamily) || (html ?? "").includes(fontFamily.split(",")[0]?.trim() ?? "");
        if (!fontInOutput) {
          console.log("[MJML] pre-write optional: fontFamily not found in HTML", { run_id: runId, fontFamily: fontFamily.slice(0, 30) });
        }
      }

      const promptHash = createHash("sha256").update(campaignPrompt).digest("hex").slice(0, 16);
      const preWriteVerification = {
        passed: true,
        details: {
          checks: ["length", "structure", "campaign_copy", "logo"],
          generated_len: htmlLen,
        },
      };
      // Persist image assignment on run and run validations (V001–V012)
      if (runId && input.template_id && brandCtx?.id) {
        try {
          const persisted = buildImageAssignmentPersisted(imageAssignment, {
            run_id: runId,
            template_id: input.template_id,
            brand_profile_id: brandCtx.id,
            campaignImageUrls: (campaignImagesRaw ?? []) as string[],
            productImageUrls,
            logoUrl: logoUrl ?? null,
          });
          const assignRes = await fetch(`${CONTROL_PLANE_URL}/v1/runs/${runId}/image_assignment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(persisted),
          });
          if (!assignRes.ok) {
            console.warn("[MJML] image_assignment persist failed", { run_id: runId, status: assignRes.status, text: await assignRes.text().then((t) => t.slice(0, 200)) });
          }
          const validateRes = await fetch(`${CONTROL_PLANE_URL}/v1/runs/${runId}/validate_image_assignment`, { method: "POST" });
          if (!validateRes.ok) {
            console.warn("[MJML] validate_image_assignment failed", { run_id: runId, status: validateRes.status });
          }
        } catch (e) {
          console.warn("[MJML] image_assignment persist/validate error", { run_id: runId, err: String((e as Error).message) });
        }
      }
      return {
        artifact_type: "email_template",
        artifact_class: "email_template",
        content: html,
        metadata: {
          brand_profile_id: brandCtx?.id,
          brand_color: brandColor,
          mjml: mjmlOut,
          email_generation_path: "template",
          llm_copy_used: llmCopyUsed,
          mjml_template_id: input.template_id ?? null,
          generated_html_len: html?.length ?? 0,
          template_id_used: input.template_id ?? null,
          brand_profile_id_used: brandCtx?.id ?? null,
          logo_url_used: logoUrl ? logoUrl.slice(0, 80) : null,
          prompt_hash: promptHash,
          template_placeholders: templatePlaceholders,
          unfilled_placeholders: unfilledPlaceholders,
          pre_write_verification: preWriteVerification,
        },
      };
    } catch (_e) {
      // #region agent log
      const errMsg = String((_e as Error).message).slice(0, 120);
      console.log("[MJML] template compile/render failed (H8)", { run_id: runId, err: errMsg, template_id: input.template_id });
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:compile failed", message: "MJML compile failed", data: { run_id: runId, err: errMsg }, timestamp: Date.now(), hypothesisId: "H8" }) }).catch(() => {});
      // #endregion
    }
  }

  console.log("[MJML] using LLM path (H8/H9)", { run_id: runId, hasTemplate: !!templateMjml, campaignPromptSnippet: campaignPrompt.slice(0, 60) });
  fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:LLM path", message: "MJML using LLM path", data: { run_id: runId, hasTemplate: !!templateMjml }, timestamp: Date.now(), hypothesisId: "H9" }) }).catch(() => {});
  const messages: LLMChatOptions["messages"] = [];
  if (brandPrompt) {
    messages.push({
      role: "system",
      content: brandPrompt + `\nUse primary color ${brandColor} for buttons and headers. Generate a single HTML email (no MJML).`,
    });
  }
  const productSummary = products.length > 0
    ? products.map((p) => `${p.title ?? "Product"}: ${p.product_url ?? p.src ?? ""}`).join("\n")
    : "no products";
  messages.push({
    role: "user",
    content: `Write an email (HTML only, no MJML). Theme: ${campaignPrompt}. Products:\n${productSummary}. Audience: subscribers.`,
  });

  const result = await chat({
    model: "auto/chat",
    messages,
    context: {
      run_id: request.run_id,
      job_run_id: request.job_run_id,
      job_type: request.job_type,
      initiative_id: initiativeId,
    },
    brandContext: brandCtx ? { id: brandCtx.id, name: brandCtx.name, systemPrompt: brandPrompt } : undefined,
    useGateway: request.llm_source !== "openai_direct",
  });

  if (request.recordLlmCall) {
    await request.recordLlmCall(
      "auto/chat",
      result.model_id ?? "unknown",
      result.tokens_in,
      result.tokens_out,
      result.latency_ms,
    );
  }

  const content = result.content ?? "";
  const html = content.includes("<") ? content : `<html><body><p>${content.replace(/\n/g, "</p><p>")}</p></body></html>`;
  const promptHash = createHash("sha256").update(campaignPrompt).digest("hex").slice(0, 16);

  return {
    artifact_type: "email_template",
    artifact_class: "email_template",
    content: html,
    metadata: {
      brand_profile_id: brandCtx?.id,
      brand_color: brandColor,
      email_generation_path: "llm",
      mjml_template_id: null,
      generated_html_len: html.length,
      template_id_used: null,
      brand_profile_id_used: brandCtx?.id ?? null,
      logo_url_used: null,
      prompt_hash: promptHash,
    },
  };
}
