-- Ads / Commerce canonical: stores (WooCommerce, Shopify) and products per store.
-- Used by scripts/woocommerce-sync-pharmacy.mjs and Shopify connector.
-- Run with: npm run db:migrate:ads-commerce (or apply this file).

BEGIN;

-- Stores: one row per commerce store (WooCommerce site, Shopify shop), optional link to brand.
CREATE TABLE IF NOT EXISTS stores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key          text,
  channel           text NOT NULL,   -- 'woocommerce', 'shopify'
  external_ref      text NOT NULL,   -- store URL or shop domain
  name              text,
  brand_profile_id  uuid REFERENCES brand_profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_ref)
);
CREATE INDEX IF NOT EXISTS idx_stores_brand ON stores (brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_stores_scope ON stores (scope_key);

-- Products: one row per product in a store (WooCommerce product id, Shopify product id).
CREATE TABLE IF NOT EXISTS products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  external_ref text NOT NULL,   -- WC/Shopify product id
  name         text,
  price_cents  int,
  currency     text DEFAULT 'USD',
  image_url    text,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz,
  UNIQUE (store_id, external_ref)
);
CREATE INDEX IF NOT EXISTS idx_products_store ON products (store_id);

COMMENT ON TABLE stores IS 'Commerce stores (WooCommerce, Shopify) linked to optional brand_profile_id.';
COMMENT ON TABLE products IS 'Products per store; sync scripts set price_cents, image_url, description.';

COMMIT;
