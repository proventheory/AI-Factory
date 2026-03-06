/**
 * Build design_tokens for API payloads: canonical paths first + legacy write-through.
 * See docs/BRAND_TOKENS_MIGRATION_MAPPING.md and docs/BRAND_TOKENS_AND_PACKAGES.md.
 * For merge/validate/derive use packages/tokens TokenService.
 */

export interface DesignTokensInput {
  primaryColor: string;
  secondaryColor: string;
  fontHeadings: string;
  fontBody: string;
  logoUrl: string;
  wordmarkBold: string;
  wordmarkLight: string;
}

export function buildDesignTokens(opts: DesignTokensInput): Record<string, unknown> {
  const {
    primaryColor,
    secondaryColor,
    fontHeadings,
    fontBody,
    logoUrl,
    wordmarkBold,
    wordmarkLight,
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
  if (wordmarkBold.trim() || wordmarkLight.trim()) {
    logo.wordmark_bold = wordmarkBold.trim();
    logo.wordmark_light = wordmarkLight.trim();
    logo.type = "wordmark";
  }
  if (Object.keys(logo).length) tokens.logo = { ...(tokens.logo as object), ...logo };
  return tokens;
}

/** Read design_tokens from API: prefer canonical paths, fallback to legacy. */
export function readDesignTokensFromBrand(dt: Record<string, unknown> | null | undefined): DesignTokensInput {
  const empty = {
    primaryColor: "#3b82f6",
    secondaryColor: "#64748b",
    fontHeadings: "Inter",
    fontBody: "Inter",
    logoUrl: "",
    wordmarkBold: "",
    wordmarkLight: "",
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
  return {
    primaryColor: brand?.["500"] ?? brand?.primary ?? empty.primaryColor,
    secondaryColor: brand?.["600"] ?? brand?.primary_dark ?? empty.secondaryColor,
    fontHeadings: (typeof fontHeading === "string" ? fontHeading : null) ?? empty.fontHeadings,
    fontBody: (typeof fontBodyVal === "string" ? fontBodyVal : null) ?? empty.fontBody,
    logoUrl: logo?.url ?? (typeof dt.logo_url === "string" ? dt.logo_url : null) ?? empty.logoUrl,
    wordmarkBold: logo?.wordmark_bold ?? empty.wordmarkBold,
    wordmarkLight: logo?.wordmark_light ?? empty.wordmarkLight,
  };
}
