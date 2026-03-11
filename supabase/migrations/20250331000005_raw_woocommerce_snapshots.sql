-- Raw WooCommerce payloads for Pharmacy Time (and other stores) so we have full replay and cross-reference.
-- See scripts/woocommerce-sync-pharmacy.mjs and docs/PHARMACY_IMPORT.md.

BEGIN;

CREATE TABLE IF NOT EXISTS raw_woocommerce_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key     text NOT NULL,
  store_url     text,
  entity_type   text NOT NULL,  -- 'products', 'categories', 'orders'
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raw_woocommerce_snapshots_scope ON raw_woocommerce_snapshots (scope_key);
CREATE INDEX IF NOT EXISTS idx_raw_woocommerce_snapshots_created ON raw_woocommerce_snapshots (created_at DESC);
COMMENT ON TABLE raw_woocommerce_snapshots IS 'Full WooCommerce API response payloads per sync run for replay and cross-reference.';

COMMIT;
