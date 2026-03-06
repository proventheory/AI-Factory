-- Ensure schema for email campaign flow (template_id + metadata_json).
-- Safe to run on Supabase or Render; idempotent so can re-run.
-- Required for: POST/GET email_campaigns (template_id, campaign_prompt in metadata), runner template resolution.

-- initiatives.template_id: references email_templates.id (or slug) for email_campaign initiatives.
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS template_id text;
COMMENT ON COLUMN initiatives.template_id IS 'Optional template reference (e.g. email_templates.id for email_campaign).';

-- email_campaign_metadata.metadata_json: store template_id, campaign_prompt, products when initiative row lacks template_id (e.g. 4-column fallback).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaign_metadata') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_campaign_metadata' AND column_name = 'metadata_json') THEN
      ALTER TABLE email_campaign_metadata ADD COLUMN metadata_json jsonb;
      COMMENT ON COLUMN email_campaign_metadata.metadata_json IS 'Campaign payload: template_id, campaign_prompt, products, etc.';
    END IF;
  END IF;
END $$;
