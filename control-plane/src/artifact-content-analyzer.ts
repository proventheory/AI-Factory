/**
 * Analyze rendered email artifact HTML to verify the template "loaded properly".
 * Used by template proof loop and GET /v1/artifacts/:id/analyze for self-heal.
 * Detects unreplaced placeholders, broken image src, and other load failures.
 */

export interface ArtifactAnalysisIssue {
  code: string;
  severity: "error" | "warn";
  message: string;
  detail?: string;
}

export interface ArtifactAnalysisResult {
  passed: boolean;
  issues: ArtifactAnalysisIssue[];
  /** Summary for template_proof_runs or validations */
  summary?: string;
}

/** Placeholders that must not appear literally in rendered output (runner should replace them). */
const UNREPLACED_PLACEHOLDER_PATTERNS: { pattern: RegExp; code: string; message: string }[] = [
  { pattern: /\[social\s+media\s+icon\]/gi, code: "artifact:unreplaced_social_icon", message: "Unreplaced placeholder [social media icon]" },
  { pattern: /\[image\s+\d+\]/gi, code: "artifact:unreplaced_image_slot", message: "Unreplaced placeholder [image N]" },
  { pattern: /\[hero(\s+image)?\]/gi, code: "artifact:unreplaced_hero", message: "Unreplaced placeholder [hero]" },
  { pattern: /\[banner\]/gi, code: "artifact:unreplaced_banner", message: "Unreplaced placeholder [banner]" },
  { pattern: /\[product\s+[A-Z]\s+(src|image|url)\]/gi, code: "artifact:unreplaced_product_image", message: "Unreplaced product image placeholder" },
  { pattern: /\{\{[^}]+\}\}/g, code: "artifact:unreplaced_handlebars", message: "Unreplaced {{handlebars}} in output" },
];

/** Image src that indicates placeholder not replaced (literal bracket text or empty). */
const BAD_IMG_SRC = /src\s*=\s*["'](\s*|\[[^\]]*\]|\{\{[^}]*\}\})["']/gi;

/** Generic template footer text that should be replaced by brand (visibility for self-heal). */
const GENERIC_FOOTER_PATTERNS: { pattern: RegExp; code: string; message: string }[] = [
  { pattern: /Azure\s+Publishing\s+Inc\.?/i, code: "artifact:generic_footer_company", message: "Generic footer company name (Azure Publishing) not replaced with brand" },
  { pattern: /DESIGN\s+ARCHITECTURE\s+INTERIORS\s+CURIOSITY/i, code: "artifact:generic_footer_nav", message: "Generic footer nav (DESIGN ARCHITECTURE…) not replaced with brand links" },
];

/** Max length to scan for placeholders (avoid huge payload). */
const MAX_SCAN_LENGTH = 500_000;

/** Footer region (last N chars) to check for duplicate social rows and generic text. */
const FOOTER_SCAN_LENGTH = 15_000;

/**
 * Analyze rendered email HTML for common "template didn't load properly" issues.
 * Returns passed: false if any error-severity issue is found.
 */
export function analyzeArtifactContent(html: string): ArtifactAnalysisResult {
  const issues: ArtifactAnalysisIssue[] = [];
  if (!html || typeof html !== "string") {
    return { passed: false, issues: [{ code: "artifact:empty", severity: "error", message: "Artifact content is empty or missing" }] };
  }

  const toScan = html.length > MAX_SCAN_LENGTH ? html.slice(0, MAX_SCAN_LENGTH) : html;

  for (const { pattern, code, message } of UNREPLACED_PLACEHOLDER_PATTERNS) {
    const matches = toScan.match(pattern);
    if (matches && matches.length > 0) {
      issues.push({
        code,
        severity: "error",
        message,
        detail: `Found ${matches.length} occurrence(s): ${matches.slice(0, 3).join(", ")}${matches.length > 3 ? "…" : ""}`,
      });
    }
  }

  const badSrc = toScan.match(BAD_IMG_SRC);
  if (badSrc && badSrc.length > 0) {
    issues.push({
      code: "artifact:bad_image_src",
      severity: "error",
      message: "Image src is unreplaced placeholder or empty",
      detail: `Found ${badSrc.length} img src(s) with placeholder or empty value`,
    });
  }

  // Warn: generic footer text (brand tokens not applied)
  const footerChunk = html.length > FOOTER_SCAN_LENGTH ? html.slice(-FOOTER_SCAN_LENGTH) : html;
  for (const { pattern, code, message } of GENERIC_FOOTER_PATTERNS) {
    if (pattern.test(footerChunk)) {
      issues.push({ code, severity: "warn", message });
    }
  }

  // Warn: duplicate social icon rows (same icon repeated many times or two separate social rows)
  const socialIconMatches = footerChunk.match(/<a\s+href="[^"]*"[^>]*>\s*<img\s+src="data:image\/(?:svg\+xml|gif)[^"]*"[^>]*>/gi);
  const socialCount = socialIconMatches?.length ?? 0;
  if (socialCount > 6) {
    issues.push({
      code: "artifact:duplicate_social_rows",
      severity: "warn",
      message: "Footer has multiple social icon rows or duplicated icons (template/runner should use single row)",
      detail: `Found ${socialCount} social icon <a><img> in footer region`,
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return {
    passed: !hasErrors,
    issues,
    summary: hasErrors
      ? `Template load check failed: ${issues.filter((i) => i.severity === "error").map((i) => i.code).join(", ")}`
      : issues.length > 0
        ? `Passed with warnings: ${issues.map((i) => i.code).join(", ")}`
        : "Template loaded properly",
  };
}
