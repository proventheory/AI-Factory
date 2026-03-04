-- Brand themes / design tokens in schema (Blueprint 12E.4)
-- Allows storing token sets per theme for website generator, emails, PDFs, multi-tenant.

CREATE TABLE IF NOT EXISTS brand_themes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  token_overrides   jsonb       NOT NULL DEFAULT '{}',
  component_variants jsonb      DEFAULT '{}',
  mode              text        NOT NULL DEFAULT 'light' CHECK (mode IN ('light', 'dark')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE brand_themes IS 'Theme: theme_id, token_overrides, component_variants, mode (12E.4). Token keys match console/src/design-tokens/tokens.ts (color.*, typography.*, spacing, radius, shadow, motion).';
COMMENT ON COLUMN brand_themes.token_overrides IS 'Partial override of design tokens (e.g. color.brand.500, typography.heading.h1.size). Empty {} means use default tokens.';
COMMENT ON COLUMN brand_themes.component_variants IS 'Optional component variant overrides for blocks/pages.';

CREATE INDEX idx_brand_themes_mode ON brand_themes (mode);
CREATE INDEX idx_brand_themes_name ON brand_themes (name);

ALTER TABLE brand_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_themes_select" ON brand_themes FOR SELECT USING (true);
