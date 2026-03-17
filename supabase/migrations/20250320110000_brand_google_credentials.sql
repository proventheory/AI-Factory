-- Store OAuth refresh_token per brand for GSC/GA4 (user connects Google in brand page).
-- refresh_token is stored encrypted; decryption key in env GOOGLE_OAUTH_ENCRYPTION_KEY.

CREATE TABLE IF NOT EXISTS brand_google_credentials (
  brand_profile_id       uuid PRIMARY KEY REFERENCES brand_profiles(id) ON DELETE CASCADE,
  encrypted_refresh_token text NOT NULL,
  scopes                 text[] NOT NULL DEFAULT '{}',
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE brand_google_credentials IS 'OAuth refresh tokens per brand for GSC/GA4; user connects Google on brand page.';

ALTER TABLE brand_google_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_google_credentials_select" ON brand_google_credentials FOR SELECT USING (true);
