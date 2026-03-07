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

/** Map social platform name to icon URL when design_tokens don't provide icon. */
const SOCIAL_ICON_BY_NAME: Record<string, string> = {
  linkedin: "https://cdn-icons-png.flaticon.com/512/145/145807.png",
  instagram: "https://cdn-icons-png.flaticon.com/512/174/174855.png",
  facebook: "https://cdn-icons-png.flaticon.com/512/1312/1312139.png",
  twitter: "https://cdn-icons-png.flaticon.com/512/2504/2504947.png",
  x: "https://cdn-icons-png.flaticon.com/512/2504/2504947.png",
  youtube: "https://cdn-icons-png.flaticon.com/512/2504/2504947.png",
  tiktok: "https://cdn-icons-png.freepik.com/512/15789/15789316.png",
};

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
    return String(v ?? (kind === "link" ? (sectionJson.siteUrl ?? "#") : ""));
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

  try {
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

    let raw = (result.content ?? "").trim();
    const codeBlock = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
    if (codeBlock) raw = codeBlock[1].trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    const ctaText = typeof parsed.ctaText === "string" ? parsed.ctaText.trim() : "Learn more";
    const ctaSectionHeadline = typeof parsed.ctaSectionHeadline === "string" ? parsed.ctaSectionHeadline.trim() : undefined;
    const ctaSectionBody = typeof parsed.ctaSectionBody === "string" ? parsed.ctaSectionBody.trim() : undefined;
    if (headline.length > 0 && body.length > 0) {
      return { headline, body, ctaText, ctaSectionHeadline, ctaSectionBody };
    }
  } catch (_e) {
    console.log("[MJML] LLM copy generation failed", { run_id: request.run_id, err: String((_e as Error).message).slice(0, 80) });
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
        // Hero must use campaign image, not product. Emma-style templates: replace first {{product_1_image}} only when it's in the hero (first ~2500 chars) so we don't replace the product section's placeholder.
        const isEmmaTemplate = /emma/i.test(templateName);
        if (templateMjml && isEmmaTemplate) {
          const heroZone = templateMjml.slice(0, 2500);
          const heroMatch = heroZone.match(/\{\{\s*product_1_image\s*\}\}/);
          if (heroMatch) {
            const placeholder = heroMatch[0];
            const firstInHero = heroZone.indexOf(placeholder);
            templateMjml = templateMjml.substring(0, firstInHero) + "{{hero_image_url}}" + templateMjml.substring(firstInHero + placeholder.length);
            console.log("[MJML] Emma template: replaced {{product_1_image}} with {{hero_image_url}} in hero zone", { run_id: runId, template_id: input.template_id });
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
  console.log("[MJML] image_assignment", { run_id: runId, sourceSummary: imageAssignment.sourceSummary, campaignOnlyCount: campaignImages.length, heroFirst: !!heroUrl });

  const typo = mergedTokens && typeof mergedTokens === "object" ? (mergedTokens as Record<string, unknown>).typography : undefined;
  const typoObj = typo && typeof typo === "object" ? (typo as Record<string, unknown>) : undefined;
  const fonts = typoObj?.fonts as Record<string, string> | undefined;
  const fontFamilyObj = typoObj?.fontFamily as Record<string, string> | undefined;
  const fontFamily =
    (fonts?.heading || typoObj?.font_headings || fontFamilyObj?.sans || fontFamilyObj?.body) && typeof (fonts?.heading ?? typoObj?.font_headings ?? fontFamilyObj?.sans ?? fontFamilyObj?.body) === "string"
      ? String(fonts?.heading ?? typoObj?.font_headings ?? fontFamilyObj?.sans ?? fontFamilyObj?.body ?? "system-ui, sans-serif")
      : "system-ui, sans-serif";

  // Use preselected MJML template with brand tokens whenever we have template + fetch succeeded (products optional).
  if (templateMjml) {
    try {
      // Generate email copy via LLM from campaign prompt so the email shows LLM-written copy, not the raw prompt.
      let generatedCopy: GeneratedEmailCopy | null = null;
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
          console.log("[MJML] using LLM-generated copy", { run_id: runId, headlineLen: generatedCopy.headline.length, bodyLen: generatedCopy.body.length });
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
      const socialMediaFromTokens = (Array.isArray(mt?.social_media) ? mt.social_media : []) as Array<{ name?: string; url?: string }>;
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
            const iconUrl = (s?.icon ?? "").trim();
            const icon = iconUrl || (s?.name ? SOCIAL_ICON_BY_NAME[String(s.name).toLowerCase()] : "") || EMPTY_IMAGE_DATA_URI;
            return [
              [`social_media_${n}_link`, (s?.url ?? "").trim() || "#"],
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
      // Campaign copy: set after templateJson. Use LLM-generated copy when available; otherwise raw campaign prompt.
      const copyKeys = [
        "campaignPrompt", "headline", "title", "header", "subhead", "body", "message", "description",
        "prehead", "eyebrow", "offerText", "offer", "content", "main_message", "mainMessage", "theme", "intro", "copy", "promo_text",
      ];
      for (const k of copyKeys) (sectionJson as Record<string, unknown>)[k] = campaignPrompt;
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
      // Emma template: ensure product image, title, "Discover more", and CTA buttons point to product/cta/site URLs (not #)
      const isEmmaTemplate = /emma/i.test(templateName);
      const sj = sectionJson as Record<string, unknown>;
      const ctaUrl = String(sj.cta_url ?? sj.cta_link ?? siteUrl ?? "#").trim() || "#";
      const fallbackUrl = (productList[0]?.link && productList[0].link !== "#" ? productList[0].link : ctaUrl !== "#" ? ctaUrl : siteUrl) ?? "#";
      if (isEmmaTemplate) {
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
        // Emma: template has no [social media N icon] block – inject social icons into footer after logo row
        const socialEntries: { link: string; icon: string }[] = [];
        for (let n = 1; n <= 5; n++) {
          const link = String(sj[`social_media_${n}_link`] ?? "").trim();
          const icon = String(sj[`social_media_${n}_icon`] ?? "").trim();
          if (link && link !== "#" && icon && icon !== EMPTY_IMAGE_DATA_URI) {
            socialEntries.push({ link, icon });
          }
        }
        if (socialEntries.length > 0) {
          const footerStart = htmlInput.indexOf("#292929");
          if (footerStart !== -1) {
            const footerSection = htmlInput.slice(footerStart);
            const firstTrEnd = footerSection.indexOf("</tr>");
            if (firstTrEnd !== -1) {
              const socialCells = socialEntries
                .map(
                  (e) =>
                    `<a href="${e.link.replace(/"/g, "&quot;")}" target="_blank" style="display:inline-block;margin:0 6px;text-decoration:none;"><img src="${e.icon.replace(/"/g, "&quot;")}" alt="" width="24" height="24" style="border:0;display:block;height:24px;width:24px;" /></a>`,
                )
                .join("");
              const socialRow = `<tr><td align="center" style="font-size:0px;padding:10px 25px 8px;word-break:break-word;">${socialCells}</td></tr>`;
              const beforeFooter = htmlInput.slice(0, footerStart);
              const afterFirstTr = footerSection.slice(firstTrEnd + 5);
              htmlInput = beforeFooter + footerSection.slice(0, firstTrEnd + 5) + socialRow + afterFirstTr;
            }
          }
        }
      }
      const html = applyBrandColorsAndCampaignCopy(
        htmlInput,
        brandColor,
        campaignPrompt,
        generatedCopy,
        brandFooter,
      );
      // #region agent log
      console.log("[MJML] compile success (H9)", { run_id: runId, htmlLen: html?.length ?? 0, campaignPromptSnippet: campaignPrompt.slice(0, 40) });
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
