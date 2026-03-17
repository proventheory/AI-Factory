-- Optional GA4 property ID per brand (user selects which property to use for reports).

ALTER TABLE brand_google_credentials
  ADD COLUMN IF NOT EXISTS ga4_property_id text;

COMMENT ON COLUMN brand_google_credentials.ga4_property_id IS 'Selected GA4 property ID for this brand (user choice from list).';
