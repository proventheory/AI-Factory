/**
 * Canonical initiative intent for the WordPress → Shopify migration pipeline
 * (URL inventory, GSC/GA4, redirects, risk report). Job types remain seo_*.
 */
export const WP_SHOPIFY_MIGRATION_INTENT = "wp_shopify_migration" as const;

const LEGACY_WP_SHOPIFY_INTENT = "seo_migration_audit";

/** Map legacy DB/API values to the canonical intent. */
export function canonicalInitiativeIntentType(intentType: string): string {
  if (intentType === LEGACY_WP_SHOPIFY_INTENT) return WP_SHOPIFY_MIGRATION_INTENT;
  return intentType;
}

/** Values to match in SQL when filtering by intent (includes legacy row until data migration). */
export function intentTypeFilterValues(requestedFilter: string): string[] {
  const canonical = canonicalInitiativeIntentType(requestedFilter);
  if (canonical === WP_SHOPIFY_MIGRATION_INTENT) {
    return [WP_SHOPIFY_MIGRATION_INTENT, LEGACY_WP_SHOPIFY_INTENT];
  }
  return [canonical];
}
