
-- Email Marketing: email_templates table for MJML templates (Focuz/Cultura parity).
CREATE TABLE IF NOT EXISTS email_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type           text NOT NULL,
  name           text NOT NULL,
  image_url      text,
  mjml           text,
  template_json  jsonb,
  sections_json  jsonb,
  img_count      integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates (type);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_at ON email_templates (created_at DESC);
COMMENT ON TABLE email_templates IS 'Email Marketing Factory: MJML email templates (ported from Focuz templates table).';
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_templates_select" ON email_templates;
CREATE POLICY "email_templates_select" ON email_templates FOR SELECT USING (true);
-- Optional: link to brand_profiles (skip if brand_profiles does not exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brand_profiles') THEN
    ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS brand_profile_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_email_templates_brand_profile_id ON email_templates (brand_profile_id) WHERE brand_profile_id IS NOT NULL;
  END IF;
END $$;
-- Email design flow: initiatives.template_id, initiatives.brand_profile_id, email_design_generator_metadata.metadata_json (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'initiatives') THEN
    ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS template_id text;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brand_profiles') THEN
      ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS brand_profile_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_initiatives_brand_profile_id ON initiatives (brand_profile_id) WHERE brand_profile_id IS NOT NULL;
    END IF;
  END IF;
  -- Canonical table name (after 20250318 rename); fallback to legacy name for pre-rename DBs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_design_generator_metadata') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_design_generator_metadata' AND column_name = 'metadata_json') THEN
      ALTER TABLE email_design_generator_metadata ADD COLUMN metadata_json jsonb;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaign_metadata') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_campaign_metadata' AND column_name = 'metadata_json') THEN
      ALTER TABLE email_campaign_metadata ADD COLUMN metadata_json jsonb;
    END IF;
  END IF;
END $$;
