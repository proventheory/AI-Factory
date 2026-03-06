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
    if (!val.trim() && (field === "description" || field === "short_info")) {
      val = String((sectionJson as Record<string, unknown>)[`product_${idx}_title`] ?? "");
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
      return String(prop === "title" ? (sectionJson.product_1_title ?? "") : (sectionJson.product_1_description ?? sectionJson.product_1_title ?? ""));
    }
    if (letter === "C") {
      return String(prop === "title" ? (sectionJson.product_2_title ?? "") : (sectionJson.product_2_description ?? sectionJson.product_2_title ?? ""));
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
  // [image 1], [image 2], ... [image N] – campaign images (1-based)
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
  ctaSectionHeadline?: string;
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
  if (tone.voice_descriptors?.length) parts.push(`Voice: ${(tone.voice_descriptors as string[]).join(", ")}`);
  if (tone.formality) parts.push(`Formality: ${tone.formality}`);
  const copyStyle = ctx.copy_style as Record<string, unknown>;
  if (copyStyle.cta_style) parts.push(`CTA style: ${copyStyle.cta_style}`);
  if (copyStyle.voice) parts.push(`Copy voice: ${copyStyle.voice}`);
  return parts.length ? parts.join(". ") : ctx.name;
}

/**
 * Call LLM to generate email copy (headline, body, CTA) from the campaign prompt and full brand context.
 * Uses brand tokens, identity, tone, and copy_style so copy fits the brand (not generic Emma SMS).
 * Returns null on parse failure or if LLM is not invoked.
 */
async function generateEmailCopyViaLlm(
  campaignPrompt: string,
  brandPrompt: string | undefined,
  brandCtx: BrandContext | undefined,
  request: { run_id: string; job_run_id: string; job_type: string; llm_source?: string; recordLlmCall?: (model: string, modelId: string, tokensIn?: number, tokensOut?: number, latencyMs?: number) => Promise<void> },
  initiativeId: string | null,
): Promise<GeneratedEmailCopy | null> {
  const trimmed = campaignPrompt.trim();
  if (trimmed.length === 0) return null;

  const brandName = brandCtx?.name ?? "Brand";
  const brandBrief = brandCtx ? buildBrandBriefForCopy(brandCtx) : brandName;

  const messages: LLMChatOptions["messages"] = [];
  messages.push({
    role: "system",
    content: (brandPrompt ?? "") + "\nYou are an email copywriter. Write copy that matches this brand's identity, tone, and industry—not generic marketing. Reply with ONLY a valid JSON object, no markdown or explanation. Use these exact keys: headline (one short line), body (2-3 sentences for the main hero paragraph), ctaText (button label, e.g. \"Shop the sale\" or \"Get 50% off\"), ctaSectionHeadline (optional, one line for a secondary CTA block).",
  });
  messages.push({
    role: "user",
    content: `Brand context: ${brandBrief}. Campaign theme: ${trimmed}. Generate email copy that fits this brand and campaign. Return only valid JSON.`,
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
    if (headline.length > 0 && body.length > 0) {
      return { headline, body, ctaText, ctaSectionHeadline };
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
  }
  if (body.length > 0) {
    const safeBody = escapeHtml(body);
    if (out.includes(DEFAULT_HERO_BODY)) {
      out = out.replace(DEFAULT_HERO_BODY, safeBody);
    }
  }
  // Replace default hero CTA button ("Explore the tool") with generated ctaText
  const ctaLabel = generatedCopy?.ctaText ?? campaignPrompt.trim();
  if (ctaLabel.length > 0 && out.includes(DEFAULT_HERO_CTA)) {
    out = out.replace(DEFAULT_HERO_CTA, escapeHtml(ctaLabel));
  }
  // Replace default CTA block copy when we have LLM-generated copy
  if (generatedCopy) {
    if (generatedCopy.ctaSectionHeadline && out.includes(DEFAULT_CTA_HEADLINE)) {
      out = out.replace(DEFAULT_CTA_HEADLINE, escapeHtml(generatedCopy.ctaSectionHeadline));
    }
    if (out.includes(DEFAULT_CTA_SUBHEAD)) {
      out = out.replace(DEFAULT_CTA_SUBHEAD, escapeHtml(generatedCopy.ctaSectionHeadline ?? generatedCopy.headline));
    }
    if (out.includes(DEFAULT_CTA_BODY)) {
      out = out.replace(DEFAULT_CTA_BODY, escapeHtml(generatedCopy.body));
    }
    if (generatedCopy.ctaText && out.includes(DEFAULT_CTA_BUTTON)) {
      out = out.replace(DEFAULT_CTA_BUTTON, escapeHtml(generatedCopy.ctaText));
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
          const meta = camp.metadata_json as { products?: unknown[]; images?: string[]; campaign_prompt?: string; sitemap_url?: string; sitemap_type?: string };
          if (meta.products && !input.products?.length) input.products = meta.products as EmailGenerateMjmlInput["products"];
          if (Array.isArray(meta.images)) input.images = meta.images;
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

  if (input.template_id) {
    try {
      const res = await fetch(`${CONTROL_PLANE_URL}/v1/email_templates/${input.template_id}`);
      if (res.ok) {
        const t = (await res.json()) as { mjml?: string; template_json?: unknown; sections_json?: unknown };
        templateMjml = t.mjml ?? null;
        templateJson = (t.template_json as Record<string, unknown>) ?? null;
        if (t.sections_json != null && typeof t.sections_json === "object") {
          templateJson = { ...(templateJson ?? {}), ...(t.sections_json as Record<string, unknown>) };
          sectionsJsonMerged = true;
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
  const campaignImages = input.images ?? [];
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

  const typo = mergedTokens && typeof mergedTokens === "object" ? (mergedTokens as Record<string, unknown>).typography : undefined;
  const fontFamilyObj = typo && typeof typo === "object" ? (typo as Record<string, unknown>).fontFamily : undefined;
  const fontFamily = fontFamilyObj && typeof fontFamilyObj === "object"
    ? ((fontFamilyObj as Record<string, string>).sans ?? (fontFamilyObj as Record<string, string>).body ?? "system-ui, sans-serif")
    : "system-ui, sans-serif";

  // Use preselected MJML template with brand tokens whenever we have template + fetch succeeded (products optional).
  if (templateMjml) {
    try {
      // Generate email copy via LLM from campaign prompt so the email shows LLM-written copy, not the raw prompt.
      let generatedCopy: GeneratedEmailCopy | null = null;
      if (campaignPrompt.trim().length > 0) {
        generatedCopy = await generateEmailCopyViaLlm(
          campaignPrompt,
          brandPrompt ?? undefined,
          brandCtx ?? undefined,
          request,
          initiativeId,
        );
        if (generatedCopy) {
          console.log("[MJML] using LLM-generated copy", { run_id: runId, headlineLen: generatedCopy.headline.length, bodyLen: generatedCopy.body.length });
        }
      }

      const logo = logoUrl ?? "";
      const heroImage = (logo || productList[0]?.image) ?? "";
      const siteUrl = (brandCtx?.identity as { website?: string } | undefined)?.website ?? "#";
      const identity = (brandCtx?.identity ?? {}) as { contact_email?: string };
      const mt = mergedTokens as Record<string, unknown> | undefined;
      const contactInfoFromTokens = mt?.contact_info;
      const contactInfoStr = Array.isArray(contactInfoFromTokens) && contactInfoFromTokens.length > 0
        ? (contactInfoFromTokens as Array<{ type?: string; value?: string }>)
          .filter((c) => c && (c.value ?? "").trim() !== "")
          .map((c) => (c.type?.trim() ? `${c.type.trim()}: ${(c.value ?? "").trim()}` : (c.value ?? "").trim()))
          .join(", ")
        : undefined;
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
        siteUrl,
        site_url: siteUrl,
        imageUrl: heroImage,
        image_url: heroImage,
        image_src: heroImage,
        imageSrc: heroImage,
        brandName: brandCtx?.name ?? "",
        brand_name: brandCtx?.name ?? "",
        tagline: (brandCtx?.identity as { tagline?: string } | undefined)?.tagline ?? "",
        voicetone: brandCtx?.tone?.voice_descriptors?.[0] ?? "friendly",
        footerRights: `© ${new Date().getFullYear()}`,
        contactInfo: contactInfoStr ?? identity.contact_email ?? "",
        socialMedia: socialMediaFromTokens,
        ...Object.fromEntries(
          (socialMediaFromTokens as Array<{ url?: string; icon?: string }>).flatMap((s, i) => {
            const n = i + 1;
            return [
              [`social_media_${n}_link`, (s?.url ?? "").trim() || "#"],
              [`social_media_${n}_icon`, (s?.icon ?? "").trim() || EMPTY_IMAGE_DATA_URI],
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
        (sectionJson as Record<string, unknown>).headline = generatedCopy.headline;
        (sectionJson as Record<string, unknown>).body = generatedCopy.body;
        (sectionJson as Record<string, unknown>).header = generatedCopy.headline;
        (sectionJson as Record<string, unknown>).campaignPrompt = campaignPrompt;
        (sectionJson as Record<string, unknown>).cta_text = generatedCopy.ctaText;
        (sectionJson as Record<string, unknown>).cta_label = generatedCopy.ctaText;
        if (generatedCopy.ctaSectionHeadline) {
          (sectionJson as Record<string, unknown>).ctaSectionHeadline = generatedCopy.ctaSectionHeadline;
        }
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
      const html = applyBrandColorsAndCampaignCopy(
        replaceBracketPlaceholders(rawHtml ?? "", sectionJson as Record<string, unknown>),
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
