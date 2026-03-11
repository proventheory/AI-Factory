-- Add url_value to taxonomy_terms for queryable slugs/URLs (Airtable "Url Value").
-- See docs/TAXONOMY_SCHEMA_AND_MAPPING.md.

BEGIN;

ALTER TABLE taxonomy_terms ADD COLUMN IF NOT EXISTS url_value text;
CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_url_value ON taxonomy_terms (website_id, url_value) WHERE url_value IS NOT NULL;

COMMIT;
