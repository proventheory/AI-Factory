-- Brand Engine: brand_profiles, brand_embeddings, document_templates, document_components, brand_assets
-- Links initiatives and llm_calls to brand profiles.
-- Depends on: 20250303000003_brand_themes.sql (brand_themes table)

BEGIN;

-- ============================================================
-- Trigger function for updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. brand_profiles
-- ============================================================

CREATE TABLE brand_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE,
  brand_theme_id  uuid REFERENCES brand_themes(id) ON DELETE SET NULL,
  identity        jsonb NOT NULL DEFAULT '{}',
  tone            jsonb NOT NULL DEFAULT '{}',
  visual_style    jsonb NOT NULL DEFAULT '{}',
  copy_style      jsonb NOT NULL DEFAULT '{}',
  design_tokens   jsonb NOT NULL DEFAULT '{}',
  deck_theme      jsonb NOT NULL DEFAULT '{}',
  report_theme    jsonb NOT NULL DEFAULT '{}',
  style_dimensions jsonb DEFAULT '{}',
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_profiles_name ON brand_profiles (name);
CREATE INDEX idx_brand_profiles_slug ON brand_profiles (slug);
CREATE INDEX idx_brand_profiles_status ON brand_profiles (status);
CREATE INDEX idx_brand_profiles_brand_theme_id ON brand_profiles (brand_theme_id);
CREATE INDEX idx_brand_profiles_created_at ON brand_profiles (created_at DESC);

ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_profiles_select" ON brand_profiles FOR SELECT USING (true);
CREATE POLICY "brand_profiles_insert" ON brand_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "brand_profiles_update" ON brand_profiles FOR UPDATE USING (true);
CREATE POLICY "brand_profiles_delete" ON brand_profiles FOR DELETE USING (true);

CREATE TRIGGER trg_brand_profiles_updated_at
  BEFORE UPDATE ON brand_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE brand_profiles IS 'Stores brand identity, tone, visual style, copy rules, and design tokens for BrandOS';
COMMENT ON COLUMN brand_profiles.id IS 'Primary key UUID for the brand profile';
COMMENT ON COLUMN brand_profiles.name IS 'Human-readable brand profile name';
COMMENT ON COLUMN brand_profiles.slug IS 'URL-safe unique identifier for the brand';
COMMENT ON COLUMN brand_profiles.brand_theme_id IS 'FK to brand_themes for base visual theme inheritance';
COMMENT ON COLUMN brand_profiles.identity IS 'Brand identity: archetype, industry, tagline, mission, values';
COMMENT ON COLUMN brand_profiles.tone IS 'Tone of voice: descriptors, reading_level, sentence_length, formality';
COMMENT ON COLUMN brand_profiles.visual_style IS 'Visual preferences: density, style_description, image_style, illustration_style';
COMMENT ON COLUMN brand_profiles.copy_style IS 'Copywriting rules: voice, banned_words, preferred_phrases, cta_style';
COMMENT ON COLUMN brand_profiles.design_tokens IS 'Design tokens JSON: color, typography, spacing, layout, radius, shadow, motion, border';
COMMENT ON COLUMN brand_profiles.deck_theme IS 'Presentation theme: slide_master, chart_colors, kpi_card_style, table_style';
COMMENT ON COLUMN brand_profiles.report_theme IS 'Report theme: header_style, section_spacing, chart_defaults, callout_style';
COMMENT ON COLUMN brand_profiles.style_dimensions IS 'Additional style dimension overrides';
COMMENT ON COLUMN brand_profiles.status IS 'Profile lifecycle status: active, draft, or archived';
COMMENT ON COLUMN brand_profiles.created_at IS 'Timestamp when the brand profile was created';
COMMENT ON COLUMN brand_profiles.updated_at IS 'Timestamp of last brand profile modification';

-- ============================================================
-- 2. brand_embeddings (requires pgvector)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE brand_embeddings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  embedding_type   text NOT NULL CHECK (embedding_type IN (
    'brand_description', 'copy_example', 'visual_guidelines', 'sample_ad', 'sample_email',
    'tone_description', 'style_guide_excerpt', 'mission_statement', 'tagline_variant', 'competitor_diff'
  )),
  content          text NOT NULL,
  embedding        vector(1536),
  metadata         jsonb DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_embeddings_brand_profile_id ON brand_embeddings (brand_profile_id);
CREATE INDEX idx_brand_embeddings_embedding_type ON brand_embeddings (embedding_type);
CREATE INDEX idx_brand_embeddings_created_at ON brand_embeddings (created_at DESC);
CREATE INDEX idx_brand_embeddings_embedding_ivfflat ON brand_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE brand_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_embeddings_select" ON brand_embeddings FOR SELECT USING (true);
CREATE POLICY "brand_embeddings_insert" ON brand_embeddings FOR INSERT WITH CHECK (true);
CREATE POLICY "brand_embeddings_delete" ON brand_embeddings FOR DELETE USING (true);

COMMENT ON TABLE brand_embeddings IS 'Vector embeddings of brand content for semantic similarity search';
COMMENT ON COLUMN brand_embeddings.id IS 'Primary key UUID for the brand embedding record';
COMMENT ON COLUMN brand_embeddings.brand_profile_id IS 'FK to brand_profiles owning this embedding';
COMMENT ON COLUMN brand_embeddings.embedding_type IS 'Classification of the embedded content';
COMMENT ON COLUMN brand_embeddings.content IS 'Original text content that was embedded';
COMMENT ON COLUMN brand_embeddings.embedding IS 'Vector(1536) embedding from text-embedding-3-small';
COMMENT ON COLUMN brand_embeddings.metadata IS 'Optional metadata for the embedding';
COMMENT ON COLUMN brand_embeddings.created_at IS 'Timestamp when the embedding was created';

-- ============================================================
-- 3. match_brand_embeddings function
-- ============================================================

CREATE OR REPLACE FUNCTION match_brand_embeddings(
  query_embedding vector(1536),
  match_brand_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
) RETURNS TABLE (
  id uuid,
  content text,
  embedding_type text,
  similarity float
) AS $$
  SELECT
    be.id,
    be.content,
    be.embedding_type,
    1 - (be.embedding <=> query_embedding) AS similarity
  FROM brand_embeddings be
  WHERE be.brand_profile_id = match_brand_id
    AND 1 - (be.embedding <=> query_embedding) > match_threshold
  ORDER BY be.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION match_brand_embeddings IS 'Returns brand embeddings for a given brand profile ordered by cosine similarity to the query embedding';

-- ============================================================
-- 4. document_templates
-- ============================================================

CREATE TABLE document_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id   uuid REFERENCES brand_profiles(id) ON DELETE CASCADE,
  template_type      text NOT NULL CHECK (template_type IN (
    'pitch_deck', 'financial_deck', 'seo_report', 'ops_report', 'investor_update',
    'analytics_report', 'marketing_deck', 'custom'
  )),
  name               text NOT NULL,
  description        text,
  template_config    jsonb NOT NULL DEFAULT '{}',
  component_sequence jsonb NOT NULL DEFAULT '[]',
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_templates_brand_profile_id ON document_templates (brand_profile_id);
CREATE INDEX idx_document_templates_template_type ON document_templates (template_type);
CREATE INDEX idx_document_templates_status ON document_templates (status);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_templates_select" ON document_templates FOR SELECT USING (true);
CREATE POLICY "document_templates_insert" ON document_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "document_templates_update" ON document_templates FOR UPDATE USING (true);
CREATE POLICY "document_templates_delete" ON document_templates FOR DELETE USING (true);

CREATE TRIGGER trg_document_templates_updated_at
  BEFORE UPDATE ON document_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE document_templates IS 'Reusable document templates (decks, reports) linked to brand profiles';
COMMENT ON COLUMN document_templates.id IS 'Primary key UUID for the document template';
COMMENT ON COLUMN document_templates.brand_profile_id IS 'FK to brand_profiles; null for global templates';
COMMENT ON COLUMN document_templates.template_type IS 'Type of document: pitch_deck, financial_deck, seo_report, etc.';
COMMENT ON COLUMN document_templates.name IS 'Human-readable template name';
COMMENT ON COLUMN document_templates.description IS 'Optional description of the template purpose';
COMMENT ON COLUMN document_templates.template_config IS 'Template-level configuration (page size, margins, etc.)';
COMMENT ON COLUMN document_templates.component_sequence IS 'Ordered array of component IDs or configs';
COMMENT ON COLUMN document_templates.status IS 'Template lifecycle status: active, draft, or archived';
COMMENT ON COLUMN document_templates.created_at IS 'Timestamp when the template was created';
COMMENT ON COLUMN document_templates.updated_at IS 'Timestamp of last template modification';

-- ============================================================
-- 5. document_components
-- ============================================================

CREATE TABLE document_components (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  component_type text NOT NULL CHECK (component_type IN (
    'kpi_card', 'table_block', 'chart_block', 'callout', 'timeline', 'pricing_table',
    'cover_slide', 'divider', 'text_block', 'image_block', 'two_column', 'header_block', 'footer_block'
  )),
  config         jsonb NOT NULL DEFAULT '{}',
  position       integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_components_template_id ON document_components (template_id);
CREATE INDEX idx_document_components_component_type ON document_components (component_type);
CREATE INDEX idx_document_components_template_position ON document_components (template_id, position);

ALTER TABLE document_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_components_select" ON document_components FOR SELECT USING (true);
CREATE POLICY "document_components_insert" ON document_components FOR INSERT WITH CHECK (true);
CREATE POLICY "document_components_update" ON document_components FOR UPDATE USING (true);
CREATE POLICY "document_components_delete" ON document_components FOR DELETE USING (true);

COMMENT ON TABLE document_components IS 'Individual components (blocks, slides) within document templates';
COMMENT ON COLUMN document_components.id IS 'Primary key UUID for the document component';
COMMENT ON COLUMN document_components.template_id IS 'FK to document_templates owning this component';
COMMENT ON COLUMN document_components.component_type IS 'Type of component: kpi_card, table_block, chart_block, etc.';
COMMENT ON COLUMN document_components.config IS 'Component-specific configuration';
COMMENT ON COLUMN document_components.position IS 'Order/position within the template';
COMMENT ON COLUMN document_components.created_at IS 'Timestamp when the component was created';

-- ============================================================
-- 6. brand_assets
-- ============================================================

CREATE TABLE brand_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  asset_type       text NOT NULL CHECK (asset_type IN (
    'logo', 'logo_dark', 'icon', 'favicon', 'og_image', 'watermark', 'background',
    'hero_image', 'email_header', 'email_footer', 'deck_logo', 'report_logo'
  )),
  uri              text NOT NULL,
  filename         text,
  mime_type        text,
  metadata         jsonb DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_assets_brand_profile_id ON brand_assets (brand_profile_id);
CREATE INDEX idx_brand_assets_asset_type ON brand_assets (asset_type);

ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_assets_select" ON brand_assets FOR SELECT USING (true);
CREATE POLICY "brand_assets_insert" ON brand_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "brand_assets_update" ON brand_assets FOR UPDATE USING (true);
CREATE POLICY "brand_assets_delete" ON brand_assets FOR DELETE USING (true);

COMMENT ON TABLE brand_assets IS 'Brand assets (logos, images) stored by URI';
COMMENT ON COLUMN brand_assets.id IS 'Primary key UUID for the brand asset';
COMMENT ON COLUMN brand_assets.brand_profile_id IS 'FK to brand_profiles owning this asset';
COMMENT ON COLUMN brand_assets.asset_type IS 'Type of asset: logo, icon, favicon, og_image, etc.';
COMMENT ON COLUMN brand_assets.uri IS 'Storage URI or URL for the asset';
COMMENT ON COLUMN brand_assets.filename IS 'Original filename if applicable';
COMMENT ON COLUMN brand_assets.mime_type IS 'MIME type of the asset';
COMMENT ON COLUMN brand_assets.metadata IS 'Optional metadata (dimensions, alt text, etc.)';
COMMENT ON COLUMN brand_assets.created_at IS 'Timestamp when the asset was created';

-- ============================================================
-- 7. ALTER initiatives: add brand_profile_id
-- ============================================================

ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS brand_profile_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_initiatives_brand_profile_id ON initiatives (brand_profile_id) WHERE brand_profile_id IS NOT NULL;
COMMENT ON COLUMN initiatives.brand_profile_id IS 'FK to brand_profiles; optional brand context for the initiative';

-- ============================================================
-- 8. ALTER llm_calls: add brand_profile_id
-- ============================================================

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS brand_profile_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_llm_calls_brand_profile_id ON llm_calls (brand_profile_id) WHERE brand_profile_id IS NOT NULL;
COMMENT ON COLUMN llm_calls.brand_profile_id IS 'FK to brand_profiles; optional brand context for the LLM call';

COMMIT;
