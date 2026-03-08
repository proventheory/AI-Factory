/**
 * Build design_tokens for API payloads: canonical paths first + legacy write-through.
 * See docs/BRAND_TOKENS_MIGRATION_MAPPING.md and docs/BRAND_TOKENS_AND_PACKAGES.md.
 * Focuz/Cultura parity: sitemap, social_media, contact_info, asset_urls (zip onboarding).
 * Brand System View: full palette/typography read path, resolved-token helper, completeness.
 */

import { tokens as defaultTokens } from "@/design-tokens/tokens";

export interface SocialLink {
  name: string;
  url: string;
}

export interface ContactItem {
  type: string;
  value: string;
}

export interface DesignTokensInput {
  primaryColor: string;
  secondaryColor: string;
  fontHeadings: string;
  fontBody: string;
  logoUrl: string;
  /** White/inverted logo for dark backgrounds (e.g. email headers). */
  logoUrlWhite: string;
  wordmarkBold: string;
  wordmarkLight: string;
  /** Canonical product sitemap URL (email/initiatives can use this). */
  sitemapUrl: string;
  /** e.g. ecommerce, shopify, drupal, bigcommerce */
  sitemapType: string;
  socialMedia: SocialLink[];
  contactInfo: ContactItem[];
  /** Image/asset URLs for the brand (hero, thumbnails, etc.). */
  assetUrls: string[];
  /** CTA button label (e.g. "Shop now"). Used in emails when LLM does not override. */
  ctaText: string;
  /** CTA button URL. Used in emails when LLM does not override. */
  ctaLink: string;
}

/** Full brand color palette (scale keys + optional neutral). Additive read for Brand System View. */
export interface BrandPalette {
  brand: Record<string, string>;
  neutral: Record<string, string>;
}

/** Typography families and scale for Brand System View. */
export interface BrandTypography {
  fontHeadings: string;
  fontBody: string;
  fontMono: string;
  heading: Record<string, { size: string; weight: number; lineHeight: number }>;
  body: { default: { size: string; weight: number; lineHeight: number }; small: { size: string; weight: number; lineHeight: number } };
  caption: { size: string; weight: number; lineHeight: number };
  small: { size: string; weight: number; lineHeight: number };
  fontWeight: Record<string, number>;
}

/** Completeness levels per docs/BRAND_DECK_REFERENCE_SCHEMA.md */
export type CompletenessLevel = "Minimal" | "Standard" | "Complete";
export type ReadinessLevel = "Partial" | "Ready";

export interface BrandCompleteness {
  color: CompletenessLevel;
  typography: CompletenessLevel;
  deck: ReadinessLevel;
  report: ReadinessLevel;
  email: ReadinessLevel;
}

/** Resolved token entry for "why did my report use this value?" */
export type ResolvedTokenSource = "explicit" | "inherited" | "default" | "missing";

export interface ResolvedTokenEntry {
  path: string;
  value: unknown;
  source: ResolvedTokenSource;
}

export function buildDesignTokens(opts: Partial<DesignTokensInput>): Record<string, unknown> {
  const {
    primaryColor = "#3b82f6",
    secondaryColor = "#64748b",
    fontHeadings,
    fontBody,
    logoUrl,
    logoUrlWhite,
    wordmarkBold,
    wordmarkLight,
    sitemapUrl,
    sitemapType,
    socialMedia,
    contactInfo,
    assetUrls,
    ctaText,
    ctaLink,
  } = opts;
  const colors = {
    brand: {
      "500": primaryColor,
      "600": secondaryColor,
      primary: primaryColor,
      primary_dark: secondaryColor,
    },
  };
  const tokens: Record<string, unknown> = {
    colors,
    color: { brand: { "500": primaryColor, "600": secondaryColor } },
  };
  if (fontHeadings || fontBody) {
    tokens.typography = {
      fonts: { heading: fontHeadings, body: fontBody },
      font_headings: fontHeadings,
      font_body: fontBody,
    };
  }
  const logo: Record<string, string> = {};
  if (logoUrl) {
    logo.url = logoUrl;
    tokens.logo_url = logoUrl;
  }
  if (logoUrlWhite?.trim()) {
    logo.url_white = logoUrlWhite.trim();
    tokens.logo_white_url = logoUrlWhite.trim();
  }
  if (wordmarkBold?.trim() || wordmarkLight?.trim()) {
    logo.wordmark_bold = (wordmarkBold ?? "").trim();
    logo.wordmark_light = (wordmarkLight ?? "").trim();
    logo.type = "wordmark";
  }
  if (Object.keys(logo).length) tokens.logo = { ...(tokens.logo as object), ...logo };
  if (sitemapUrl !== undefined) tokens.sitemap_url = sitemapUrl;
  if (sitemapType !== undefined) tokens.sitemap_type = sitemapType;
  if (socialMedia !== undefined) tokens.social_media = socialMedia;
  if (contactInfo !== undefined) tokens.contact_info = contactInfo;
  if (assetUrls !== undefined) tokens.asset_urls = assetUrls;
  if (ctaText !== undefined) tokens.cta_text = ctaText;
  if (ctaLink !== undefined) tokens.cta_link = ctaLink;
  return tokens;
}

/** Read design_tokens from API: prefer canonical paths, fallback to legacy; includes Focuz-style sitemap/social/contact/assets. */
export function readDesignTokensFromBrand(dt: Record<string, unknown> | null | undefined): DesignTokensInput {
  const empty: DesignTokensInput = {
    primaryColor: "#3b82f6",
    secondaryColor: "#64748b",
    fontHeadings: "Inter",
    fontBody: "Inter",
    logoUrl: "",
    logoUrlWhite: "",
    wordmarkBold: "",
    wordmarkLight: "",
    sitemapUrl: "",
    sitemapType: "ecommerce",
    socialMedia: [],
    contactInfo: [],
    assetUrls: [],
    ctaText: "",
    ctaLink: "",
  };
  if (!dt || typeof dt !== "object") return empty;
  const colors = dt.colors as Record<string, Record<string, string>> | undefined;
  const colorLegacy = dt.color as Record<string, Record<string, string>> | undefined;
  const brand = colors?.brand ?? colorLegacy?.brand;
  const typo = dt.typography as Record<string, unknown> | undefined;
  const fonts = typo?.fonts as Record<string, string> | undefined;
  const logo = dt.logo as Record<string, string> | undefined;
  const fontHeading = fonts?.heading ?? typo?.font_headings;
  const fontBodyVal = fonts?.body ?? typo?.font_body;
  const socialMedia = Array.isArray(dt.social_media)
    ? (dt.social_media as SocialLink[]).filter((s) => s && typeof s.name === "string" && typeof s.url === "string")
    : [];
  const contactInfo = Array.isArray(dt.contact_info)
    ? (dt.contact_info as ContactItem[]).filter((c) => c && typeof c.type === "string" && typeof c.value === "string")
    : [];
  const assetUrls = Array.isArray(dt.asset_urls)
    ? (dt.asset_urls as string[]).filter((u) => typeof u === "string" && u.trim() !== "")
    : [];
  const ctaText = typeof dt.cta_text === "string" ? dt.cta_text : "";
  const ctaLink = typeof dt.cta_link === "string" ? dt.cta_link : "";
  const rec = dt as Record<string, unknown>;
  const sitemapUrlVal =
    (typeof dt.sitemap_url === "string" ? dt.sitemap_url : null) ??
    (typeof rec.brand_sitemap_url === "string" ? rec.brand_sitemap_url : null) ??
    (typeof rec.email_sitemap_url === "string" ? rec.email_sitemap_url : "") ??
    empty.sitemapUrl;
  const sitemapTypeVal =
    (typeof dt.sitemap_type === "string" ? dt.sitemap_type : null) ??
    (typeof rec.brand_sitemap_type === "string" ? rec.brand_sitemap_type : null) ??
    (typeof rec.email_sitemap_type === "string" ? rec.email_sitemap_type : "") ??
    empty.sitemapType;
  return {
    primaryColor: brand?.["500"] ?? brand?.primary ?? empty.primaryColor,
    secondaryColor: brand?.["600"] ?? brand?.primary_dark ?? empty.secondaryColor,
    fontHeadings: (typeof fontHeading === "string" ? fontHeading : null) ?? empty.fontHeadings,
    fontBody: (typeof fontBodyVal === "string" ? fontBodyVal : null) ?? empty.fontBody,
    logoUrl: logo?.url ?? (typeof dt.logo_url === "string" ? dt.logo_url : null) ?? empty.logoUrl,
    logoUrlWhite: logo?.url_white ?? (typeof dt.logo_white_url === "string" ? dt.logo_white_url : null) ?? empty.logoUrlWhite,
    wordmarkBold: logo?.wordmark_bold ?? empty.wordmarkBold,
    wordmarkLight: logo?.wordmark_light ?? empty.wordmarkLight,
    sitemapUrl: sitemapUrlVal,
    sitemapType: sitemapTypeVal,
    socialMedia,
    contactInfo,
    assetUrls,
    ctaText,
    ctaLink,
  };
}

const SCALE_KEYS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];

/** Full palette from design_tokens for Brand System View. Additive; does not mutate or remove legacy keys. */
export function getBrandPalette(dt: Record<string, unknown> | null | undefined): BrandPalette {
  const defBrand = (defaultTokens as unknown as Record<string, Record<string, Record<string, string>>>).color?.brand ?? {};
  const defNeutral = (defaultTokens as unknown as Record<string, Record<string, Record<string, string>>>).color?.neutral ?? {};
  const colors = (dt?.colors ?? dt?.color) as Record<string, Record<string, string>> | undefined;
  const brand = (colors?.brand ?? {}) as Record<string, string>;
  const neutral = (colors?.neutral ?? (dt?.color as Record<string, Record<string, string>>)?.neutral ?? {}) as Record<string, string>;
  return {
    brand: Object.keys(brand).length ? brand : (defBrand as Record<string, string>),
    neutral: Object.keys(neutral).length ? neutral : (defNeutral as Record<string, string>),
  };
}

/** Full typography from design_tokens + defaults for Brand System View. */
export function getBrandTypography(dt: Record<string, unknown> | null | undefined): BrandTypography {
  const def = defaultTokens as unknown as Record<string, Record<string, unknown>>;
  const typo = dt?.typography as Record<string, unknown> | undefined;
  const fonts = typo?.fonts as Record<string, string> | undefined;
  const heading = (typo?.heading ?? def?.typography?.heading) as Record<string, { size: string; weight: number; lineHeight: number }>;
  const body = (typo?.body ?? def?.typography?.body) as { default: { size: string; weight: number; lineHeight: number }; small: { size: string; weight: number; lineHeight: number } };
  const caption = (typo?.caption ?? def?.typography?.caption) as { size: string; weight: number; lineHeight: number };
  const small = (typo?.small ?? def?.typography?.small) as { size: string; weight: number; lineHeight: number };
  const fontWeight = (typo?.fontWeight ?? def?.typography?.fontWeight) as Record<string, number>;
  const defFonts = def?.typography?.fontFamily as Record<string, string> | undefined;
  return {
    fontHeadings: (fonts?.heading ?? typo?.font_headings ?? defFonts?.sans ?? "Inter") as string,
    fontBody: (fonts?.body ?? typo?.font_body ?? defFonts?.sans ?? "Inter") as string,
    fontMono: (defFonts?.mono ?? "ui-monospace, monospace") as string,
    heading: heading ?? {},
    body: body ?? { default: { size: "1rem", weight: 400, lineHeight: 1.5 }, small: { size: "0.875rem", weight: 400, lineHeight: 1.5 } },
    caption: caption ?? { size: "0.875rem", weight: 400, lineHeight: 1.4 },
    small: small ?? { size: "0.75rem", weight: 400, lineHeight: 1.4 },
    fontWeight: fontWeight ?? { normal: 400, medium: 500, semibold: 600, bold: 700 },
  };
}

/** Completeness from design_tokens + deck_theme + report_theme per docs/BRAND_DECK_REFERENCE_SCHEMA.md */
export function getBrandCompleteness(
  dt: Record<string, unknown> | null | undefined,
  deckTheme?: Record<string, unknown> | null,
  reportTheme?: Record<string, unknown> | null
): BrandCompleteness {
  const colors = (dt?.colors ?? dt?.color) as Record<string, Record<string, string>> | undefined;
  const brand = colors?.brand ?? {};
  const neutral = colors?.neutral ?? (dt?.color as Record<string, Record<string, string>>)?.neutral ?? {};
  const typo = dt?.typography as Record<string, unknown> | undefined;
  const fonts = typo?.fonts as Record<string, string> | undefined;
  const has500 = typeof brand["500"] === "string" || typeof (brand as Record<string, string>).primary === "string";
  const has600 = typeof brand["600"] === "string" || typeof (brand as Record<string, string>).primary_dark === "string";
  const brandKeys = Object.keys(brand).filter((k) => /^\d+$/.test(k) || k === "primary" || k === "primary_dark");
  const numericCount = Object.keys(brand).filter((k) => /^\d+$/.test(k)).length;
  const hasNeutral = Object.keys(neutral).length > 0;
  const colorLevel: CompletenessLevel =
    numericCount >= 5 || (numericCount >= 3 && (brandKeys.length >= 3 || hasNeutral)) ? "Complete" : numericCount >= 3 || (has500 && has600 && (hasNeutral || brandKeys.length >= 3)) ? "Standard" : has500 || has600 ? "Minimal" : "Minimal";
  const hasHeading = !!(fonts?.heading ?? typo?.font_headings);
  const hasBody = !!(fonts?.body ?? typo?.font_body);
  const hasScale = !!(typo?.heading && typeof (typo.heading as object) === "object") || !!(typo?.fontSize);
  const hasWeights = !!(typo?.fontWeight && Object.keys(typo.fontWeight as object).length > 0);
  const typoLevel: CompletenessLevel = hasHeading && hasBody && hasScale && hasWeights ? "Complete" : hasHeading && hasBody && (hasScale || hasWeights) ? "Standard" : hasHeading || hasBody ? "Minimal" : "Minimal";
  const deckReady: ReadinessLevel = deckTheme && typeof deckTheme === "object" && (Array.isArray(deckTheme.chart_color_sequence) || (deckTheme.slide_master && typeof deckTheme.slide_master === "object")) ? "Ready" : "Partial";
  const reportReady: ReadinessLevel = reportTheme && typeof reportTheme === "object" && (reportTheme.header_style !== undefined || reportTheme.section_spacing !== undefined) ? "Ready" : "Partial";
  const emailReady: ReadinessLevel = (has500 || (brand as Record<string, string>).primary) && (typeof (dt?.cta_text ?? dt?.cta_link) === "string" || true) ? "Ready" : "Partial";
  return { color: colorLevel, typography: typoLevel, deck: deckReady, report: reportReady, email: emailReady };
}

function getByPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  let current: unknown = obj;
  for (const p of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

/** Resolved token entries for a set of important paths. Used for "why did my report use this value?" */
export function getResolvedTokenEntries(
  dt: Record<string, unknown> | null | undefined,
  paths: string[]
): ResolvedTokenEntry[] {
  const defaults = defaultTokens as unknown as Record<string, unknown>;
  return paths.map((path) => {
    const brandVal = dt && getByPath(dt, path);
    const defaultPath = path.replace(/^colors\./, "color.");
    const defaultVal = getByPath(defaults, defaultPath);
    if (brandVal !== undefined && brandVal !== null) {
      return { path, value: brandVal, source: "explicit" as ResolvedTokenSource };
    }
    if (defaultVal !== undefined && defaultVal !== null) {
      return { path, value: defaultVal, source: "default" as ResolvedTokenSource };
    }
    return { path, value: undefined, source: "missing" as ResolvedTokenSource };
  });
}
