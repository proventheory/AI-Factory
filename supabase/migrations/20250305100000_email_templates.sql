-- Email Marketing: email_templates table for MJML templates (Focuz/Cultura parity).
-- Reference: Focuz Supabase templates (type, json, img_count, sections, imageUrl, mjml, html).

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
CREATE POLICY "email_templates_select" ON email_templates FOR SELECT USING (true);
