-- Email Marketing Factory: schema support for email campaigns and templates
-- Initiatives with intent_type = 'email_campaign' can link to this metadata.
-- Artifacts can be classified as email_template.

-- Add email_template to artifact_class for email template artifacts
-- Add value only if not present (idempotent for re-runs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'artifact_class' AND e.enumlabel = 'email_template') THEN
    ALTER TYPE artifact_class ADD VALUE 'email_template';
  END IF;
END
$$;

-- Optional: table for campaign-specific metadata (subject, from, template ref, segment)
-- One row per initiative that is an email campaign (initiative_id = initiatives.id).
CREATE TABLE IF NOT EXISTS email_campaign_metadata (
  initiative_id        uuid PRIMARY KEY REFERENCES initiatives(id) ON DELETE CASCADE,
  subject_line         text,
  from_name            text,
  from_email           text,
  reply_to             text,
  template_artifact_id  uuid REFERENCES artifacts(id),
  audience_segment_ref text,
  metadata_json         jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_metadata_initiative ON email_campaign_metadata (initiative_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_metadata_template ON email_campaign_metadata (template_artifact_id) WHERE template_artifact_id IS NOT NULL;

COMMENT ON TABLE email_campaign_metadata IS 'Email Marketing Factory: campaign-level fields for initiatives with intent_type = email_campaign';

-- RLS for email_campaign_metadata (allow read for authenticated; API uses service role)
ALTER TABLE email_campaign_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_campaign_metadata_select" ON email_campaign_metadata FOR SELECT USING (true);
