-- Align database object comments with WP → Shopify migration naming (wizard + brand connectors).
-- Does not rename tables or columns.

COMMENT ON TABLE brand_shopify_credentials IS 'Shopify Admin API access per brand (OAuth or shpat_); used by WP → Shopify migration wizard, MCP, and other tools.';

COMMENT ON TABLE brand_woocommerce_credentials IS 'WooCommerce REST API keys per brand; used by WP → Shopify migration wizard and future ETL.';

COMMENT ON TABLE seo_url_risk_snapshots IS 'Queryable risk history per URL from seo_ranking_risk_report; optional population from wp_shopify_migration pipeline artifacts. See docs/wp-shopify-migration/README.md.';
