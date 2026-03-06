/**
 * Static template image lint (L001–L010) against MJML.
 * Query: email_templates JOIN template_image_contracts; if contract is null, fail; else run rules.
 * See docs/EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md and runners email-image-contract LINT_RULES.
 */

export const LINT_CODES = [
  "L001", "L002", "L003", "L004", "L005", "L006", "L007", "L008", "L009", "L010",
] as const;

export type LintSeverity = "error" | "warn";

export type LintCode = (typeof LINT_CODES)[number];

export interface LintResult {
  code: LintCode;
  severity: LintSeverity;
  message: string;
  template_id?: string;
  details?: Record<string, unknown>;
}

/** Approved hero placeholders (canonical hero). */
const HERO_PLACEHOLDERS = new Set([
  "[hero]", "[hero image]", "[banner]", "{{hero_image}}", "{{hero_image_url}}", "{{imageUrl}}",
]);
/** Any [bracket] or {{handlebars}} that looks like image. */
const ANY_IMAGE_LIKE = /\[([^\]]+)\]|\{\{([^}]+)\}\}/g;

/** Product module text signals (template has product block but may lack product image placeholder). */
const PRODUCT_TEXT_SIGNALS = [
  "[product title", "[product price", "[product name",
  "{{product_title", "{{product_price", "{{product_name",
];

type Contract = {
  hero_required?: boolean;
  logo_safe_hero?: boolean;
  product_hero_allowed?: boolean;
  mixed_content_and_product_pool?: boolean;
  collapses_empty_modules?: boolean;
  max_content_slots?: number;
  max_product_slots?: number;
  supports_content_images?: boolean;
  supports_product_images?: boolean;
  optional_modules?: unknown[];
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

/**
 * Extract the top/first visual section (hero) from MJML or HTML for hero-specific rules.
 */
export function extractTopSection(body: string): string {
  const normalized = normalizeWhitespace(body);
  const mjSectionSplit = normalized.split(/<mj-section\b/i);
  if (mjSectionSplit.length > 1) {
    const first = mjSectionSplit[1].split(/<\/mj-section>/i)[0];
    return "<mj-section" + (first ?? "") + "</mj-section>";
  }
  const divSplit = normalized.split(/<div\b/i);
  if (divSplit.length > 1) {
    const first = divSplit[1].split(/<\/div>/i)[0];
    return "<div" + (first ?? "") + "</div>";
  }
  return normalized.slice(0, 1200);
}

/**
 * Run L001–L010 against MJML string and contract. Contract must be non-null (caller fails if missing).
 */
export function lintTemplateMjml(mjml: string, contract: Contract, templateId?: string): LintResult[] {
  const out: LintResult[] = [];
  const heroRequired = contract.hero_required ?? true;
  const logoSafeHero = contract.logo_safe_hero ?? false;
  const mixedPool = contract.mixed_content_and_product_pool ?? false;
  const collapsesEmpty = contract.collapses_empty_modules ?? true;
  const maxContentSlots = contract.max_content_slots ?? 0;
  const maxProductSlots = contract.max_product_slots ?? 0;
  const supportsProductImages = contract.supports_product_images ?? false;
  const optionalModules = Array.isArray(contract.optional_modules) ? contract.optional_modules : [];

  // Collect all placeholder-like tokens
  const tokens: { raw: string; normalized: string; num?: number; kind: "hero" | "content" | "product" | "other" }[] = [];
  const contentNums: number[] = [];
  const productNums: number[] = [];
  let m: RegExpExecArray | null;
  ANY_IMAGE_LIKE.lastIndex = 0;
  while ((m = ANY_IMAGE_LIKE.exec(mjml)) !== null) {
    const raw = m[0];
    const insideBracket = m[1] ?? "";
    const insideHandlebars = m[2] ?? "";
    const content = (insideBracket || insideHandlebars).trim().toLowerCase();
    const heroNorm = raw.replace(/\s+/g, " ").toLowerCase();
    if (HERO_PLACEHOLDERS.has(heroNorm) || content === "hero image" || content === "hero_image" || content === "hero_image_url" || content === "imageurl" || content === "banner") {
      tokens.push({ raw, normalized: "hero", kind: "hero" });
    } else if (/^image\s*\d+$/.test(content) || /^image_\d+$/.test(content)) {
      const num = parseInt(content.replace(/\D/g, ""), 10) || 1;
      contentNums.push(num);
      tokens.push({ raw, normalized: `content:${num}`, num, kind: "content" });
    } else if (/^product\s*image\s*\d+$/.test(content) || /^product_image_\d+$/.test(content)) {
      const num = parseInt(content.replace(/\D/g, ""), 10) || 1;
      productNums.push(num);
      tokens.push({ raw, normalized: `product:${num}`, num, kind: "product" });
    } else if (/image|img|hero|banner|logo|product/.test(content)) {
      tokens.push({ raw, normalized: raw, kind: "other" });
    }
  }

  const topBlock = extractTopSection(mjml);

  // L001: unsupported image placeholder
  for (const t of tokens) {
    if (t.kind === "other") {
      out.push({
        code: "L001",
        severity: "error",
        message: `Unsupported image placeholder: ${t.raw}`,
        template_id: templateId,
        details: { placeholder: t.raw },
      });
    }
  }

  const hasHeroInTop =
    topBlock.includes("[hero]") || topBlock.includes("[hero image]") || topBlock.includes("[banner]")
    || topBlock.includes("{{hero_image}}") || topBlock.includes("{{hero_image_url}}") || topBlock.includes("{{imageUrl}}");
  const hasContentPlaceholderInTop = /\[image\s+1\]/i.test(topBlock) || /\{\{.*image.*1.*\}\}/.test(topBlock);

  // L002: hero section uses content placeholder
  if (hasContentPlaceholderInTop && !hasHeroInTop) {
    out.push({
      code: "L002",
      severity: "error",
      message: "Hero section uses content placeholder [image 1] instead of hero",
      template_id: templateId,
      details: { placeholder: "[image 1]" },
    });
  }

  // L003: hero depends on logo but template not logo_safe
  const heroDependsOnLogo = topBlock.includes("{{logo_url}}") || topBlock.includes("{{logo}}") || topBlock.includes("[logo]");
  if (heroDependsOnLogo && !logoSafeHero && heroRequired) {
    out.push({
      code: "L003",
      severity: "error",
      message: "Hero depends on logo but template not logo_safe_hero",
      template_id: templateId,
      details: { logo_safe_hero: logoSafeHero },
    });
  }

  // L004: missing hero in hero_required
  const hasAnyHero = tokens.some((t) => t.kind === "hero");
  if (heroRequired && !hasAnyHero) {
    out.push({
      code: "L004",
      severity: "error",
      message: "Missing hero in hero-required template",
      template_id: templateId,
      details: { hero_required: heroRequired },
    });
  }

  // L005: repeated hero leakage (warn)
  const heroCount = tokens.filter((t) => t.kind === "hero").length;
  if (heroCount > 1) {
    out.push({
      code: "L005",
      severity: "warn",
      message: `Repeated hero placeholder (${heroCount}x); confirm intentional.`,
      template_id: templateId,
      details: { heroCount },
    });
  }

  // L006: product module missing product image (use product text signals like reference)
  const hasProductTextSignals = PRODUCT_TEXT_SIGNALS.some((s) => mjml.toLowerCase().includes(s.toLowerCase()));
  const hasProductImagePlaceholder = productNums.length > 0;
  if (hasProductTextSignals && !hasProductImagePlaceholder && supportsProductImages) {
    out.push({
      code: "L006",
      severity: "warn",
      message: "Template appears to contain product modules but no product image placeholder was found.",
      template_id: templateId,
      details: { supports_product_images: supportsProductImages },
    });
  }

  // L007: content slot exceeds max
  const maxContentNum = contentNums.length > 0 ? Math.max(...contentNums) : 0;
  if (maxContentSlots > 0 && maxContentNum > maxContentSlots) {
    out.push({
      code: "L007",
      severity: "error",
      message: `Content slot exceeds max_content_slots (${maxContentNum} > ${maxContentSlots})`,
      template_id: templateId,
      details: { maxIndex: maxContentNum, max_content_slots: maxContentSlots },
    });
  }

  // L008: product slot exceeds max
  const maxProductNum = productNums.length > 0 ? Math.max(...productNums) : 0;
  if (maxProductSlots > 0 && maxProductNum > maxProductSlots) {
    out.push({
      code: "L008",
      severity: "error",
      message: `Product slot exceeds max_product_slots (${maxProductNum} > ${maxProductSlots})`,
      template_id: templateId,
      details: { maxIndex: maxProductNum, max_product_slots: maxProductSlots },
    });
  }

  // L009: optional module no collapse — only when contract has optional_modules and collapses_empty_modules is false
  const hasOptionalModules = optionalModules.length > 0;
  if (hasOptionalModules && !collapsesEmpty) {
    out.push({
      code: "L009",
      severity: "error",
      message: "Template has optional image modules but contract says empty modules do not collapse.",
      template_id: templateId,
      details: { optional_modules_count: optionalModules.length, collapses_empty_modules: collapsesEmpty },
    });
  }

  // L010: mixed pool without flag
  const usesBothContentAndProduct = contentNums.length > 0 && productNums.length > 0;
  if (usesBothContentAndProduct && !mixedPool) {
    out.push({
      code: "L010",
      severity: "warn",
      message: "Template mixes content and product placeholders without mixed_content_and_product_pool",
      template_id: templateId,
      details: { mixed_content_and_product_pool: mixedPool },
    });
  }

  return out;
}

/**
 * Format lint issues for logging or API display.
 */
export function formatLintIssues(issues: LintResult[]): string {
  if (issues.length === 0) return "No lint issues found.";
  return issues
    .map((i) => `${i.severity.toUpperCase()} ${i.code}: ${i.message}`)
    .join("\n");
}
