-- WooCommerce REST API credentials per brand (store URL + ck/cs), encrypted at rest.
-- Same encryption env as Shopify: WOO_COMMERCE_CONNECTOR_ENCRYPTION_KEY or SHOPIFY_CONNECTOR_ENCRYPTION_KEY.

CREATE TABLE IF NOT EXISTS brand_woocommerce_credentials (
  brand_profile_id            uuid PRIMARY KEY REFERENCES brand_profiles(id) ON DELETE CASCADE,
  store_url                   text NOT NULL,
  encrypted_consumer_key      text NOT NULL,
  encrypted_consumer_secret   text NOT NULL,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE brand_woocommerce_credentials IS 'WooCommerce REST API keys per brand; used by SEO migration wizard and future ETL.';

ALTER TABLE brand_woocommerce_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_woocommerce_credentials_select" ON brand_woocommerce_credentials FOR SELECT USING (true);
