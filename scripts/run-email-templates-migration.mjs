#!/usr/bin/env node
/**
 * Create email_templates table (and optional brand_profile_id) on the DB pointed by DATABASE_URL.
 * Use this when the Control Plane DB (e.g. Render DATABASE_URL) has not had Supabase migrations applied.
 *
 * Usage: DATABASE_URL="postgresql://..." node scripts/run-email-templates-migration.mjs
 */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (e.g. your Render Postgres or Supabase connection string).");
  process.exit(1);
}

const sql = `
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
-- Email campaign flow: ensure initiatives.template_id and email_campaign_metadata.metadata_json exist (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'initiatives') THEN
    ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS template_id text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaign_metadata') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_campaign_metadata' AND column_name = 'metadata_json') THEN
      ALTER TABLE email_campaign_metadata ADD COLUMN metadata_json jsonb;
    END IF;
  END IF;
END $$;
`;

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("email_templates table (and optional brand_profile_id) created or already present.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
