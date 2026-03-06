/**
 * Build design_tokens for API payloads: canonical paths first + legacy write-through.
 * See docs/BRAND_TOKENS_MIGRATION_MAPPING.md and docs/BRAND_TOKENS_AND_PACKAGES.md.
 * Focuz/Cultura parity: sitemap, social_media, contact_info, asset_urls (zip onboarding).
 */

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
}

export function buildDesignTokens(opts: Partial<DesignTokensInput>): Record<string, unknown> {
  const {
    primaryColor = "#3b82f6",
    secondaryColor = "#64748b",
    fontHeadings,
    fontBody,
    logoUrl,
    wordmarkBold,
    wordmarkLight,
    sitemapUrl,
    sitemapType,
    socialMedia,
    contactInfo,
    assetUrls,
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
    wordmarkBold: "",
    wordmarkLight: "",
    sitemapUrl: "",
    sitemapType: "ecommerce",
    socialMedia: [],
    contactInfo: [],
    assetUrls: [],
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
  return {
    primaryColor: brand?.["500"] ?? brand?.primary ?? empty.primaryColor,
    secondaryColor: brand?.["600"] ?? brand?.primary_dark ?? empty.secondaryColor,
    fontHeadings: (typeof fontHeading === "string" ? fontHeading : null) ?? empty.fontHeadings,
    fontBody: (typeof fontBodyVal === "string" ? fontBodyVal : null) ?? empty.fontBody,
    logoUrl: logo?.url ?? (typeof dt.logo_url === "string" ? dt.logo_url : null) ?? empty.logoUrl,
    wordmarkBold: logo?.wordmark_bold ?? empty.wordmarkBold,
    wordmarkLight: logo?.wordmark_light ?? empty.wordmarkLight,
    sitemapUrl: (typeof dt.sitemap_url === "string" ? dt.sitemap_url : null) ?? (typeof (dt as any).email_sitemap_url === "string" ? (dt as any).email_sitemap_url : "") ?? empty.sitemapUrl,
    sitemapType: (typeof dt.sitemap_type === "string" ? dt.sitemap_type : null) ?? (typeof (dt as any).email_sitemap_type === "string" ? (dt as any).email_sitemap_type : "") ?? empty.sitemapType,
    socialMedia,
    contactInfo,
    assetUrls,
  };
}
