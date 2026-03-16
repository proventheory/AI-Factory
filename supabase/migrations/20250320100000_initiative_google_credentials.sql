-- Store OAuth refresh_token per initiative for GSC/GA4 (user connects their Google account in the UI).
-- refresh_token is stored encrypted; decryption key in env GOOGLE_OAUTH_ENCRYPTION_KEY.

CREATE TABLE IF NOT EXISTS initiative_google_credentials (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id         uuid NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  encrypted_refresh_token text NOT NULL,
  scopes                text[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiative_id)
);

CREATE INDEX IF NOT EXISTS idx_initiative_google_credentials_initiative ON initiative_google_credentials (initiative_id);

ALTER TABLE initiative_google_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "initiative_google_credentials_select" ON initiative_google_credentials FOR SELECT USING (true);

COMMENT ON TABLE initiative_google_credentials IS 'OAuth refresh tokens per initiative for GSC/GA4; user connects Google in UI.';
