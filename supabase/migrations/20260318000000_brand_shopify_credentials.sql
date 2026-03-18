-- Store Shopify connector credentials per brand (Dev Dashboard app: client_id + client_secret).
-- client_secret is stored encrypted; decryption key in env SHOPIFY_CONNECTOR_ENCRYPTION_KEY.
-- Used for SEO migration, MCP, and other tools that need Admin API access under the brand.

CREATE TABLE IF NOT EXISTS brand_shopify_credentials (
  brand_profile_id         uuid PRIMARY KEY REFERENCES brand_profiles(id) ON DELETE CASCADE,
  shop_domain              text NOT NULL,
  client_id                text NOT NULL,
  encrypted_client_secret  text NOT NULL,
  scopes                   text[] NOT NULL DEFAULT '{}',
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE brand_shopify_credentials IS 'Shopify Dev Dashboard app credentials per brand; AI Factory exchanges for short-lived Admin API tokens.';

ALTER TABLE brand_shopify_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_shopify_credentials_select" ON brand_shopify_credentials FOR SELECT USING (true);
