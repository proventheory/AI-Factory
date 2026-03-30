/**
 * Formal image assignment contract for email templates.
 * Single source of truth for: runner, template renderer, proof runner, validations, console.
 * See: docs/EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md
 *      .cursor/plans/log_mirror_and_template_proofing_*.plan.md "Formal image contract".
 *
 * v1: first valid campaign image = hero; rest campaign + products = content (no pre-assignment
 *     validation yet). v2: normalize → validate → classify → build hero_pool/content_pool/product_pool.
 */

export type AssetRole = "hero_candidate" | "content_candidate" | "product" | "logo" | "background" | "icon";

export type AssetSource = "campaign" | "product" | "brand";

/** Extended for v2: source_kind aligns with spec (campaign | product | logo | brand_default). */
export type AssetKind = "campaign" | "product" | "logo" | "brand_default";

export interface Asset {
  url: string;
  role?: AssetRole;
  alt?: string;
  source: AssetSource;
  rejected?: boolean;
  rejectReason?: string;
}

/** Full resolved asset (spec): inspectable, validatable, with optional dimensions and product_id. */
export interface ResolvedAsset {
  asset_id?: string;
  source_url: string;
  source_kind: AssetKind;
  role_hint?: AssetRole;
  width?: number;
  height?: number;
  mime_type?: string;
  alt_text?: string;
  title?: string;
  product_id?: string;
  is_usable: boolean;
  rejection_reason?: string;
  score?: number;
}

/** Run-time pools built before rendering (v2). */
export interface ImagePools {
  hero_pool: ResolvedAsset[];
  content_pool: ResolvedAsset[];
  product_pool: ResolvedAsset[];
  logo_pool: ResolvedAsset[];
}

/** Why this hero was chosen; persist for logs and proofing. Matches schemas/image_assignment.schema.json. */
export type HeroStrategy =
  | "manual_override"
  | "first_campaign_image"
  | "best_scored_campaign_image"
  | "brand_default"
  | "logo_fallback"
  | "featured_product"
  | "none";

/** Canonical context passed to template renderer; aliases resolve to these. */
export interface TemplateImageContext {
  hero_image_url?: string;
  hero_image_alt?: string;
  content_images: Array<{ url: string; alt?: string }>;
  product_images: Array<{ url: string; alt?: string; product_id?: string }>;
  logo_url?: string;
  logo_alt?: string;
}

/** Per-template metadata; required for lint and validation. */
export interface TemplateImageContract {
  template_id: string;
  hero_required: boolean;
  logo_safe_hero: boolean;
  hero_mode: "full_bleed" | "contained" | "none";
  supports_content_images: boolean;
  supports_product_images: boolean;
  mixed_content_and_product_pool: boolean;
  collapses_empty_modules: boolean;
  max_content_slots: number;
  max_product_slots: number;
}

/** DB/config: map template to archetype and fallback behavior. */
export type TemplateArchetype =
  | "full_bleed_editorial"
  | "contained_mixed"
  | "product_promo"
  | "product_grid"
  | "editorial_story"
  | "lifestyle_product_hybrid"
  | "minimal_announcement"
  | "featured_product_hero"
  | "gallery_showcase"
  | "commerce_reminder";

export interface TemplateFallbackProfile {
  template_id: string;
  template_name: string;
  archetype: TemplateArchetype;
  hero_required: boolean;
  logo_safe_hero: boolean;
  product_hero_allowed: boolean;
  collapses_empty_modules: boolean;
  mixed_content_and_product_pool: boolean;
  max_content_slots: number;
  max_product_slots: number;
}

/** Lint rule codes (static template checks). */
export const LINT_RULES = {
  L001: "unsupported_image_placeholder",
  L002: "hero_section_uses_content_placeholder",
  L003: "hero_depends_on_logo_not_logo_safe",
  L004: "missing_hero_in_hero_required",
  L005: "repeated_hero_leakage",
  L006: "product_module_missing_product_image",
  L007: "content_slot_exceeds_max",
  L008: "product_slot_exceeds_max",
  L009: "optional_module_no_collapse",
  L010: "mixed_pool_without_flag",
} as const;

/** Validation rule codes (per-run). Critical = fail proof. */
export const VALIDATION_RULES = {
  V001: "hero_missing",
  V002: "hero_disallowed_source",
  V003: "logo_fallback_non_logo_safe",
  V004: "unresolved_placeholder",
  V005: "empty_required_module",
  V006: "optional_empty_not_collapsed",
  V007: "content_duplicate_hero",
  V008: "product_section_no_product_image",
  V009: "excessive_rejection",
  V010: "hero_aspect_mismatch",
  V011: "broken_remote_image",
  V012: "placeholder_over_allocation",
} as const;

export const VALIDATION_CRITICAL: (keyof typeof VALIDATION_RULES)[] = [
  "V001", "V002", "V003", "V004", "V005", "V011", "V012",
];

/** Approved placeholder aliases → canonical key. */
export const PLACEHOLDER_ALIASES: Record<string, string> = {
  "[hero]": "hero_image_url",
  "[hero image]": "hero_image_url",
  "[banner]": "hero_image_url",
  "{{hero_image}}": "hero_image_url",
  "{{hero_image_url}}": "hero_image_url",
  "{{imageUrl}}": "hero_image_url",
};

export type HeroSelectionMode = "manual" | "first_selected" | "best_scored";

export interface ImageAssignmentSourceSummary {
  campaignImages: number;
  productImages: number;
  brandLogoUsedAsHero: boolean;
  heroSelectionMode: HeroSelectionMode;
}

/** In-memory assignment (v1 runner). */
export interface ImageAssignment {
  hero: Asset | null;
  content: Asset[];
  products: Asset[];
  sourceSummary: ImageAssignmentSourceSummary;
  rejected: Array<{ url: string; reason: string }>;
}

/** Full persistable assignment (spec): for run metadata/artifact, logs, proofing. */
export interface ImageAssignmentPersisted {
  version: "v1";
  run_id: string;
  template_id: string;
  brand_profile_id: string;
  inputs: {
    selected_campaign_assets: ResolvedAsset[];
    selected_product_assets: ResolvedAsset[];
    selected_logo_assets: ResolvedAsset[];
    selected_brand_default_assets: ResolvedAsset[];
  };
  pools: ImagePools;
  assignment: {
    hero: ResolvedAsset | null;
    content: ResolvedAsset[];
    products: ResolvedAsset[];
  };
  resolution: {
    hero_strategy: HeroStrategy;
    logo_fallback_used: boolean;
    collapsed_modules: string[];
    duplicated_asset_ids: string[];
    rejected_asset_ids: string[];
  };
  diagnostics: {
    usable_campaign_count: number;
    usable_content_count: number;
    usable_product_count: number;
    usable_logo_count: number;
    warnings: string[];
  };
}

/** Canonical placeholder keys (internal schema). Aliases ([hero], [banner], {{imageUrl}}, etc.) resolve to these. */
export const CANONICAL_HERO_KEY = "hero_image_url";
export const CANONICAL_CONTENT_KEYS = "content_images"; // content_images[0], content_images[1], ...

/**
 * Build ImageAssignment from raw campaign images and product image URLs (v1: first_selected mode).
 * Does not yet run pre-assignment validation; that is v2. Caller should persist assignment on run.
 */
export function buildImageAssignmentV1(
  campaignImageUrls: string[],
  productImageUrls: string[],
  logoUrl: string | null,
  heroSelectionMode: HeroSelectionMode = "first_selected",
): ImageAssignment {
  const rejected: Array<{ url: string; reason: string }> = [];
  const campaign = (campaignImageUrls ?? []).filter((u) => typeof u === "string" && u.trim() !== "");
  const products = (productImageUrls ?? []).filter((u) => typeof u === "string" && u.trim() !== "");

  let hero: Asset | null = null;
  let contentAssets: Asset[] = [];

  if (heroSelectionMode === "first_selected" && campaign.length > 0) {
    const heroUrl = campaign[0].trim();
    hero = { url: heroUrl, source: "campaign", role: "hero_candidate" };
    contentAssets = campaign.slice(1).map((url) => ({ url: url.trim(), source: "campaign" as const, role: "content_candidate" as AssetRole }));
  }

  if (!hero && logoUrl && logoUrl.trim()) {
    hero = { url: logoUrl.trim(), source: "brand", role: "logo" };
  }

  const productAssets: Asset[] = products.map((url) => ({ url: url.trim(), source: "product" as const, role: "product" as AssetRole }));
  contentAssets = [...contentAssets, ...productAssets];

  return {
    hero,
    content: contentAssets,
    products: productAssets,
    sourceSummary: {
      campaignImages: campaign.length,
      productImages: products.length,
      brandLogoUsedAsHero: hero?.source === "brand" && hero?.role === "logo",
      heroSelectionMode,
    },
    rejected,
  };
}

/**
 * Resolve canonical hero URL from ImageAssignment (for sectionJson.hero_image_url, etc.).
 */
export function getCanonicalHeroUrl(assignment: ImageAssignment): string {
  return assignment.hero?.url?.trim() ?? "";
}

/**
 * Resolve canonical content URLs for [image 1], [image 2], ... (for sectionJson.campaign_images / content_images).
 */
export function getCanonicalContentUrls(assignment: ImageAssignment): string[] {
  return assignment.content.map((a) => a.url?.trim() ?? "").filter(Boolean);
}

/**
 * Campaign-only content URLs (no product images). Use for campaign_images so [image 1], [image 2]
 * never show a product image in hero or editorial slots; product images go only in product placeholders.
 */
export function getCampaignOnlyContentUrls(assignment: ImageAssignment): string[] {
  return assignment.content
    .filter((a) => a.source === "campaign")
    .map((a) => a.url?.trim() ?? "")
    .filter(Boolean);
}

function assetToResolved(a: Asset, sourceKind: AssetKind): ResolvedAsset {
  const url = a.url?.trim() ?? "";
  return {
    source_url: url,
    source_kind: sourceKind,
    role_hint: a.role,
    alt_text: a.alt,
    is_usable: !a.rejected,
    rejection_reason: a.rejectReason,
  };
}

/**
 * Build full ImageAssignmentPersisted from v1 ImageAssignment and run context (for control plane persist + validations).
 */
export function buildImageAssignmentPersisted(
  assignment: ImageAssignment,
  params: {
    run_id: string;
    template_id: string;
    brand_profile_id: string;
    campaignImageUrls: string[];
    productImageUrls: string[];
    logoUrl: string | null;
  },
): ImageAssignmentPersisted {
  const { run_id, template_id, brand_profile_id, campaignImageUrls, productImageUrls, logoUrl } = params;
  const campaign = (campaignImageUrls ?? []).filter((u) => typeof u === "string" && u.trim() !== "");
  const products = (productImageUrls ?? []).filter((u) => typeof u === "string" && u.trim() !== "");
  const logo = logoUrl?.trim() ?? null;

  const heroStrategy: HeroStrategy = assignment.sourceSummary.brandLogoUsedAsHero
    ? "logo_fallback"
    : assignment.hero
      ? (assignment.hero.source === "campaign"
          ? "first_campaign_image"
          : assignment.hero.source === "brand"
            ? "logo_fallback"
            : assignment.hero.source === "product"
              ? "featured_product"
              : "first_campaign_image")
      : "none";

  const heroResolved: ResolvedAsset | null = assignment.hero
    ? assetToResolved(assignment.hero, assignment.hero.source === "brand" ? "logo" : assignment.hero.source === "product" ? "product" : "campaign")
    : null;
  const contentResolved: ResolvedAsset[] = assignment.content.map((a) =>
    assetToResolved(a, a.source === "product" ? "product" : "campaign"),
  );
  const productResolved: ResolvedAsset[] = assignment.products.map((a) => assetToResolved(a, "product"));

  const selectedCampaign: ResolvedAsset[] = campaign.map((url) => ({
    source_url: url,
    source_kind: "campaign" as AssetKind,
    is_usable: true,
  }));
  const selectedProduct: ResolvedAsset[] = products.map((url) => ({
    source_url: url,
    source_kind: "product" as AssetKind,
    is_usable: true,
  }));
  const selectedLogo: ResolvedAsset[] = logo ? [{ source_url: logo, source_kind: "logo" as AssetKind, is_usable: true }] : [];
  const selectedBrandDefault: ResolvedAsset[] = [];

  const heroPool: ResolvedAsset[] = heroResolved ? [heroResolved] : [];
  const contentPool = contentResolved;
  const productPool = productResolved;
  const logoPool = selectedLogo;

  return {
    version: "v1",
    run_id,
    template_id,
    brand_profile_id,
    inputs: {
      selected_campaign_assets: selectedCampaign,
      selected_product_assets: selectedProduct,
      selected_logo_assets: selectedLogo,
      selected_brand_default_assets: selectedBrandDefault,
    },
    pools: {
      hero_pool: heroPool,
      content_pool: contentPool,
      product_pool: productPool,
      logo_pool: logoPool,
    },
    assignment: {
      hero: heroResolved,
      content: contentResolved,
      products: productResolved,
    },
    resolution: {
      hero_strategy: heroStrategy,
      logo_fallback_used: assignment.sourceSummary.brandLogoUsedAsHero,
      collapsed_modules: [],
      duplicated_asset_ids: [],
      rejected_asset_ids: assignment.rejected.map((r) => r.url),
    },
    diagnostics: {
      usable_campaign_count: campaign.length,
      usable_content_count: contentResolved.length,
      usable_product_count: products.length,
      usable_logo_count: logo ? 1 : 0,
      warnings: [],
    },
  };
}
