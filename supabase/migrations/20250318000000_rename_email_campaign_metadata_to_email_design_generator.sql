-- Rename email_campaign_metadata to email_design_generator_metadata so table name matches intent_type and reserves "email campaign" for future sent campaigns (e.g. Klaviyo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaign_metadata') THEN
    ALTER TABLE email_campaign_metadata RENAME TO email_design_generator_metadata;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_email_campaign_metadata_initiative') THEN
    ALTER INDEX idx_email_campaign_metadata_initiative RENAME TO idx_email_design_generator_metadata_initiative;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_email_campaign_metadata_template') THEN
    ALTER INDEX idx_email_campaign_metadata_template RENAME TO idx_email_design_generator_metadata_template;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_design_generator_metadata') THEN
    DROP POLICY IF EXISTS "email_campaign_metadata_select" ON email_design_generator_metadata;
    CREATE POLICY "email_design_generator_metadata_select" ON email_design_generator_metadata FOR SELECT USING (true);
    COMMENT ON TABLE email_design_generator_metadata IS 'Metadata for email-design initiatives (intent_type = email_design_generator). "Email campaign" reserved for future sent campaigns (e.g. Klaviyo).';
  END IF;
END $$;
