-- Custom Shopify apps (Settings → Develop apps) cannot use OAuth client_credentials on the shop;
-- they use a static Admin API access token (shpat_...). Store it encrypted alongside optional OAuth fields.

ALTER TABLE brand_shopify_credentials
  ADD COLUMN IF NOT EXISTS encrypted_admin_access_token text NULL;

ALTER TABLE brand_shopify_credentials
  ALTER COLUMN client_id DROP NOT NULL,
  ALTER COLUMN encrypted_client_secret DROP NOT NULL;

COMMENT ON COLUMN brand_shopify_credentials.encrypted_admin_access_token IS 'Encrypted shpat_ Admin API token for custom apps; when set, OAuth client_credentials exchange is skipped.';

ALTER TABLE brand_shopify_credentials DROP CONSTRAINT IF EXISTS brand_shopify_credentials_auth_check;

ALTER TABLE brand_shopify_credentials ADD CONSTRAINT brand_shopify_credentials_auth_check CHECK (
  (encrypted_admin_access_token IS NOT NULL AND length(trim(encrypted_admin_access_token)) > 0)
  OR (
    client_id IS NOT NULL
    AND length(trim(client_id)) > 0
    AND encrypted_client_secret IS NOT NULL
    AND length(trim(encrypted_client_secret)) > 0
  )
);
