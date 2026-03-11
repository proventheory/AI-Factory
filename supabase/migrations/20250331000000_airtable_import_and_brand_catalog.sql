-- Airtable import landing and taxonomy: organizations, import_batches, raw_airtable_*, taxonomy_websites, taxonomy_vocabularies, taxonomy_terms, brand_catalog_products.
-- Used by scripts/airtable-import-pharmacy.mjs and scripts/airtable-import-first-capital.mjs.
-- See docs/TAXONOMY_SCHEMA_AND_MAPPING.md.

BEGIN;

-- Organizations: top-level client (e.g. First Capital Group, Pharmacy Time).
CREATE TABLE IF NOT EXISTS organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  metadata_json jsonb DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug);

-- Import batches: one per import run (scope_key = org slug or scope).
CREATE TABLE IF NOT EXISTS import_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key     text NOT NULL,
  source_system text NOT NULL DEFAULT 'airtable',
  status        text NOT NULL DEFAULT 'running',
  stats_json    jsonb,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_batches_scope ON import_batches (scope_key);

-- Import issues: errors per batch.
CREATE TABLE IF NOT EXISTS import_issues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid REFERENCES import_batches(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  entity_type   text,
  message       text NOT NULL,
  detail_json   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_issues_batch ON import_issues (batch_id);

-- Raw Airtable landing (full payloads for replay).
CREATE TABLE IF NOT EXISTS raw_airtable_bases (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id   text UNIQUE NOT NULL,
  name      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS raw_airtable_tables (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id   text NOT NULL REFERENCES raw_airtable_bases(base_id) ON DELETE CASCADE,
  table_id  text NOT NULL,
  name      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (base_id, table_id)
);
CREATE TABLE IF NOT EXISTS raw_airtable_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id      text NOT NULL,
  table_id     text NOT NULL,
  batch_seq    int NOT NULL DEFAULT 0,
  record_count int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS raw_airtable_rows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   uuid NOT NULL REFERENCES raw_airtable_batches(id) ON DELETE CASCADE,
  record_id  text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, record_id)
);
CREATE INDEX IF NOT EXISTS idx_raw_airtable_rows_batch ON raw_airtable_rows (batch_id);

-- Taxonomy websites: one per Airtable "Website" (or synthetic per base).
CREATE TABLE IF NOT EXISTS taxonomy_websites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid REFERENCES organizations(id) ON DELETE SET NULL,
  airtable_base_id    text NOT NULL DEFAULT '',
  airtable_table_id   text NOT NULL DEFAULT '',
  airtable_record_id  text NOT NULL DEFAULT '',
  name                text NOT NULL,
  status              text DEFAULT 'active',
  url                 text,
  metadata_json       jsonb DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomy_websites_airtable ON taxonomy_websites (airtable_base_id, airtable_table_id, airtable_record_id) WHERE airtable_base_id <> '' AND airtable_record_id <> '';
CREATE INDEX IF NOT EXISTS idx_taxonomy_websites_org ON taxonomy_websites (organization_id);

-- Taxonomy vocabularies: per website (e.g. Unit Strength, Family Type).
CREATE TABLE IF NOT EXISTS taxonomy_vocabularies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id          uuid NOT NULL REFERENCES taxonomy_websites(id) ON DELETE CASCADE,
  airtable_record_id  text NOT NULL DEFAULT '',
  name                text NOT NULL,
  visibility          text,
  metadata_json       jsonb DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_id, airtable_record_id)
);
CREATE INDEX IF NOT EXISTS idx_taxonomy_vocabularies_website ON taxonomy_vocabularies (website_id);

-- Taxonomy terms: per vocabulary (including product-like terms).
CREATE TABLE IF NOT EXISTS taxonomy_terms (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vocabulary_id       uuid NOT NULL REFERENCES taxonomy_vocabularies(id) ON DELETE CASCADE,
  website_id          uuid NOT NULL REFERENCES taxonomy_websites(id) ON DELETE CASCADE,
  airtable_record_id  text NOT NULL DEFAULT '',
  term_name           text NOT NULL,
  published_status    text,
  family_type         text,
  term_id_external    text,
  metadata_json       jsonb DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_id, airtable_record_id)
);
CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_vocabulary ON taxonomy_terms (vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_website ON taxonomy_terms (website_id);

-- Brand catalog products: canonical products per brand (Airtable/Shopify/WooCommerce).
CREATE TABLE IF NOT EXISTS brand_catalog_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id  uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  source_system     text NOT NULL,
  external_ref      text NOT NULL,
  name              text,
  description       text,
  image_url         text,
  price_cents       int,
  currency          text DEFAULT 'USD',
  metadata_json     jsonb DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  UNIQUE (brand_profile_id, source_system, external_ref)
);
CREATE INDEX IF NOT EXISTS idx_brand_catalog_products_brand ON brand_catalog_products (brand_profile_id);

COMMIT;
