-- Canonical intent for the WordPress → Shopify migration pipeline (replaces legacy identifier).
UPDATE initiatives
SET intent_type = 'wp_shopify_migration'
WHERE intent_type = 'seo_migration_audit';

COMMENT ON TABLE seo_url_risk_snapshots IS 'Queryable risk history per URL from seo_ranking_risk_report; optional population from wp_shopify_migration pipeline artifacts. See docs/wp-shopify-migration/README.md.';
