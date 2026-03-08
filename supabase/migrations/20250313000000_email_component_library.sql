-- Email component library: reusable MJML fragments for composing email templates.
-- Placeholders follow BRAND_EMAIL_FIELD_MAPPING (e.g. [logo], [headline], [product A src]).

CREATE TABLE IF NOT EXISTS email_component_library (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_type  text NOT NULL,
  name            text NOT NULL,
  description     text,
  mjml_fragment   text NOT NULL,
  placeholder_docs jsonb DEFAULT '[]',
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_component_library_component_type ON email_component_library (component_type);
CREATE INDEX IF NOT EXISTS idx_email_component_library_position ON email_component_library (position);

COMMENT ON TABLE email_component_library IS 'Reusable MJML fragments (header, hero, product block, footer) for composing email templates.';
COMMENT ON COLUMN email_component_library.mjml_fragment IS 'MJML section/column fragment only; no outer mjml/mj-body. Uses [placeholder] per BRAND_EMAIL_FIELD_MAPPING.';
COMMENT ON COLUMN email_component_library.placeholder_docs IS 'Optional array of placeholder names this fragment uses, for UI/docs.';

ALTER TABLE email_component_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_component_library_select" ON email_component_library FOR SELECT USING (true);
CREATE POLICY "email_component_library_insert" ON email_component_library FOR INSERT WITH CHECK (true);
CREATE POLICY "email_component_library_update" ON email_component_library FOR UPDATE USING (true);
CREATE POLICY "email_component_library_delete" ON email_component_library FOR DELETE USING (true);
