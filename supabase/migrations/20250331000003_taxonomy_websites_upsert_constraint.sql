-- Placeholder: unique constraint for taxonomy_websites upsert is created in 20250331000000 (idx_taxonomy_websites_airtable).
-- Kept for migration order compatibility with run-migrate.mjs (skipIfErrorCode 42710).

BEGIN;

-- Ensure column exists for legacy DBs that created taxonomy_websites before 20250331000000.
ALTER TABLE taxonomy_websites ADD COLUMN IF NOT EXISTS airtable_table_id text NOT NULL DEFAULT '';

COMMIT;
