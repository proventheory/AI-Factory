/**
 * Intent types that map to plan templates in control-plane/src/plan-compiler.ts.
 * Used by Create/Edit initiative flows so users pick a pipeline type.
 */

/** Canonical label for email design generator flow (used for both email_design_generator and legacy email_campaign). */
export const EMAIL_DESIGN_GENERATOR_LABEL = "Email design generator (brand → products → template → generate)";

/** Stored initiative intent for the WP → Shopify migration wizard / pipeline. */
export const WP_SHOPIFY_MIGRATION_INTENT = "wp_shopify_migration" as const;

const LEGACY_WP_SHOPIFY_INTENT_QUERY = "seo_migration_audit";

/** Normalize pipeline filter / URL query (legacy bookmarks). */
export function normalizeWpShopifyIntentQueryParam(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw === LEGACY_WP_SHOPIFY_INTENT_QUERY ? WP_SHOPIFY_MIGRATION_INTENT : raw;
}

/** True for WP → Shopify migration initiatives (canonical or legacy row before DB migration). */
export function isWpShopifyMigrationIntent(intentType: string | null | undefined): boolean {
  if (!intentType) return false;
  return intentType === WP_SHOPIFY_MIGRATION_INTENT || intentType === LEGACY_WP_SHOPIFY_INTENT_QUERY;
}

export const INTENT_TYPES = [
  { value: "software", label: "Software (PRD → design → code → test → review)" },
  { value: "issue_fix", label: "Issue fix (analyze → patch → test → PR)" },
  { value: "marketing", label: "Marketing (brand → copy → deck)" },
  { value: "email_design_generator", label: EMAIL_DESIGN_GENERATOR_LABEL },
  { value: "email_campaign", label: EMAIL_DESIGN_GENERATOR_LABEL }, // legacy; DB may still return this for older runs
  { value: "landing", label: "Landing page (copy → landing page)" },
  { value: "migration", label: "Migration (analyze → plan → apply → validate)" },
  { value: "factory_ops", label: "Factory ops (review → codegen → patch)" },
  { value: "ci_gate", label: "CI gate (code review → QA validator)" },
  { value: "crew", label: "Crew (research → design → codegen → test)" },
  { value: "self_heal", label: "Self-heal (analyze → resolve → review → PR)" },
  { value: "swe_agent", label: "SWE agent (analyze → swe_agent → test → review → PR)" },
  { value: "wp_shopify_migration", label: "WP → Shopify migration wizard (GSC/GA4 → compare source/target)" },
] as const;

export type IntentTypeValue = (typeof INTENT_TYPES)[number]["value"];
