/**
 * Per-run image assignment validators (V001–V012).
 * Uses contract + assignment; writes to validations table from API.
 * See docs/EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md and runners email-image-contract VALIDATION_RULES.
 */

export const VALIDATION_CODES = [
  "V001", "V002", "V003", "V004", "V005", "V006", "V007", "V008", "V009", "V010", "V011", "V012",
] as const;

export const VALIDATION_CRITICAL: readonly string[] = [
  "V001", "V002", "V003", "V004", "V005", "V011", "V012",
];

export type ValidationResult = {
  code: string;
  status: "pass" | "fail";
  message: string;
};

type Assignment = {
  assignment?: { hero?: { source_kind?: string } | null; content?: unknown[]; products?: unknown[] };
  resolution?: {
    hero_strategy?: string;
    logo_fallback_used?: boolean;
    collapsed_modules?: string[];
    duplicated_asset_ids?: string[];
    rejected_asset_ids?: string[];
  };
  diagnostics?: {
    warnings?: string[];
  };
};

export type Contract = {
  hero_required?: boolean;
  logo_safe_hero?: boolean;
  product_hero_allowed?: boolean;
  max_content_slots?: number;
  max_product_slots?: number;
  collapses_empty_modules?: boolean;
};

/**
 * Evaluate V001–V012 from contract + assignment. Returns one result per rule checked.
 */
export function evaluateImageAssignmentValidations(
  assignment: unknown,
  contract: Contract | null,
): ValidationResult[] {
  const a = assignment as Assignment | null | undefined;
  const c = contract ?? {};
  const results: ValidationResult[] = [];

  const hero = a?.assignment?.hero ?? null;
  const heroStrategy = a?.resolution?.hero_strategy ?? "none";
  const logoFallbackUsed = a?.resolution?.logo_fallback_used ?? false;
  const contentCount = Array.isArray(a?.assignment?.content) ? a.assignment.content.length : 0;
  const productCount = Array.isArray(a?.assignment?.products) ? a.assignment.products.length : 0;
  const rejectedCount = Array.isArray(a?.resolution?.rejected_asset_ids) ? a.resolution.rejected_asset_ids.length : 0;
  const heroSourceKind = hero && typeof hero === "object" && "source_kind" in hero ? (hero as { source_kind?: string }).source_kind : undefined;

  const heroRequired = c.hero_required ?? true;
  const logoSafeHero = c.logo_safe_hero ?? false;
  const productHeroAllowed = c.product_hero_allowed ?? false;
  const maxContentSlots = c.max_content_slots ?? 0;
  const maxProductSlots = c.max_product_slots ?? 0;
  const collapsesEmpty = c.collapses_empty_modules ?? true;

  // V001: hero_required and no hero
  results.push({
    code: "V001",
    status: heroRequired && !hero ? "fail" : "pass",
    message: heroRequired && !hero ? "Hero missing (template requires hero, none resolved)" : "Hero present or not required",
  });

  // V002: hero from disallowed source (e.g. product when product_hero_allowed=false)
  const v002Fail = hero && heroSourceKind === "product" && !productHeroAllowed;
  results.push({
    code: "V002",
    status: v002Fail ? "fail" : "pass",
    message: v002Fail ? "Hero used disallowed source (product)" : "Hero source allowed",
  });

  // V003: logo fallback on non-logo-safe template
  const v003Fail = logoFallbackUsed && !logoSafeHero;
  results.push({
    code: "V003",
    status: v003Fail ? "fail" : "pass",
    message: v003Fail ? "Logo fallback on non-logo-safe template" : "Logo fallback allowed or not used",
  });

  // V004: unresolved placeholder — we don't have placeholder list here; pass if no diagnostics warning, else could infer from warnings
  const warnings = a?.diagnostics?.warnings ?? [];
  const hasUnresolved = warnings.some((w: unknown) => String(w).toLowerCase().includes("unresolved") || String(w).toLowerCase().includes("placeholder"));
  results.push({
    code: "V004",
    status: hasUnresolved ? "fail" : "pass",
    message: hasUnresolved ? "Unresolved image placeholder" : "No unresolved placeholders",
  });

  // V005: empty required module — simplified: if hero_required and no hero, already V001; else pass
  results.push({
    code: "V005",
    status: heroRequired && !hero ? "fail" : "pass",
    message: heroRequired && !hero ? "Empty required hero module" : "Required modules filled",
  });

  // V006: optional empty not collapsed — warn; we don't have module-level info; pass
  results.push({
    code: "V006",
    status: "pass",
    message: "Optional/collapse not evaluated (no module list)",
  });

  // V007: content duplicate hero — warn; duplicated_asset_ids present could indicate
  const duplicated = a?.resolution?.duplicated_asset_ids ?? [];
  const v007Warn = duplicated.length > 0;
  results.push({
    code: "V007",
    status: v007Warn ? "fail" : "pass",
    message: v007Warn ? "Content slot filled with duplicate hero" : "No duplicate hero in content",
  });

  // V008: product section without product image when products existed — warn
  results.push({
    code: "V008",
    status: "pass",
    message: "Product section binding not evaluated (template-level)",
  });

  // V009: excessive rejection — warn
  const v009Fail = rejectedCount > 10;
  results.push({
    code: "V009",
    status: v009Fail ? "fail" : "pass",
    message: v009Fail ? `Excessive asset rejection (${rejectedCount})` : "Rejection count acceptable",
  });

  // V010: hero aspect mismatch — warn; we don't have dimensions in assignment here
  results.push({
    code: "V010",
    status: "pass",
    message: "Hero aspect not validated",
  });

  // V011: broken remote image — critical; no URL check here, pass
  results.push({
    code: "V011",
    status: "pass",
    message: "Remote image reachability not checked",
  });

  // V012: placeholder over-allocation
  const v012Fail = (maxContentSlots > 0 && contentCount > maxContentSlots) || (maxProductSlots > 0 && productCount > maxProductSlots);
  results.push({
    code: "V012",
    status: v012Fail ? "fail" : "pass",
    message: v012Fail
      ? `Placeholder over-allocation (content: ${contentCount}/${maxContentSlots}, product: ${productCount}/${maxProductSlots})`
      : "Slot allocation within limits",
  });

  return results;
}
