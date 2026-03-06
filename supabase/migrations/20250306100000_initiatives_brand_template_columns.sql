-- Ensure initiatives has brand_profile_id and template_id (safe re-run if 20250303000007 or 20250303000005 not applied).
-- Fixes: column "brand_profile_id" of relation "initiatives" does not exist.

ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS brand_profile_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS template_id text;
CREATE INDEX IF NOT EXISTS idx_initiatives_brand_profile_id ON initiatives (brand_profile_id) WHERE brand_profile_id IS NOT NULL;

COMMENT ON COLUMN initiatives.brand_profile_id IS 'FK to brand_profiles; optional brand context (email campaign, landing, etc.)';
COMMENT ON COLUMN initiatives.template_id IS 'Optional template reference (e.g. email_templates.id for email_campaign).';
