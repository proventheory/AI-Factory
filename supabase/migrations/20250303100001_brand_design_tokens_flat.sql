-- Normalized searchable representation of brand design_tokens (optional sync from brand_profiles.design_tokens).
-- See docs/BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md.

BEGIN;

CREATE TABLE IF NOT EXISTS brand_design_tokens_flat (
  brand_id    uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  path        text NOT NULL,
  value       text,
  value_json  jsonb,
  type        text,
  "group"     text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, path)
);

CREATE INDEX IF NOT EXISTS idx_brand_design_tokens_flat_brand_id ON brand_design_tokens_flat (brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_design_tokens_flat_group ON brand_design_tokens_flat (brand_id, "group");

COMMENT ON TABLE brand_design_tokens_flat IS 'Flattened token paths for search/filter; source of truth remains brand_profiles.design_tokens';

COMMIT;
