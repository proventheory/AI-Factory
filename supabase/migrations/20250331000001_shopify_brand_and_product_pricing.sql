-- Extend products with price_cents, currency, image_url, description if not already present (ads_commerce_canonical may have them).
-- Kept for migration order; 20250329000000_ads_commerce_canonical already defines these columns.

BEGIN;

-- Idempotent: add columns only if missing (skipIfErrorCode 42701 in run-migrate).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'price_cents') THEN
    ALTER TABLE products ADD COLUMN price_cents int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'currency') THEN
    ALTER TABLE products ADD COLUMN currency text DEFAULT 'USD';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'image_url') THEN
    ALTER TABLE products ADD COLUMN image_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'description') THEN
    ALTER TABLE products ADD COLUMN description text;
  END IF;
END $$;

COMMIT;
