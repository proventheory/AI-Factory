-- Link email templates to brands so brands can have dedicated templates.
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS brand_profile_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_templates_brand_profile_id ON email_templates (brand_profile_id) WHERE brand_profile_id IS NOT NULL;
COMMENT ON COLUMN email_templates.brand_profile_id IS 'Optional FK to brand_profiles; null = global template available to all brands.';
