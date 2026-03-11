-- First Capital Group org seed; brand_profiles.website_id; taxonomy_websites.organization_id already in 20250331000000.
-- See docs/WHERE_EMAIL_AND_BRANDS_LIVE.md and ORGANIZATION_AND_CLIENT_GROUPING.md.

BEGIN;

-- Seed First Capital Group organization (idempotent).
INSERT INTO organizations (name, slug) VALUES ('First Capital Group', 'first-capital-group')
ON CONFLICT (slug) DO NOTHING;

-- Link brand_profiles to taxonomy website (optional).
ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS website_id uuid REFERENCES taxonomy_websites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_brand_profiles_website_id ON brand_profiles (website_id);

COMMIT;
