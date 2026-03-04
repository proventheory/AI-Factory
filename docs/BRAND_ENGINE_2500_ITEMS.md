# Brand Engine + BrandOS — 2,500-Item Implementation Checklist

> Comprehensive checklist for integrating the Brand Engine and BrandOS into the AI Factory platform.
> Each item is a specific, actionable task referencing files, columns, functions, or configs.

---

## 1. Schema: `brand_profiles` Table (Items 1–105)

### 1.1 Migration File Setup

- [ ] Create migration file `supabase/migrations/20250303000007_brand_engine.sql`
- [ ] Add header comment block with migration description, author, and date
- [ ] Add `BEGIN;` transaction wrapper at top of migration file
- [ ] Add `COMMIT;` at end of migration file
- [ ] Add idempotency guard `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'brand_profiles') THEN ...` or use `CREATE TABLE IF NOT EXISTS`

### 1.2 Table Creation

- [ ] Write `CREATE TABLE brand_profiles (` statement
- [ ] Add column `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- [ ] Add column `name text NOT NULL`
- [ ] Add column `brand_theme_id uuid REFERENCES brand_themes(id) ON DELETE SET NULL`
- [ ] Add column `identity jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `tone jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `visual_style jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `copy_style jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `design_tokens jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `deck_theme jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `report_theme jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `status text NOT NULL DEFAULT 'active'`
- [ ] Add column `created_at timestamptz NOT NULL DEFAULT now()`
- [ ] Add column `updated_at timestamptz NOT NULL DEFAULT now()`

### 1.3 CHECK Constraints

- [ ] Add CHECK constraint on `status` column: `CHECK (status IN ('active', 'draft', 'archived'))`
- [ ] Add CHECK constraint on `name` column: `CHECK (char_length(name) >= 1 AND char_length(name) <= 255)`
- [ ] Add CHECK constraint on `identity` column: validate jsonb is object `CHECK (jsonb_typeof(identity) = 'object')`
- [ ] Add CHECK constraint on `tone` column: validate jsonb is object `CHECK (jsonb_typeof(tone) = 'object')`
- [ ] Add CHECK constraint on `visual_style` column: validate jsonb is object `CHECK (jsonb_typeof(visual_style) = 'object')`
- [ ] Add CHECK constraint on `copy_style` column: validate jsonb is object `CHECK (jsonb_typeof(copy_style) = 'object')`
- [ ] Add CHECK constraint on `design_tokens` column: validate jsonb is object `CHECK (jsonb_typeof(design_tokens) = 'object')`
- [ ] Add CHECK constraint on `deck_theme` column: validate jsonb is object `CHECK (jsonb_typeof(deck_theme) = 'object')`
- [ ] Add CHECK constraint on `report_theme` column: validate jsonb is object `CHECK (jsonb_typeof(report_theme) = 'object')`

### 1.4 UNIQUE Constraints

- [ ] Add UNIQUE constraint on `name` column: `CONSTRAINT brand_profiles_name_unique UNIQUE (name)`

### 1.5 Indexes

- [ ] Create index `idx_brand_profiles_name` on `brand_profiles(name)`
- [ ] Create index `idx_brand_profiles_status` on `brand_profiles(status)`
- [ ] Create index `idx_brand_profiles_brand_theme_id` on `brand_profiles(brand_theme_id)`
- [ ] Create index `idx_brand_profiles_created_at` on `brand_profiles(created_at DESC)`
- [ ] Create GIN index `idx_brand_profiles_identity` on `brand_profiles USING gin(identity)`
- [ ] Create GIN index `idx_brand_profiles_tone` on `brand_profiles USING gin(tone)`
- [ ] Create GIN index `idx_brand_profiles_design_tokens` on `brand_profiles USING gin(design_tokens)`

### 1.6 RLS Policies

- [ ] Enable Row Level Security on `brand_profiles`: `ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;`
- [ ] Create RLS policy `brand_profiles_select_policy` for SELECT using `auth.role() = 'authenticated'`
- [ ] Create RLS policy `brand_profiles_insert_policy` for INSERT with check `auth.role() = 'authenticated'`
- [ ] Create RLS policy `brand_profiles_update_policy` for UPDATE using `auth.role() = 'authenticated'`
- [ ] Create RLS policy `brand_profiles_delete_policy` for DELETE using `auth.role() = 'authenticated'`
- [ ] Add service-role bypass policy for `brand_profiles` SELECT
- [ ] Add service-role bypass policy for `brand_profiles` INSERT
- [ ] Add service-role bypass policy for `brand_profiles` UPDATE
- [ ] Add service-role bypass policy for `brand_profiles` DELETE

### 1.7 Column Comments

- [ ] Add `COMMENT ON COLUMN brand_profiles.id IS 'Primary key UUID for the brand profile'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.name IS 'Human-readable brand profile name, unique across the system'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.brand_theme_id IS 'FK to brand_themes for base visual theme inheritance'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.identity IS 'Brand identity: archetype, industry, tagline, mission, values'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.tone IS 'Tone of voice: descriptors, reading_level, sentence_length, formality'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.visual_style IS 'Visual preferences: density, style_description, image_style, illustration_style'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.copy_style IS 'Copywriting rules: voice, banned_words, preferred_phrases, cta_style'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.design_tokens IS 'Design tokens JSON: color, typography, spacing, layout, radius, shadow, motion, border'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.deck_theme IS 'Presentation theme: slide_master, chart_colors, kpi_card_style, table_style'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.report_theme IS 'Report theme: header_style, section_spacing, chart_defaults, callout_style'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.status IS 'Profile lifecycle status: active, draft, or archived'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.created_at IS 'Timestamp when the brand profile was created'`
- [ ] Add `COMMENT ON COLUMN brand_profiles.updated_at IS 'Timestamp of last brand profile modification'`
- [ ] Add `COMMENT ON TABLE brand_profiles IS 'Stores brand identity, tone, visual style, copy rules, and design tokens for BrandOS'`

### 1.8 Updated-at Trigger

- [ ] Create or replace function `update_brand_profiles_updated_at()` returning trigger that sets `NEW.updated_at = now()`
- [ ] Create trigger `trg_brand_profiles_updated_at` BEFORE UPDATE on `brand_profiles` executing `update_brand_profiles_updated_at()`
- [ ] Verify trigger fires on UPDATE by inserting a row, updating it, and checking `updated_at` changed

### 1.9 deck_theme JSON Structure Defaults

- [ ] Define default `deck_theme.slide_master.background_color` as `'#FFFFFF'` in identity jsonb default or docs
- [ ] Define default `deck_theme.slide_master.logo_position` as `'top-right'`
- [ ] Define default `deck_theme.slide_master.font_family` as `'Inter'`
- [ ] Define default `deck_theme.slide_master.title_font_size` as `28`
- [ ] Define default `deck_theme.slide_master.body_font_size` as `16`
- [ ] Define default `deck_theme.chart_colors` as JSON array of 8 hex colors
- [ ] Define default `deck_theme.kpi_card.background` as surface color
- [ ] Define default `deck_theme.kpi_card.value_font_size` as `36`
- [ ] Define default `deck_theme.kpi_card.label_font_size` as `14`
- [ ] Define default `deck_theme.kpi_card.border_radius` as `8`
- [ ] Define default `deck_theme.table_style.header_background` as brand primary
- [ ] Define default `deck_theme.table_style.header_text_color` as `'#FFFFFF'`
- [ ] Define default `deck_theme.table_style.row_stripe_color` as neutral-50
- [ ] Define default `deck_theme.table_style.border_color` as border default

### 1.10 report_theme JSON Structure Defaults

- [ ] Define default `report_theme.header.background_color` as brand primary
- [ ] Define default `report_theme.header.text_color` as `'#FFFFFF'`
- [ ] Define default `report_theme.header.logo_position` as `'left'`
- [ ] Define default `report_theme.header.height` as `80`
- [ ] Define default `report_theme.section_spacing` as `32`
- [ ] Define default `report_theme.chart_defaults.type` as `'bar'`
- [ ] Define default `report_theme.chart_defaults.color_sequence` referencing `deck_theme.chart_colors`
- [ ] Define default `report_theme.chart_defaults.grid_lines` as `true`
- [ ] Define default `report_theme.callout_style.background` as brand-50
- [ ] Define default `report_theme.callout_style.border_left_color` as brand-500
- [ ] Define default `report_theme.callout_style.border_left_width` as `4`
- [ ] Define default `report_theme.callout_style.padding` as `16`
- [ ] Define default `report_theme.callout_style.font_style` as `'italic'`

### 1.11 Validation

- [ ] Verify migration runs cleanly on a fresh database with `psql -f 20250303000007_brand_engine.sql`
- [ ] Verify `\d brand_profiles` shows all columns with correct types
- [ ] Verify all CHECK constraints are listed in `\d brand_profiles`
- [ ] Verify all indexes are listed with `\di` filtered to `brand_profiles`
- [ ] Verify RLS policies are active with `SELECT * FROM pg_policies WHERE tablename = 'brand_profiles'`

- [ ] Add `COMMENT ON CONSTRAINT brand_profiles_name_unique` explaining uniqueness requirement
- [ ] Add `COMMENT ON INDEX idx_brand_profiles_name` explaining index purpose
- [ ] Add `COMMENT ON INDEX idx_brand_profiles_status` explaining query pattern
- [ ] Verify `deck_theme` default JSON is valid by inserting a row with DEFAULT and reading back
- [ ] Verify `report_theme` default JSON is valid by inserting a row with DEFAULT and reading back
- [ ] Test inserting a brand_profile with all fields populated and verify SELECT returns correct types
- [ ] Test inserting a brand_profile with only required fields (name) and verify defaults applied
- [ ] Verify `updated_at` trigger does not fire on INSERT (only on UPDATE)
- [ ] Test concurrent INSERTs with same name — verify one fails with unique constraint violation
- [ ] Verify `brand_theme_id` FK constraint by inserting with a non-existent brand_theme_id — expect failure
- [ ] Document the brand_profiles table in the migration file header comment block

---

## 2. Schema: `brand_embeddings` Table (Items 106–190)

### 2.1 pgvector Extension

- [ ] Add `CREATE EXTENSION IF NOT EXISTS vector;` at top of migration (before brand_embeddings table)
- [ ] Verify pgvector extension installed with `SELECT * FROM pg_extension WHERE extname = 'vector'`

### 2.2 Table Creation

- [ ] Write `CREATE TABLE brand_embeddings (` statement in same migration file
- [ ] Add column `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- [ ] Add column `brand_profile_id uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE`
- [ ] Add column `embedding_type text NOT NULL`
- [ ] Add column `content text NOT NULL`
- [ ] Add column `embedding vector(1536) NOT NULL`
- [ ] Add column `metadata jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `created_at timestamptz NOT NULL DEFAULT now()`

### 2.3 CHECK Constraints

- [ ] Add CHECK constraint on `embedding_type`: `CHECK (embedding_type IN ('brand_description','copy_example','visual_guidelines','sample_ad','sample_email','tone_description','style_guide','competitor_analysis'))`
- [ ] Add CHECK constraint on `content`: `CHECK (char_length(content) >= 1)`
- [ ] Add CHECK constraint on `metadata`: `CHECK (jsonb_typeof(metadata) = 'object')`

### 2.4 Indexes

- [ ] Create index `idx_brand_embeddings_brand_profile_id` on `brand_embeddings(brand_profile_id)`
- [ ] Create index `idx_brand_embeddings_embedding_type` on `brand_embeddings(embedding_type)`
- [ ] Create index `idx_brand_embeddings_created_at` on `brand_embeddings(created_at DESC)`
- [ ] Create IVFFlat index `idx_brand_embeddings_embedding_ivfflat` on `brand_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`
- [ ] Add comment on IVFFlat index explaining lists parameter should scale with data volume

### 2.5 RLS Policies

- [ ] Enable RLS on `brand_embeddings`: `ALTER TABLE brand_embeddings ENABLE ROW LEVEL SECURITY;`
- [ ] Create RLS policy `brand_embeddings_select_policy` for SELECT
- [ ] Create RLS policy `brand_embeddings_insert_policy` for INSERT
- [ ] Create RLS policy `brand_embeddings_update_policy` for UPDATE
- [ ] Create RLS policy `brand_embeddings_delete_policy` for DELETE
- [ ] Add service-role bypass policy for `brand_embeddings` SELECT
- [ ] Add service-role bypass policy for `brand_embeddings` INSERT
- [ ] Add service-role bypass policy for `brand_embeddings` DELETE

### 2.6 Column Comments

- [ ] Add `COMMENT ON COLUMN brand_embeddings.id IS 'Primary key UUID for the brand embedding record'`
- [ ] Add `COMMENT ON COLUMN brand_embeddings.brand_profile_id IS 'FK to brand_profiles owning this embedding'`
- [ ] Add `COMMENT ON COLUMN brand_embeddings.embedding_type IS 'Classification of the embedded content'`
- [ ] Add `COMMENT ON COLUMN brand_embeddings.content IS 'Original text content that was embedded'`
- [ ] Add `COMMENT ON COLUMN brand_embeddings.embedding IS 'Vector(1536) embedding from text-embedding-3-small'`
- [ ] Add `COMMENT ON COLUMN brand_embeddings.metadata IS 'Additional metadata: source, author, version'`
- [ ] Add `COMMENT ON COLUMN brand_embeddings.created_at IS 'Timestamp when the embedding was created'`
- [ ] Add `COMMENT ON TABLE brand_embeddings IS 'Stores vector embeddings of brand content for RAG similarity search'`

### 2.7 Helper Functions

- [ ] Create function `match_brand_embeddings(brand_id uuid, query_embedding vector(1536), match_count int)` returning table
- [ ] Function body: `SELECT id, content, embedding_type, metadata, 1 - (embedding <=> query_embedding) AS similarity FROM brand_embeddings WHERE brand_profile_id = brand_id ORDER BY embedding <=> query_embedding LIMIT match_count`
- [ ] Add COMMENT on function explaining cosine similarity ranking
- [ ] Create function `count_brand_embeddings_by_type(brand_id uuid)` returning table of `(embedding_type text, count bigint)`
- [ ] Grant EXECUTE on `match_brand_embeddings` to authenticated role
- [ ] Grant EXECUTE on `count_brand_embeddings_by_type` to authenticated role

### 2.8 Validation

- [ ] Verify `\d brand_embeddings` shows all columns with correct types
- [ ] Verify vector column shows type `vector(1536)`
- [ ] Verify FK constraint on `brand_profile_id` with cascading delete
- [ ] Verify IVFFlat index exists with `\di` filtered to `brand_embeddings`
- [ ] Insert test embedding and verify `match_brand_embeddings` returns results
- [ ] Verify CHECK constraint on `embedding_type` rejects invalid values
- [ ] Verify `count_brand_embeddings_by_type` returns correct counts
- [ ] Verify cascading delete: delete brand_profile removes associated embeddings

### 2.9 Performance

- [ ] Add comment noting IVFFlat `lists` parameter should be tuned when row count exceeds 10,000
- [ ] Add comment noting HNSW index as alternative for lower-latency search at scale
- [ ] Document recommended `probes` setting for IVFFlat queries in migration comments
- [ ] Verify embedding insert performance with 100 test vectors
- [ ] Verify similarity search performance with 1,000 test vectors

- [ ] Add NOT NULL constraint on `brand_profile_id` column in brand_embeddings
- [ ] Add `COMMENT ON CONSTRAINT` for embedding_type CHECK constraint
- [ ] Add `COMMENT ON INDEX idx_brand_embeddings_embedding_ivfflat` explaining IVFFlat parameters
- [ ] Verify embedding column accepts exactly 1536-dimension vectors
- [ ] Verify embedding column rejects vectors with wrong dimension (e.g., 768)
- [ ] Test `match_brand_embeddings` with empty table returns empty result set
- [ ] Test `match_brand_embeddings` with single embedding returns it with similarity 1.0 for identical query
- [ ] Verify `count_brand_embeddings_by_type` groups correctly with multiple types
- [ ] Test RLS policy: authenticated user can INSERT into brand_embeddings
- [ ] Test RLS policy: authenticated user can SELECT from brand_embeddings
- [ ] Test RLS policy: authenticated user can DELETE from brand_embeddings
- [ ] Add `COMMENT ON FUNCTION match_brand_embeddings` with parameter descriptions
- [ ] Add `COMMENT ON FUNCTION count_brand_embeddings_by_type` with usage notes
- [ ] Verify IVFFlat index creation does not block concurrent reads during build
- [ ] Test inserting 10 embeddings and verify `match_brand_embeddings` returns them ranked by similarity
- [ ] Verify metadata jsonb stores nested objects correctly
- [ ] Test inserting embedding with empty metadata `{}` succeeds
- [ ] Test inserting embedding with rich metadata `{source: 'manual', version: 1}` succeeds
- [ ] Verify `brand_profile_id` FK index speeds up JOIN queries
- [ ] Verify `embedding_type` index speeds up filtered queries
- [ ] Add `COMMENT ON INDEX idx_brand_embeddings_brand_profile_id` explaining FK lookup optimization
- [ ] Add `COMMENT ON INDEX idx_brand_embeddings_embedding_type` explaining filter optimization
- [ ] Test that deleting a brand_profile cascades to delete all its embeddings
- [ ] Verify embedding vector is not returned in SELECT * (or document that it is returned)
- [ ] Create helper view `brand_embeddings_summary` showing count and types per brand without vectors
- [ ] Grant SELECT on `brand_embeddings_summary` view to authenticated role
- [ ] Verify pgvector extension version is >= 0.5.0 for IVFFlat support
- [ ] Document pgvector version requirement in migration header comment
- [ ] Test `match_brand_embeddings` with `match_count = 0` returns empty result
- [ ] Test `match_brand_embeddings` with `match_count = 1` returns single best match
- [ ] Verify cosine similarity returns values between -1 and 1 (function maps to 0-2 range via `1 - distance`)
- [ ] Add comment in migration noting that IVFFlat index should be rebuilt after bulk inserts

---

## 3. Schema: FK on `initiatives` + `document_templates` (Items 191–285)

### 3.1 ALTER initiatives Table

- [ ] Add `ALTER TABLE initiatives ADD COLUMN brand_profile_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;`
- [ ] Add `CREATE INDEX idx_initiatives_brand_profile_id ON initiatives(brand_profile_id);`
- [ ] Add `COMMENT ON COLUMN initiatives.brand_profile_id IS 'Optional FK to brand_profiles for brand-aware generation'`
- [ ] Verify ALTER succeeds on existing initiatives table with data
- [ ] Verify NULL is allowed (existing rows get NULL)

### 3.2 document_templates Table

- [ ] Write `CREATE TABLE document_templates (` statement in same migration
- [ ] Add column `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- [ ] Add column `brand_profile_id uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE`
- [ ] Add column `template_type text NOT NULL`
- [ ] Add column `name text NOT NULL`
- [ ] Add column `template_config jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `component_sequence jsonb NOT NULL DEFAULT '[]'::jsonb`
- [ ] Add column `status text NOT NULL DEFAULT 'active'`
- [ ] Add column `created_at timestamptz NOT NULL DEFAULT now()`
- [ ] Add column `updated_at timestamptz NOT NULL DEFAULT now()`

### 3.3 document_templates CHECK Constraints

- [ ] Add CHECK on `template_type`: `CHECK (template_type IN ('pitch_deck','financial_deck','seo_report','ops_report','investor_update','analytics_report','custom'))`
- [ ] Add CHECK on `status`: `CHECK (status IN ('active','draft','archived'))`
- [ ] Add CHECK on `name`: `CHECK (char_length(name) >= 1 AND char_length(name) <= 255)`
- [ ] Add CHECK on `template_config`: `CHECK (jsonb_typeof(template_config) = 'object')`
- [ ] Add CHECK on `component_sequence`: `CHECK (jsonb_typeof(component_sequence) = 'array')`

### 3.4 document_templates Indexes

- [ ] Create index `idx_document_templates_brand_profile_id` on `document_templates(brand_profile_id)`
- [ ] Create index `idx_document_templates_template_type` on `document_templates(template_type)`
- [ ] Create index `idx_document_templates_status` on `document_templates(status)`
- [ ] Create index `idx_document_templates_name` on `document_templates(name)`
- [ ] Create composite index `idx_document_templates_brand_type` on `document_templates(brand_profile_id, template_type)`

### 3.5 document_templates RLS

- [ ] Enable RLS on `document_templates`
- [ ] Create RLS policy `document_templates_select_policy` for SELECT
- [ ] Create RLS policy `document_templates_insert_policy` for INSERT
- [ ] Create RLS policy `document_templates_update_policy` for UPDATE
- [ ] Create RLS policy `document_templates_delete_policy` for DELETE
- [ ] Add service-role bypass policies for document_templates (SELECT, INSERT, UPDATE, DELETE)

### 3.6 document_templates Column Comments

- [ ] Add COMMENT on `document_templates.id`
- [ ] Add COMMENT on `document_templates.brand_profile_id`
- [ ] Add COMMENT on `document_templates.template_type`
- [ ] Add COMMENT on `document_templates.name`
- [ ] Add COMMENT on `document_templates.template_config`
- [ ] Add COMMENT on `document_templates.component_sequence`
- [ ] Add COMMENT on `document_templates.status`
- [ ] Add COMMENT on `document_templates.created_at`
- [ ] Add COMMENT on `document_templates.updated_at`
- [ ] Add COMMENT on TABLE `document_templates`

### 3.7 document_templates Updated-at Trigger

- [ ] Create function `update_document_templates_updated_at()` returning trigger
- [ ] Create trigger `trg_document_templates_updated_at` BEFORE UPDATE on `document_templates`
- [ ] Verify trigger fires correctly

### 3.8 document_components Table

- [ ] Write `CREATE TABLE document_components (` statement
- [ ] Add column `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- [ ] Add column `template_id uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE`
- [ ] Add column `component_type text NOT NULL`
- [ ] Add column `config jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `position int NOT NULL DEFAULT 0`
- [ ] Add column `created_at timestamptz NOT NULL DEFAULT now()`

### 3.9 document_components CHECK Constraints

- [ ] Add CHECK on `component_type`: `CHECK (component_type IN ('kpi_card','table','chart','callout','timeline','pricing','cover','divider','text','image','two_column','header','footer'))`
- [ ] Add CHECK on `config`: `CHECK (jsonb_typeof(config) = 'object')`
- [ ] Add CHECK on `position`: `CHECK (position >= 0)`

### 3.10 document_components Indexes & RLS

- [ ] Create index `idx_document_components_template_id` on `document_components(template_id)`
- [ ] Create composite index `idx_document_components_template_position` on `document_components(template_id, position)`
- [ ] Enable RLS on `document_components`
- [ ] Create RLS policies for SELECT, INSERT, UPDATE, DELETE on `document_components`
- [ ] Add service-role bypass policies for `document_components`

### 3.11 document_components Comments

- [ ] Add COMMENT on `document_components.id`
- [ ] Add COMMENT on `document_components.template_id`
- [ ] Add COMMENT on `document_components.component_type`
- [ ] Add COMMENT on `document_components.config`
- [ ] Add COMMENT on `document_components.position`
- [ ] Add COMMENT on `document_components.created_at`
- [ ] Add COMMENT on TABLE `document_components`

### 3.12 Validation

- [ ] Verify `document_templates` table created with `\d document_templates`
- [ ] Verify `document_components` table created with `\d document_components`
- [ ] Verify FK cascade: deleting a document_template removes its components
- [ ] Verify FK cascade: deleting a brand_profile removes its document_templates
- [ ] Test inserting a document_template with a valid component_sequence JSON array
- [ ] Test inserting document_components with sequential position values
- [ ] Verify CHECK on `template_type` rejects invalid values
- [ ] Verify CHECK on `component_type` rejects invalid values

- [ ] Verify ALTER TABLE on initiatives does not lock table for extended period
- [ ] Test that existing initiatives with NULL brand_profile_id are queryable
- [ ] Add migration comment explaining why ON DELETE SET NULL is chosen for initiatives FK
- [ ] Verify document_templates.brand_profile_id FK cascade by deleting brand and checking templates removed
- [ ] Add UNIQUE constraint on `document_templates(brand_profile_id, name)` to prevent duplicate template names per brand
- [ ] Add `COMMENT ON CONSTRAINT` for template_type CHECK constraint
- [ ] Add `COMMENT ON CONSTRAINT` for component_type CHECK constraint
- [ ] Add `COMMENT ON INDEX idx_document_templates_brand_type` explaining composite index query pattern
- [ ] Verify document_components.position ordering works correctly with `ORDER BY position ASC`
- [ ] Test inserting 10 document_components with sequential positions 0-9
- [ ] Test that document_components can have duplicate positions (or add UNIQUE constraint on template_id+position)
- [ ] Verify updated_at trigger on document_templates fires correctly
- [ ] Add COMMENT explaining component_sequence jsonb stores ordered array of component type references
- [ ] Add COMMENT explaining template_config stores template-level settings like page size and orientation
- [ ] Create helper function `get_template_with_components(template_id uuid)` returning template + components JSON
- [ ] Grant EXECUTE on `get_template_with_components` to authenticated role
- [ ] Test `get_template_with_components` returns components ordered by position
- [ ] Verify service-role bypass policies work for document_templates CRUD
- [ ] Verify service-role bypass policies work for document_components CRUD
- [ ] Test inserting a document_component with `position = -1` fails due to CHECK constraint
- [ ] Add `COMMENT ON TRIGGER trg_document_templates_updated_at` explaining auto-update behavior

---

## 4. Schema: `brand_assets` Table (Items 286–345)

### 4.1 Table Creation

- [ ] Write `CREATE TABLE brand_assets (` statement in same migration
- [ ] Add column `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- [ ] Add column `brand_profile_id uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE`
- [ ] Add column `asset_type text NOT NULL`
- [ ] Add column `uri text NOT NULL`
- [ ] Add column `metadata jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] Add column `created_at timestamptz NOT NULL DEFAULT now()`

### 4.2 CHECK Constraints

- [ ] Add CHECK on `asset_type`: `CHECK (asset_type IN ('logo','icon','favicon','og_image','watermark','background','brand_mark','pattern'))`
- [ ] Add CHECK on `uri`: `CHECK (char_length(uri) >= 1)`
- [ ] Add CHECK on `metadata`: `CHECK (jsonb_typeof(metadata) = 'object')`

### 4.3 Indexes

- [ ] Create index `idx_brand_assets_brand_profile_id` on `brand_assets(brand_profile_id)`
- [ ] Create index `idx_brand_assets_asset_type` on `brand_assets(asset_type)`
- [ ] Create composite index `idx_brand_assets_brand_type` on `brand_assets(brand_profile_id, asset_type)`

### 4.4 RLS

- [ ] Enable RLS on `brand_assets`
- [ ] Create RLS policy `brand_assets_select_policy` for SELECT
- [ ] Create RLS policy `brand_assets_insert_policy` for INSERT
- [ ] Create RLS policy `brand_assets_update_policy` for UPDATE
- [ ] Create RLS policy `brand_assets_delete_policy` for DELETE
- [ ] Add service-role bypass policies for `brand_assets` (SELECT, INSERT, UPDATE, DELETE)

### 4.5 Column Comments

- [ ] Add COMMENT on `brand_assets.id`
- [ ] Add COMMENT on `brand_assets.brand_profile_id`
- [ ] Add COMMENT on `brand_assets.asset_type`
- [ ] Add COMMENT on `brand_assets.uri`
- [ ] Add COMMENT on `brand_assets.metadata` — describe expected keys: `width`, `height`, `format`, `file_size`
- [ ] Add COMMENT on `brand_assets.created_at`
- [ ] Add COMMENT on TABLE `brand_assets`

### 4.6 UNIQUE Constraint

- [ ] Add UNIQUE constraint `brand_assets_brand_type_unique` on `(brand_profile_id, asset_type)` to enforce one asset per type per brand
- [ ] Alternatively document that multiple assets of same type are allowed and skip unique constraint

### 4.7 Helper Functions

- [ ] Create function `get_brand_asset_uri(brand_id uuid, type text)` returning `text` — returns URI for specific asset type
- [ ] Grant EXECUTE on `get_brand_asset_uri` to authenticated role
- [ ] Add COMMENT on function

### 4.8 Validation

- [ ] Verify `\d brand_assets` shows all columns with correct types
- [ ] Verify FK cascade: deleting brand_profile removes its brand_assets
- [ ] Test inserting assets with each valid `asset_type` value
- [ ] Verify CHECK constraint rejects invalid `asset_type`
- [ ] Verify `get_brand_asset_uri` returns correct URI
- [ ] Verify metadata jsonb accepts arbitrary key-value pairs

### 4.9 Migration Finalization

- [ ] Add final validation queries at end of migration file as comments
- [ ] Verify full migration runs end-to-end without errors
- [ ] Test migration rollback path (document DROP TABLE statements as comments)
- [ ] Run `supabase db push` or equivalent to apply migration to local dev
- [ ] Verify all five tables exist: `brand_profiles`, `brand_embeddings`, `document_templates`, `document_components`, `brand_assets`

- [ ] Add migration comment explaining brand_assets stores external URIs, not binary data
- [ ] Verify composite index `brand_assets_brand_type` speeds up filtered queries
- [ ] Test inserting brand_asset with each valid asset_type and verify storage
- [ ] Test inserting brand_asset with metadata containing `{width: 200, height: 100, format: 'png'}`
- [ ] Verify `get_brand_asset_uri` returns NULL for non-existent asset type
- [ ] Test `get_brand_asset_uri` returns correct URI for existing logo asset
- [ ] Add `COMMENT ON INDEX idx_brand_assets_brand_type` explaining query optimization
- [ ] Verify brand_assets RLS allows authenticated users to read assets
- [ ] Verify brand_assets RLS allows authenticated users to insert assets
- [ ] Verify brand_assets RLS allows authenticated users to delete their assets
- [ ] Test inserting an asset with a very long URI (2048 chars) succeeds
- [ ] Test inserting an asset with empty URI fails due to CHECK constraint
- [ ] Add `updated_at` column to brand_assets table with default `now()` and trigger
- [ ] Create trigger `trg_brand_assets_updated_at` BEFORE UPDATE on brand_assets
- [ ] Add COMMENT on the updated_at trigger for brand_assets
- [ ] Verify migration handles the case where pgvector extension already exists
- [ ] Add migration step to verify all FKs are valid after all tables created
- [ ] Document all tables created by this migration in a summary comment at end of file

---

## 5. Control Plane API — Brand Profiles CRUD (Items 346–525)

### 5.1 TypeScript Types

- [ ] Create file `control-plane/src/types/brand-profile.ts`
- [ ] Define interface `BrandProfile` with fields: `id`, `name`, `brand_theme_id`, `identity`, `tone`, `visual_style`, `copy_style`, `design_tokens`, `deck_theme`, `report_theme`, `status`, `created_at`, `updated_at`
- [ ] Define interface `BrandIdentity` with fields: `archetype`, `industry`, `tagline`, `mission`, `values`
- [ ] Define interface `BrandTone` with fields: `voice_descriptors`, `reading_level`, `sentence_length`, `formality`
- [ ] Define interface `BrandVisualStyle` with fields: `density`, `style_description`, `image_style`, `illustration_style`
- [ ] Define interface `BrandCopyStyle` with fields: `voice`, `banned_words`, `preferred_phrases`, `cta_style`
- [ ] Define interface `BrandDesignTokens` mirroring `packages/ui/src/tokens.ts` structure
- [ ] Define interface `DeckTheme` with `slide_master`, `chart_colors`, `kpi_card`, `table_style`
- [ ] Define interface `ReportTheme` with `header`, `section_spacing`, `chart_defaults`, `callout_style`
- [ ] Define interface `BrandProfileCreate` with `name` required, rest optional
- [ ] Define interface `BrandProfileUpdate` with all fields optional
- [ ] Define interface `BrandProfileListQuery` with `status`, `limit`, `offset`, `search`
- [ ] Define interface `PaginatedResponse<T>` with `data`, `total`, `limit`, `offset`
- [ ] Export all types from `control-plane/src/types/index.ts`

### 5.2 Validation Helpers

- [ ] Create file `control-plane/src/validators/brand-profile.validator.ts`
- [ ] Implement `validateBrandProfileCreate(body)`: check `name` is present and non-empty string
- [ ] Implement `validateBrandProfileUpdate(body)`: check at least one field is present
- [ ] Implement `validateBrandProfileListQuery(query)`: validate `limit` is positive int, `offset` >= 0
- [ ] Implement `validateJsonbField(field, value)`: check value is a plain object if provided
- [ ] Implement `validateStatus(status)`: check value is in `['active','draft','archived']`
- [ ] Return structured `{valid: boolean, errors: string[]}` from each validator
- [ ] Add `sanitizeBrandProfileInput(body)`: strip unknown keys, trim strings

### 5.3 GET /v1/brand_profiles — List

- [ ] Add route `GET /v1/brand_profiles` to `control-plane/src/api.ts` router
- [ ] Parse query params: `status` (optional string), `limit` (default 20, max 100), `offset` (default 0), `search` (optional string)
- [ ] Validate query params using `validateBrandProfileListQuery`
- [ ] Build SQL query: `SELECT * FROM brand_profiles WHERE 1=1`
- [ ] Append `AND status = $n` if `status` param provided
- [ ] Append `AND name ILIKE $n` if `search` param provided (wrap with `%`)
- [ ] Append `ORDER BY created_at DESC`
- [ ] Append `LIMIT $n OFFSET $n`
- [ ] Execute count query: `SELECT count(*) FROM brand_profiles WHERE ...` with same filters
- [ ] Return response: `{ data: BrandProfile[], total: number, limit: number, offset: number }`
- [ ] Handle empty result: return `{ data: [], total: 0, limit, offset }`
- [ ] Handle database error: return 500 with error message
- [ ] Log query execution time for observability
- [ ] Set `Content-Type: application/json` header

### 5.4 GET /v1/brand_profiles/:id — Detail

- [ ] Add route `GET /v1/brand_profiles/:id` to router
- [ ] Validate `:id` param is a valid UUID format
- [ ] Return 400 if `:id` is not a valid UUID
- [ ] Execute query: `SELECT bp.*, bt.token_overrides, bt.component_variants FROM brand_profiles bp LEFT JOIN brand_themes bt ON bp.brand_theme_id = bt.id WHERE bp.id = $1`
- [ ] Return 404 with `{ error: 'Brand profile not found' }` if no row returned
- [ ] Merge `design_tokens` from brand_profile with `token_overrides` from brand_theme (profile takes precedence)
- [ ] Include `resolved_design_tokens` in response with the merged tokens
- [ ] Include `deck_theme` in response
- [ ] Include `report_theme` in response
- [ ] Return 200 with the full `BrandProfile` object
- [ ] Handle database error: return 500

### 5.5 POST /v1/brand_profiles — Create

- [ ] Add route `POST /v1/brand_profiles` to router
- [ ] Parse request body as JSON
- [ ] Validate body using `validateBrandProfileCreate`
- [ ] Return 400 with `{ error: 'name is required' }` if name missing
- [ ] Return 400 with `{ errors: [...] }` if validation fails
- [ ] Validate `brand_theme_id` FK exists if provided: `SELECT id FROM brand_themes WHERE id = $1`
- [ ] Return 400 with `{ error: 'Invalid brand_theme_id' }` if FK check fails
- [ ] Build INSERT query with parameterized values for all provided fields
- [ ] Use `DEFAULT` for missing optional jsonb fields
- [ ] Execute INSERT with `RETURNING *`
- [ ] Handle unique constraint violation on `name`: return 409 with `{ error: 'Brand profile with this name already exists' }`
- [ ] Return 201 with the created `BrandProfile` object
- [ ] Set `Location` header to `/v1/brand_profiles/{id}`
- [ ] Handle database error: return 500
- [ ] Log brand profile creation event

### 5.6 PUT /v1/brand_profiles/:id — Update

- [ ] Add route `PUT /v1/brand_profiles/:id` to router
- [ ] Validate `:id` param is a valid UUID
- [ ] Parse request body as JSON
- [ ] Validate body using `validateBrandProfileUpdate`
- [ ] Return 400 if no updatable fields provided
- [ ] Check brand profile exists: `SELECT id FROM brand_profiles WHERE id = $1`
- [ ] Return 404 if not found
- [ ] For jsonb fields (`identity`, `tone`, `visual_style`, `copy_style`, `design_tokens`, `deck_theme`, `report_theme`): merge with existing values using `jsonb_concat` or `||` operator
- [ ] Build dynamic UPDATE query with only provided fields
- [ ] Set `updated_at = now()` explicitly (also covered by trigger)
- [ ] Execute UPDATE with `RETURNING *`
- [ ] Handle unique constraint violation on `name`: return 409
- [ ] Return 200 with the updated `BrandProfile` object
- [ ] Handle database error: return 500
- [ ] Log brand profile update event

### 5.7 DELETE /v1/brand_profiles/:id — Soft Delete

- [ ] Add route `DELETE /v1/brand_profiles/:id` to router
- [ ] Validate `:id` param is a valid UUID
- [ ] Check brand profile exists: `SELECT id, status FROM brand_profiles WHERE id = $1`
- [ ] Return 404 if not found
- [ ] Execute `UPDATE brand_profiles SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING *`
- [ ] Return 200 with the archived `BrandProfile` object
- [ ] Handle database error: return 500
- [ ] Log brand profile archival event

### 5.8 Router Registration

- [ ] Import brand profile route handlers in `control-plane/src/api.ts`
- [ ] Register routes under `/v1/brand_profiles` prefix
- [ ] Add authentication middleware to all brand profile routes
- [ ] Add request logging middleware to all brand profile routes
- [ ] Verify routes don't conflict with existing routes

### 5.9 Unit Tests — Validation

- [ ] Create test file `control-plane/src/validators/__tests__/brand-profile.validator.test.ts`
- [ ] Test `validateBrandProfileCreate` with valid name → passes
- [ ] Test `validateBrandProfileCreate` with empty name → fails
- [ ] Test `validateBrandProfileCreate` with missing name → fails
- [ ] Test `validateBrandProfileCreate` with name exceeding 255 chars → fails
- [ ] Test `validateBrandProfileUpdate` with at least one field → passes
- [ ] Test `validateBrandProfileUpdate` with empty body → fails
- [ ] Test `validateBrandProfileListQuery` with valid params → passes
- [ ] Test `validateBrandProfileListQuery` with negative offset → fails
- [ ] Test `validateBrandProfileListQuery` with limit > 100 → clamped or fails
- [ ] Test `validateJsonbField` with valid object → passes
- [ ] Test `validateJsonbField` with array → fails
- [ ] Test `validateJsonbField` with null → passes (optional)
- [ ] Test `validateStatus` with 'active' → passes
- [ ] Test `validateStatus` with 'invalid' → fails

### 5.10 Unit Tests — Route Handlers

- [ ] Create test file `control-plane/src/__tests__/brand-profiles.test.ts`
- [ ] Test GET /v1/brand_profiles returns 200 with empty array when no profiles exist
- [ ] Test GET /v1/brand_profiles returns paginated results
- [ ] Test GET /v1/brand_profiles with `status=active` filters correctly
- [ ] Test GET /v1/brand_profiles with `search=foo` filters by name
- [ ] Test GET /v1/brand_profiles with `limit=5&offset=10` paginates correctly
- [ ] Test GET /v1/brand_profiles/:id returns 200 with full profile
- [ ] Test GET /v1/brand_profiles/:id returns 404 for non-existent ID
- [ ] Test GET /v1/brand_profiles/:id returns 400 for invalid UUID
- [ ] Test GET /v1/brand_profiles/:id includes resolved_design_tokens merged with brand_theme
- [ ] Test POST /v1/brand_profiles creates profile and returns 201
- [ ] Test POST /v1/brand_profiles returns 400 when name missing
- [ ] Test POST /v1/brand_profiles returns 409 on duplicate name
- [ ] Test POST /v1/brand_profiles stores all jsonb fields correctly
- [ ] Test PUT /v1/brand_profiles/:id updates name
- [ ] Test PUT /v1/brand_profiles/:id merges jsonb fields with existing values
- [ ] Test PUT /v1/brand_profiles/:id returns 404 for non-existent ID
- [ ] Test PUT /v1/brand_profiles/:id returns 409 on duplicate name
- [ ] Test DELETE /v1/brand_profiles/:id sets status to archived
- [ ] Test DELETE /v1/brand_profiles/:id returns 404 for non-existent ID

### 5.11 Integration Tests

- [ ] Create test file `control-plane/src/__tests__/brand-profiles.integration.test.ts`
- [ ] Test full lifecycle: create → read → update → list → archive
- [ ] Test create with brand_theme_id FK references valid brand_theme
- [ ] Test list with multiple profiles, verify pagination metadata
- [ ] Test search filter matches partial name
- [ ] Test archived profiles still appear when `status=archived` filter used
- [ ] Test archived profiles excluded from default list (no status filter returns only active)
- [ ] Test concurrent creates with same name → one succeeds, one gets 409
- [ ] Test GET detail resolves design_tokens merged with brand_theme token_overrides
- [ ] Test UPDATE with partial identity jsonb merges correctly (doesn't overwrite missing keys)
- [ ] Verify curl command works: `curl -X GET http://localhost:3001/v1/brand_profiles`
- [ ] Verify curl command works: `curl -X POST http://localhost:3001/v1/brand_profiles -H 'Content-Type: application/json' -d '{"name":"Test Brand"}'`

- [ ] Add rate limiting middleware to brand profiles endpoints (100 req/min per user)
- [ ] Add request ID header (`x-request-id`) to all brand profile responses for tracing
- [ ] Implement `GET /v1/brand_profiles/:id/resolved_tokens` endpoint returning fully merged design tokens
- [ ] Include brand_theme `component_variants` in resolved response
- [ ] Add ETag header to GET /v1/brand_profiles/:id for caching
- [ ] Support If-None-Match header for conditional GET requests
- [ ] Add `sort` query param to GET /v1/brand_profiles: `name`, `created_at`, `updated_at`
- [ ] Add `sort_dir` query param: `asc`, `desc` (default `desc`)
- [ ] Validate `sort` param against allowed columns
- [ ] Implement `PATCH /v1/brand_profiles/:id` as alias for PUT with partial update semantics
- [ ] Add `include` query param to GET detail: `include=theme,assets,embeddings_count`
- [ ] When `include=theme`: JOIN brand_themes and include full theme in response
- [ ] When `include=assets`: JOIN brand_assets and include assets array in response
- [ ] When `include=embeddings_count`: include count of embeddings per type
- [ ] Add OpenAPI/Swagger documentation for all brand profile endpoints
- [ ] Document request body schema for POST/PUT in OpenAPI spec
- [ ] Document response schema for each endpoint in OpenAPI spec
- [ ] Document error response schemas (400, 404, 409, 500) in OpenAPI spec
- [ ] Add `x-total-count` response header to GET list endpoint with total count
- [ ] Add `Link` header with pagination URLs (first, prev, next, last) to GET list
- [ ] Test sort by name ascending returns alphabetical order
- [ ] Test sort by created_at descending returns newest first
- [ ] Test `include=assets` returns assets array on GET detail
- [ ] Test ETag header is returned and matches on repeated GET
- [ ] Test If-None-Match returns 304 Not Modified when ETag matches
- [ ] Add validation: reject unknown fields in POST/PUT body with warning header
- [ ] Add `fields` query param for sparse fieldsets: `fields=id,name,status`
- [ ] Implement field filtering in SQL SELECT clause based on `fields` param
- [ ] Test `fields=id,name` returns only id and name in response
- [ ] Ensure `POST /v1/brand_profiles` returns `Location` header with correct URL path
- [ ] Add request body size limit (1MB) to prevent oversized payloads
- [ ] Test request body exceeding 1MB returns 413 Payload Too Large
- [ ] Add `GET /v1/brand_profiles/count` endpoint returning total count by status
- [ ] Test count endpoint returns correct totals
- [ ] Log slow queries (>500ms) for brand profiles endpoints
- [ ] Add database connection pool health check before query execution
- [ ] Test concurrent PUT requests to same profile don't lose data (optimistic locking or last-write-wins)
- [ ] Add `archived_at` timestamp to response when status is archived
- [ ] Test list endpoint with all query params combined: status + search + sort + limit + offset
- [ ] Verify SQL query uses parameterized queries (no SQL injection)
- [ ] Add TypeScript type guards: `isBrandProfile(obj)`, `isBrandProfileCreate(obj)`
- [ ] Test type guard functions with valid and invalid inputs
- [ ] Verify error responses include `request_id` for tracing

---

## 6. Control Plane API — Brand Embeddings (Items 526–625)

### 6.1 TypeScript Types

- [ ] Create file `control-plane/src/types/brand-embedding.ts`
- [ ] Define interface `BrandEmbedding` with `id`, `brand_profile_id`, `embedding_type`, `content`, `embedding` (number[]), `metadata`, `created_at`
- [ ] Define interface `BrandEmbeddingCreate` with `content`, `embedding_type`, optional `metadata`, optional `embedding` (pre-computed)
- [ ] Define interface `BrandEmbeddingSearchQuery` with `q` (query text), `top_k` (default 5), `embedding_type` (optional filter)
- [ ] Define interface `BrandEmbeddingSearchResult` extending `BrandEmbedding` with `similarity` score
- [ ] Export types from index

### 6.2 Validation

- [ ] Create `control-plane/src/validators/brand-embedding.validator.ts`
- [ ] Implement `validateBrandEmbeddingCreate(body)`: check `content` non-empty, `embedding_type` valid
- [ ] Implement `validateEmbeddingSearchQuery(query)`: check `q` non-empty, `top_k` positive int
- [ ] Implement `validateEmbeddingType(type)`: check against allowed list
- [ ] Return structured validation result

### 6.3 GET /v1/brand_profiles/:id/embeddings — List

- [ ] Add route `GET /v1/brand_profiles/:id/embeddings` to router
- [ ] Validate `:id` is valid UUID and brand profile exists
- [ ] Parse query params: `embedding_type` (optional), `limit` (default 50), `offset` (default 0)
- [ ] Build SQL: `SELECT id, brand_profile_id, embedding_type, content, metadata, created_at FROM brand_embeddings WHERE brand_profile_id = $1` (omit embedding vector from list for performance)
- [ ] Append `AND embedding_type = $n` if filter provided
- [ ] Append `ORDER BY created_at DESC LIMIT $n OFFSET $n`
- [ ] Execute count query for total
- [ ] Return paginated response
- [ ] Return 404 if brand profile not found
- [ ] Handle empty result gracefully

### 6.4 POST /v1/brand_profiles/:id/embeddings — Create

- [ ] Add route `POST /v1/brand_profiles/:id/embeddings` to router
- [ ] Validate brand profile exists
- [ ] Validate body: `content` required, `embedding_type` required, `metadata` optional
- [ ] Return 400 if validation fails
- [ ] If `embedding` vector provided in body, use it directly
- [ ] If `embedding` not provided, call LLM gateway embeddings endpoint to generate vector
- [ ] Build embedding request: `POST /embeddings` to LiteLLM with model `text-embedding-3-small` and input `content`
- [ ] Handle LLM gateway error: return 502 with `{ error: 'Failed to generate embedding' }`
- [ ] Extract embedding vector from LLM gateway response
- [ ] Insert into `brand_embeddings` with all fields
- [ ] Return 201 with created embedding (omit raw vector, include metadata)
- [ ] Log embedding creation with brand_profile_id and embedding_type
- [ ] Handle database error: return 500

### 6.5 DELETE /v1/brand_profiles/:id/embeddings/:eid — Remove

- [ ] Add route `DELETE /v1/brand_profiles/:id/embeddings/:eid` to router
- [ ] Validate both `:id` and `:eid` are valid UUIDs
- [ ] Verify embedding exists and belongs to the specified brand profile
- [ ] Return 404 if embedding not found or doesn't belong to brand
- [ ] Execute `DELETE FROM brand_embeddings WHERE id = $1 AND brand_profile_id = $2`
- [ ] Return 204 No Content on success
- [ ] Handle database error: return 500

### 6.6 GET /v1/brand_profiles/:id/embeddings/search — Similarity Search

- [ ] Add route `GET /v1/brand_profiles/:id/embeddings/search` to router
- [ ] Validate brand profile exists
- [ ] Parse query params: `q` (required search text), `top_k` (default 5, max 20), `embedding_type` (optional filter)
- [ ] Return 400 if `q` is empty
- [ ] Call LLM gateway to embed the query text `q`
- [ ] Handle embedding generation error: return 502
- [ ] Call `match_brand_embeddings` SQL function with brand_id, query_embedding, and top_k
- [ ] If `embedding_type` filter provided, add WHERE clause to limit results
- [ ] Return ranked results: `{ results: [{ id, content, embedding_type, metadata, similarity }] }`
- [ ] Handle zero results: return `{ results: [] }`
- [ ] Log search query and result count for analytics
- [ ] Set `ivfflat.probes = 10` before search query for accuracy

### 6.7 Unit Tests

- [ ] Test GET /v1/brand_profiles/:id/embeddings returns list
- [ ] Test GET embeddings with embedding_type filter
- [ ] Test GET embeddings with pagination
- [ ] Test POST embedding with content and type → 201
- [ ] Test POST embedding with missing content → 400
- [ ] Test POST embedding with invalid type → 400
- [ ] Test POST embedding with pre-computed vector → 201
- [ ] Test DELETE embedding → 204
- [ ] Test DELETE non-existent embedding → 404
- [ ] Test search with valid query → returns ranked results
- [ ] Test search with empty q → 400
- [ ] Test search with top_k=1 → returns single result

### 6.8 Integration Tests

- [ ] Test full flow: create brand → add embedding → search → verify result contains content
- [ ] Test multiple embeddings of different types → filter returns only matching type
- [ ] Test delete embedding → search no longer returns it
- [ ] Test search ranking: add two embeddings, verify more similar one ranks first
- [ ] Test brand profile 404 on all embedding endpoints for non-existent brand
- [ ] Mock LLM gateway embedding endpoint for test isolation
- [ ] Verify embedding dimension is 1536 in stored record
- [ ] Verify cosine similarity score is between 0 and 1

- [ ] Add rate limiting to embedding endpoints (50 req/min due to LLM cost)
- [ ] Add `GET /v1/brand_profiles/:id/embeddings/count` endpoint returning count by type
- [ ] Add batch create endpoint: `POST /v1/brand_profiles/:id/embeddings/batch` accepting array of embeddings
- [ ] Implement batch embedding generation: embed all texts in single LLM call if supported
- [ ] Return partial results on batch failure: `{created: [...], failed: [...]}`
- [ ] Add `metadata` filter to GET embeddings: `metadata.source=manual`
- [ ] Add OpenAPI documentation for all embedding endpoints
- [ ] Document embedding dimension (1536) in API docs
- [ ] Add `x-embedding-model` response header indicating which model generated the embedding
- [ ] Test batch create with 5 texts returns 5 created embeddings
- [ ] Test batch create with one invalid text returns partial success
- [ ] Verify search endpoint sets `ivfflat.probes` parameter before query
- [ ] Test search with `embedding_type` filter only searches that type
- [ ] Test search returns similarity scores in descending order
- [ ] Add request validation: embedding vector must have exactly 1536 dimensions if pre-computed
- [ ] Test pre-computed vector with wrong dimension returns 400
- [ ] Add cost tracking: log LLM embedding API call cost per request
- [ ] Test embedding creation with very long content (10000 chars) succeeds
- [ ] Test embedding creation with empty content returns 400
- [ ] Add pagination headers (`x-total-count`, `Link`) to GET embeddings list
- [ ] Verify DELETE embedding returns 204 with empty body
- [ ] Test GET embeddings with `limit=1` returns single embedding
- [ ] Verify search endpoint accepts `top_k` up to 20 and rejects > 20
- [ ] Add request timeout for embedding generation (30s) with appropriate error response
- [ ] Test LLM gateway timeout returns 504 Gateway Timeout
- [ ] Verify embedding list excludes raw vector data for performance
- [ ] Add `GET /v1/brand_profiles/:id/embeddings/:eid` detail endpoint returning single embedding with metadata

---

## 7. Control Plane API — Document Templates CRUD (Items 626–735)

### 7.1 TypeScript Types

- [ ] Create file `control-plane/src/types/document-template.ts`
- [ ] Define interface `DocumentTemplate` with all columns
- [ ] Define interface `DocumentComponent` with all columns
- [ ] Define interface `DocumentTemplateCreate` with `brand_profile_id`, `template_type`, `name`, optional `template_config`, optional `component_sequence`
- [ ] Define interface `DocumentTemplateUpdate` with all fields optional
- [ ] Define interface `DocumentComponentCreate` with `component_type`, `config`, `position`
- [ ] Define interface `DocumentComponentUpdate` with `config`, `position` optional
- [ ] Export types

### 7.2 Validation

- [ ] Create `control-plane/src/validators/document-template.validator.ts`
- [ ] Implement `validateDocumentTemplateCreate(body)`: check required fields
- [ ] Implement `validateDocumentTemplateUpdate(body)`: check at least one field
- [ ] Implement `validateDocumentComponentCreate(body)`: check `component_type` valid, `config` is object
- [ ] Implement `validateDocumentComponentUpdate(body)`: check fields
- [ ] Implement `validateTemplateType(type)`: check against allowed values
- [ ] Implement `validateComponentType(type)`: check against allowed values

### 7.3 GET /v1/document_templates — List

- [ ] Add route `GET /v1/document_templates` to router
- [ ] Parse query params: `brand_profile_id` (optional), `template_type` (optional), `status` (optional), `limit`, `offset`
- [ ] Build SQL with optional filters
- [ ] Return paginated response with count
- [ ] Handle empty results

### 7.4 GET /v1/document_templates/:id — Detail

- [ ] Add route `GET /v1/document_templates/:id`
- [ ] Validate `:id` is UUID
- [ ] Fetch template with its components: `SELECT * FROM document_templates WHERE id = $1`
- [ ] Fetch components: `SELECT * FROM document_components WHERE template_id = $1 ORDER BY position ASC`
- [ ] Return 404 if not found
- [ ] Return template with nested `components` array
- [ ] Include brand_profile summary (name, primary color) via JOIN

### 7.5 POST /v1/document_templates — Create

- [ ] Add route `POST /v1/document_templates`
- [ ] Validate body
- [ ] Return 400 on validation failure
- [ ] Verify `brand_profile_id` FK exists
- [ ] Insert template row
- [ ] If `component_sequence` includes component definitions, insert each into `document_components`
- [ ] Return 201 with created template including components
- [ ] Handle FK violation: return 400

### 7.6 PUT /v1/document_templates/:id — Update

- [ ] Add route `PUT /v1/document_templates/:id`
- [ ] Validate `:id` and body
- [ ] Check template exists, return 404 if not
- [ ] Build dynamic UPDATE query
- [ ] Execute with `RETURNING *`
- [ ] Return 200 with updated template

### 7.7 DELETE /v1/document_templates/:id — Soft Delete

- [ ] Add route `DELETE /v1/document_templates/:id`
- [ ] Check exists, return 404 if not
- [ ] Set `status = 'archived'`
- [ ] Return 200 with archived template

### 7.8 GET /v1/document_templates/:id/components — List Components

- [ ] Add route `GET /v1/document_templates/:id/components`
- [ ] Verify template exists
- [ ] Fetch components ordered by position
- [ ] Return array of components
- [ ] Handle empty: return empty array

### 7.9 POST /v1/document_templates/:id/components — Add Component

- [ ] Add route `POST /v1/document_templates/:id/components`
- [ ] Validate body with `validateDocumentComponentCreate`
- [ ] Verify template exists
- [ ] Insert component with template_id, component_type, config, position
- [ ] If position not provided, set to max(position) + 1 for template
- [ ] Return 201 with created component

### 7.10 PUT /v1/document_templates/:id/components/:cid — Update Component

- [ ] Add route `PUT /v1/document_templates/:id/components/:cid`
- [ ] Validate both IDs are UUIDs
- [ ] Verify component exists and belongs to template
- [ ] Return 404 if not found
- [ ] Update config and/or position
- [ ] Return 200 with updated component

### 7.11 DELETE /v1/document_templates/:id/components/:cid — Remove Component

- [ ] Add route `DELETE /v1/document_templates/:id/components/:cid`
- [ ] Verify component exists and belongs to template
- [ ] Return 404 if not found
- [ ] Hard delete: `DELETE FROM document_components WHERE id = $1 AND template_id = $2`
- [ ] Reorder remaining components to fill gap (optional: update positions)
- [ ] Return 204

### 7.12 Unit Tests

- [ ] Test GET /v1/document_templates returns list with filters
- [ ] Test GET /v1/document_templates/:id returns template with components
- [ ] Test GET /v1/document_templates/:id returns 404 for missing
- [ ] Test POST /v1/document_templates creates and returns 201
- [ ] Test POST with invalid template_type → 400
- [ ] Test PUT /v1/document_templates/:id updates fields
- [ ] Test DELETE /v1/document_templates/:id archives template
- [ ] Test GET components returns ordered list
- [ ] Test POST component adds to template
- [ ] Test PUT component updates config
- [ ] Test DELETE component removes and returns 204
- [ ] Test component 404 when template doesn't own it

### 7.13 Integration Tests

- [ ] Test full lifecycle: create template → add components → reorder → update → archive
- [ ] Test cascade: archiving template doesn't delete components
- [ ] Test deleting brand_profile cascades to templates and components
- [ ] Test component ordering: insert at position 0, verify others shift
- [ ] Test template with all component types
- [ ] Verify curl: `POST /v1/document_templates` with full body

- [ ] Add `sort` query param to GET /v1/document_templates: `name`, `created_at`, `template_type`
- [ ] Add `include=components` query param to list endpoint for eager loading
- [ ] When `include=components`: JOIN document_components ordered by position
- [ ] Add OpenAPI documentation for all document template endpoints
- [ ] Add `clone` endpoint: `POST /v1/document_templates/:id/clone` duplicating template and components
- [ ] Implement clone: deep copy template row with new ID and name suffix " (Copy)"
- [ ] Clone also copies all document_components with new IDs referencing cloned template
- [ ] Test clone creates new template with same component_sequence
- [ ] Test clone creates new components with correct positions
- [ ] Add `reorder` endpoint: `PUT /v1/document_templates/:id/components/reorder` with `{positions: [{id, position}]}`
- [ ] Implement bulk position update within a transaction
- [ ] Test reorder: swap positions of two components, verify new order
- [ ] Add validation: template_type must match allowed list on create and update
- [ ] Test creating template with `template_type='invalid'` returns 400
- [ ] Verify soft-deleted templates are excluded from default list (status != 'archived')
- [ ] Test list with `status=archived` returns only archived templates
- [ ] Add `GET /v1/document_templates/:id/preview` endpoint returning rendered preview HTML
- [ ] Add component count to template list response as `component_count` field
- [ ] Verify component deletion does not leave gaps in position sequence
- [ ] Test adding component at position 0 works when other components exist at positions 1-5
- [ ] Add request body validation: component_sequence must be valid JSON array of objects
- [ ] Test POST template with invalid component_sequence (string instead of array) returns 400
- [ ] Verify GET detail includes brand_profile name and primary color in response
- [ ] Add ETag header to GET /v1/document_templates/:id for caching

---

## 8. Control Plane API — Brand Assets (Items 736–795)

### 8.1 TypeScript Types

- [ ] Create file `control-plane/src/types/brand-asset.ts`
- [ ] Define interface `BrandAsset` with all columns
- [ ] Define interface `BrandAssetCreate` with `asset_type`, `uri`, optional `metadata`
- [ ] Export types

### 8.2 Validation

- [ ] Create `control-plane/src/validators/brand-asset.validator.ts`
- [ ] Implement `validateBrandAssetCreate(body)`: check `asset_type` valid, `uri` non-empty
- [ ] Implement `validateAssetType(type)`: check against allowed values

### 8.3 GET /v1/brand_profiles/:id/assets — List

- [ ] Add route `GET /v1/brand_profiles/:id/assets`
- [ ] Validate brand profile exists
- [ ] Fetch all assets for brand: `SELECT * FROM brand_assets WHERE brand_profile_id = $1 ORDER BY asset_type`
- [ ] Return array of assets
- [ ] Return 404 if brand not found
- [ ] Handle empty: return `[]`

### 8.4 POST /v1/brand_profiles/:id/assets — Upload

- [ ] Add route `POST /v1/brand_profiles/:id/assets`
- [ ] Validate brand profile exists
- [ ] Validate body: `asset_type` required, `uri` required
- [ ] Return 400 on validation failure
- [ ] Insert into `brand_assets`
- [ ] If unique constraint violation (same brand + type): return 409 or update existing
- [ ] Return 201 with created asset
- [ ] Handle file reference: if `uri` starts with `upload://`, trigger storage upload flow
- [ ] Handle external URI: validate URI format

### 8.5 DELETE /v1/brand_profiles/:id/assets/:aid — Remove

- [ ] Add route `DELETE /v1/brand_profiles/:id/assets/:aid`
- [ ] Validate both IDs
- [ ] Verify asset exists and belongs to brand
- [ ] Return 404 if not found
- [ ] Hard delete: `DELETE FROM brand_assets WHERE id = $1 AND brand_profile_id = $2`
- [ ] Return 204

### 8.6 Unit Tests

- [ ] Test GET assets returns list for brand
- [ ] Test GET assets returns 404 for missing brand
- [ ] Test GET assets returns empty array when no assets
- [ ] Test POST asset creates and returns 201
- [ ] Test POST asset with invalid type → 400
- [ ] Test POST asset with missing uri → 400
- [ ] Test POST asset duplicate type → 409 or upsert
- [ ] Test DELETE asset → 204
- [ ] Test DELETE non-existent asset → 404

### 8.7 Integration Tests

- [ ] Test full flow: create brand → add logo → add icon → list assets → delete logo
- [ ] Test cascade: deleting brand removes all its assets
- [ ] Test asset metadata stores width/height/format correctly
- [ ] Verify curl: `POST /v1/brand_profiles/{id}/assets` with body

- [ ] Add `PUT /v1/brand_profiles/:id/assets/:aid` endpoint for updating asset metadata
- [ ] Implement metadata update: merge new metadata with existing
- [ ] Test updating asset metadata preserves URI
- [ ] Add `asset_type` filter to GET assets: `GET /v1/brand_profiles/:id/assets?type=logo`
- [ ] Test type filter returns only matching asset type
- [ ] Add `Content-Disposition` header to asset URI redirect endpoint for download
- [ ] Add OpenAPI documentation for all brand asset endpoints
- [ ] Document supported asset_type values in API docs
- [ ] Validate URI format: must start with `http://`, `https://`, or `upload://`
- [ ] Test invalid URI format returns 400
- [ ] Add `GET /v1/brand_profiles/:id/assets/summary` endpoint returning count by type
- [ ] Test summary endpoint with multiple asset types
- [ ] Verify DELETE asset returns correct status code for different scenarios
- [ ] Test creating asset with metadata `{width: 512, height: 512, format: 'svg'}` stores correctly
- [ ] Add `order` field to brand_assets for custom display ordering
- [ ] Add request validation: `uri` must not exceed 2048 characters
- [ ] Test URI exceeding 2048 chars returns 400
- [ ] Verify asset list ordered by `asset_type` alphabetically
- [ ] Add bulk asset upload endpoint: `POST /v1/brand_profiles/:id/assets/batch`

---

## 9. Runner — Brand Context Loading (Items 796–905)

### 9.1 BrandContext Type

- [ ] Create file `runners/src/brand-context.ts`
- [ ] Define interface `BrandContext` with fields: `profileId`, `name`, `identity`, `tone`, `visualStyle`, `copyStyle`, `designTokens`, `deckTheme`, `reportTheme`, `assets`
- [ ] Define type `EmptyBrandContext` as `null`
- [ ] Define type `MaybeBrandContext` as `BrandContext | null`
- [ ] Export `BrandContext`, `EmptyBrandContext`, `MaybeBrandContext`

### 9.2 loadBrandContext Function

- [ ] Implement `async function loadBrandContext(initiativeId: string): Promise<MaybeBrandContext>`
- [ ] Fetch initiative from CP API: `GET /v1/initiatives/{initiativeId}`
- [ ] Handle initiative not found: log warning, return `null`
- [ ] Extract `brand_profile_id` from initiative response
- [ ] If `brand_profile_id` is null: return `null`
- [ ] Fetch brand profile from CP API: `GET /v1/brand_profiles/{brand_profile_id}`
- [ ] Handle brand profile not found: log warning, return `null`
- [ ] Map API response to `BrandContext` object
- [ ] Include `resolved_design_tokens` from API response
- [ ] Include `deck_theme` from API response
- [ ] Include `report_theme` from API response
- [ ] Fetch brand assets: `GET /v1/brand_profiles/{brand_profile_id}/assets`
- [ ] Include assets in BrandContext
- [ ] Return fully populated `BrandContext`
- [ ] Export `loadBrandContext`

### 9.3 Brand Context Caching

- [ ] Implement `BrandContextCache` class with `Map<string, BrandContext>`
- [ ] Add `get(initiativeId: string)` method
- [ ] Add `set(initiativeId: string, ctx: BrandContext)` method
- [ ] Add `clear()` method
- [ ] Add TTL-based expiry (default 5 minutes)
- [ ] In `loadBrandContext`: check cache first, return cached if fresh
- [ ] On cache miss: fetch from API, store in cache, return
- [ ] Export `brandContextCache` singleton instance
- [ ] Add `invalidate(initiativeId: string)` method

### 9.4 brandContextToSystemPrompt Function

- [ ] Implement `function brandContextToSystemPrompt(ctx: BrandContext): string`
- [ ] Format identity section: `Brand: {name}, Archetype: {archetype}, Industry: {industry}`
- [ ] Format tagline: `Tagline: {tagline}`
- [ ] Format mission: `Mission: {mission}`
- [ ] Format tone section: `Voice: {voice_descriptors.join(', ')}`
- [ ] Format reading level: `Reading Level: {reading_level}`
- [ ] Format sentence length: `Sentence Length: {sentence_length}`
- [ ] Format copy style: `CTA Style: {cta_style}`
- [ ] Format banned words: `Never use these words: {banned_words.join(', ')}`
- [ ] Format preferred phrases: `Prefer these phrases: {preferred_phrases.join(', ')}`
- [ ] Format visual style density: `Visual density: {density}`
- [ ] Wrap all sections in a structured system prompt block
- [ ] Handle missing/null fields gracefully (omit from prompt)
- [ ] Export `brandContextToSystemPrompt`

### 9.5 brandContextToDesignTokens Function

- [ ] Implement `function brandContextToDesignTokens(ctx: BrandContext): DesignTokens`
- [ ] Import default tokens from `packages/ui/src/tokens.ts` or define inline defaults
- [ ] Deep merge `ctx.designTokens` over default tokens
- [ ] Brand color overrides: merge `color.brand.*` from ctx over defaults
- [ ] Surface color overrides: merge `color.surface.*`
- [ ] Text color overrides: merge `color.text.*`
- [ ] Typography overrides: merge `typography.*`
- [ ] Spacing overrides: merge `spacing.*`
- [ ] Radius overrides: merge `radius.*`
- [ ] Shadow overrides: merge `shadow.*`
- [ ] Motion overrides: merge `motion.*`
- [ ] Return merged `DesignTokens` object
- [ ] Export `brandContextToDesignTokens`

### 9.6 LLM Client Brand Header

- [ ] Open `runners/src/llm-client.ts`
- [ ] Add optional `brandProfileId` parameter to LLM call function signature
- [ ] If `brandProfileId` provided, add `x-brand-profile-id` header to LLM request
- [ ] Pass brand profile ID through to LiteLLM metadata for cost tracking
- [ ] Update LLM client TypeScript types to include optional brand context fields

### 9.7 Job Execution Context Integration

- [ ] Open `runners/src/kernel-contract.ts`
- [ ] Add optional `brandContext: MaybeBrandContext` field to `JobRequest` interface
- [ ] Open `runners/src/executor-registry.ts`
- [ ] Update executor interface to receive `brandContext` in execution args
- [ ] In job execution entry point: call `loadBrandContext(initiativeId)` before dispatching to handler
- [ ] Pass `brandContext` to handler execute function
- [ ] Log whether brand context was loaded or null for each job
- [ ] Handle brand context loading failure: log error, continue with null context (non-blocking)

### 9.8 Unit Tests

- [ ] Create test file `runners/src/__tests__/brand-context.test.ts`
- [ ] Test `loadBrandContext` with initiative that has brand_profile_id → returns BrandContext
- [ ] Test `loadBrandContext` with initiative that has null brand_profile_id → returns null
- [ ] Test `loadBrandContext` with non-existent initiative → returns null
- [ ] Test `loadBrandContext` with non-existent brand profile → returns null
- [ ] Test `BrandContextCache` stores and retrieves context
- [ ] Test `BrandContextCache` returns null for expired entries
- [ ] Test `BrandContextCache` invalidate removes entry
- [ ] Test `brandContextToSystemPrompt` with full BrandContext → formatted string
- [ ] Test `brandContextToSystemPrompt` with missing optional fields → omits them
- [ ] Test `brandContextToSystemPrompt` with empty banned_words → omits banned words line
- [ ] Test `brandContextToDesignTokens` with overrides → merged tokens
- [ ] Test `brandContextToDesignTokens` with empty designTokens → returns defaults
- [ ] Test `brandContextToDesignTokens` deep merge doesn't lose nested keys

### 9.9 Integration Tests

- [ ] Create test file `runners/src/__tests__/brand-context.integration.test.ts`
- [ ] Mock CP API responses for initiative and brand profile
- [ ] Test full flow: loadBrandContext → brandContextToSystemPrompt → verify prompt contains brand name
- [ ] Test full flow: loadBrandContext → brandContextToDesignTokens → verify color overrides applied
- [ ] Test cache: call loadBrandContext twice → second call uses cache (verify single API call)
- [ ] Test LLM client sends x-brand-profile-id header when brand context is present
- [ ] Test executor receives brandContext in execution args
- [ ] Test handler receives non-null brandContext for branded initiative

- [ ] Add retry logic to CP API calls in loadBrandContext: retry up to 3 times with exponential backoff
- [ ] Add circuit breaker pattern: if CP API fails 5 times in a row, skip brand context for 60 seconds
- [ ] Log brand context loading latency for performance monitoring
- [ ] Add `loadBrandContextByProfileId(profileId: string)` for direct brand loading without initiative lookup
- [ ] Add configuration flag to disable brand context loading globally (feature flag)
- [ ] Read feature flag from environment variable `BRAND_CONTEXT_ENABLED=true|false`
- [ ] When brand context loading is disabled: return null without making API calls
- [ ] Add `brandContextToEmailStyles(ctx: BrandContext)` helper: extract email-specific styles
- [ ] Implement email styles extraction: inline CSS string for email templates
- [ ] Add `brandContextToDeckConfig(ctx: BrandContext)` helper: extract PptxGenJS-compatible config
- [ ] Implement deck config extraction: slide dimensions, fonts, colors as PptxGenJS options
- [ ] Add `brandContextToReportShell(ctx: BrandContext)` helper: return report HTML shell template
- [ ] Test retry logic: mock API to fail twice then succeed on third attempt
- [ ] Test circuit breaker: mock API to fail 5 times, verify subsequent calls return null immediately
- [ ] Test feature flag disabled: verify no API calls made
- [ ] Test `brandContextToEmailStyles` returns CSS string with brand colors
- [ ] Test `brandContextToDeckConfig` returns valid PptxGenJS configuration object
- [ ] Test `brandContextToReportShell` returns HTML string with brand CSS variables
- [ ] Verify loadBrandContext gracefully handles network timeout (connection refused)

---

## 10. Runner — Brand-Aware Handlers (Items 906–1015)

### 10.1 Existing Handler Updates

- [ ] Open `runners/src/handlers/approval.ts` — add `brandContext` parameter to execute signature
- [ ] In approval handler: if brandContext present, include brand name in approval notification
- [ ] Open `runners/src/handlers/code_review.ts` — add `brandContext` parameter
- [ ] In code_review handler: if brandContext present, reference brand coding style guidelines
- [ ] Open `runners/src/handlers/submit_pr.ts` — add `brandContext` parameter
- [ ] In submit_pr handler: if brandContext present, prepend brand name to PR title
- [ ] Open `runners/src/handlers/analyze_repo.ts` — add `brandContext` parameter
- [ ] In analyze_repo handler: pass through brandContext for downstream use

### 10.2 New Handler: copy_generate

- [ ] Create file `runners/src/handlers/copy-generate.ts`
- [ ] Import `BrandContext`, `brandContextToSystemPrompt` from `brand-context.ts`
- [ ] Define `CopyGenerateInput` interface: `prompt`, `format` (headline/body/tagline/cta), `max_length`, `variants` count
- [ ] Implement `execute(input: CopyGenerateInput, brandContext: MaybeBrandContext)`
- [ ] Build system prompt from brandContext using `brandContextToSystemPrompt`
- [ ] Append copy_style specifics: voice, banned_words, preferred_phrases, cta_style
- [ ] Call LLM gateway with system prompt + user prompt
- [ ] Parse LLM response into copy variants
- [ ] Write artifact with `artifact_type = 'copy'` and content
- [ ] Write tool_call record for the LLM invocation
- [ ] Return generated copy variants
- [ ] Add to handler registry in `executor-registry.ts`

### 10.3 New Handler: email_generate

- [ ] Create file `runners/src/handlers/email-generate.ts`
- [ ] Define `EmailGenerateInput` interface: `subject_prompt`, `body_prompt`, `recipient_segment`, `email_type`
- [ ] Implement `execute(input, brandContext)`
- [ ] Build system prompt with brand tone + copy_style
- [ ] Inject brand design_tokens for email styling (colors, fonts)
- [ ] Call LLM gateway for subject line generation
- [ ] Call LLM gateway for body content generation
- [ ] Assemble email HTML with brand tokens applied inline
- [ ] Write artifact with `artifact_type = 'email'`
- [ ] Write tool_call records
- [ ] Return generated email
- [ ] Add to handler registry

### 10.4 New Handler: ui_scaffold

- [ ] Create file `runners/src/handlers/ui-scaffold.ts`
- [ ] Define `UIScaffoldInput` interface: `component_type`, `framework` (react/vue/svelte), `description`
- [ ] Implement `execute(input, brandContext)`
- [ ] If brandContext present: extract design_tokens, format as Tailwind theme config
- [ ] Build system prompt: "Generate a {component_type} component using these design tokens: {tokens}"
- [ ] Call LLM gateway
- [ ] Parse generated component code
- [ ] Write artifact with `artifact_type = 'ui_component'`
- [ ] Write tool_call record
- [ ] Return generated code
- [ ] Add to handler registry

### 10.5 New Handler: deck_generate

- [ ] Create file `runners/src/handlers/deck-generate.ts`
- [ ] Define `DeckGenerateInput` interface: `template_id`, `data` (KPIs, tables, charts), `title`, `subtitle`
- [ ] Implement `execute(input, brandContext)`
- [ ] Fetch document_template from CP API: `GET /v1/document_templates/{template_id}`
- [ ] Extract component_sequence from template
- [ ] Load brand deck_theme and design_tokens from brandContext
- [ ] For each component in sequence: render using doc-kit (Section 18)
- [ ] Assemble PPTX presentation (Section 19)
- [ ] Write artifact with `artifact_type = 'deck'` and binary reference
- [ ] Write tool_call records for each LLM call made during generation
- [ ] Return artifact reference
- [ ] Add to handler registry

### 10.6 New Handler: report_generate

- [ ] Create file `runners/src/handlers/report-generate.ts`
- [ ] Define `ReportGenerateInput` interface: `template_id`, `data`, `title`, `date_range`
- [ ] Implement `execute(input, brandContext)`
- [ ] Fetch document_template from CP API
- [ ] Extract component_sequence
- [ ] Load brand report_theme and design_tokens
- [ ] For each component: render using doc-kit HTML renderer
- [ ] Wrap in branded report shell (header, footer, TOC)
- [ ] Apply brand CSS variables from report_theme
- [ ] Write artifact with `artifact_type = 'report'`
- [ ] Write tool_call records
- [ ] Return artifact reference
- [ ] Add to handler registry

### 10.7 Handler Registry Updates

- [ ] Open `runners/src/executor-registry.ts`
- [ ] Register `copy_generate` handler
- [ ] Register `email_generate` handler
- [ ] Register `ui_scaffold` handler
- [ ] Register `deck_generate` handler
- [ ] Register `report_generate` handler
- [ ] Verify all handlers implement consistent `execute` signature with `brandContext`

### 10.8 Unit Tests

- [ ] Test copy_generate with full brand context produces branded copy
- [ ] Test copy_generate without brand context produces generic copy
- [ ] Test copy_generate respects banned_words from brand copy_style
- [ ] Test email_generate produces HTML with brand colors
- [ ] Test email_generate injects brand fonts
- [ ] Test ui_scaffold generates Tailwind config with brand tokens
- [ ] Test ui_scaffold without brand produces default tokens
- [ ] Test deck_generate fetches template and produces correct slide count
- [ ] Test deck_generate applies deck_theme colors
- [ ] Test report_generate wraps content in branded shell
- [ ] Test report_generate applies report_theme CSS variables

### 10.9 Integration Tests

- [ ] Test copy_generate end-to-end: mock LLM, verify artifact written
- [ ] Test email_generate end-to-end: mock LLM, verify email HTML artifact
- [ ] Test deck_generate end-to-end: mock template API + LLM, verify PPTX artifact
- [ ] Test report_generate end-to-end: mock template API + LLM, verify HTML artifact
- [ ] Test handler registry resolves all new handler types
- [ ] Test existing handlers still work with null brandContext
- [ ] Verify tool_call records written for each LLM invocation

- [ ] Add brand context validation in each handler: warn if expected fields are missing
- [ ] In copy_generate: support multiple output formats (plain text, HTML, markdown)
- [ ] In copy_generate: add `temperature` parameter to control creativity (0.3 for strict brand, 0.9 for creative)
- [ ] In email_generate: support email types (welcome, newsletter, promotional, transactional)
- [ ] In email_generate: generate both subject line and preheader text
- [ ] In ui_scaffold: support React, Vue, and Svelte component output
- [ ] In ui_scaffold: generate TypeScript component with proper prop types
- [ ] In deck_generate: add slide notes with talking points generated by LLM
- [ ] In deck_generate: support speaker view notes in PPTX output
- [ ] In report_generate: add executive summary auto-generation from data
- [ ] In report_generate: add page numbering in footer
- [ ] Test copy_generate with temperature=0.3 produces more consistent output
- [ ] Test email_generate with different email_types produces appropriate tone
- [ ] Test deck_generate includes slide notes when requested
- [ ] Test report_generate includes page numbers
- [ ] Test all handlers return artifact references with correct artifact_type
- [ ] Verify tool_call records include model name and token counts

---

## 11. Style Dictionary Integration (Items 1016–1155)

### 11.1 Installation

- [ ] Run `npm install style-dictionary --save-dev` in `packages/ui/`
- [ ] Verify `style-dictionary` appears in `packages/ui/package.json` devDependencies
- [ ] Verify `npx style-dictionary --version` works from `packages/ui/`

### 11.2 Configuration File

- [ ] Create file `packages/ui/style-dictionary.config.js`
- [ ] Define `source` array pointing to `tokens/**/*.json`
- [ ] Define platform `css`: transforms `attribute/cti`, `name/cti/kebab`, `color/css`; buildPath `generated/`; files `css-vars.css` with format `css/variables`
- [ ] Define platform `js/es6`: transforms `attribute/cti`, `name/cti/camel`; buildPath `generated/`; files `tokens.js` with format `javascript/es6`
- [ ] Define platform `json`: buildPath `generated/`; files `tokens.json` with format `json/flat`
- [ ] Define platform `ios-swift`: transforms `attribute/cti`, `name/cti/camel`, `color/UIColorSwift`; buildPath `generated/`; files `tokens.swift` with format `ios-swift/class.swift`
- [ ] Define platform `android`: transforms `attribute/cti`, `name/xml`; buildPath `generated/`; files `tokens.xml` with format `android/resources`
- [ ] Export config as module.exports

### 11.3 Token Source Files

- [ ] Create directory `packages/ui/tokens/`
- [ ] Create `packages/ui/tokens/color.json` with brand 50-900, surface, text, state, border, neutral tokens from `tokens.ts`
- [ ] Create `packages/ui/tokens/typography.json` with fontFamily, fontSize, heading h1-h6, subheading, body, caption, small
- [ ] Create `packages/ui/tokens/spacing.json` with spacing scale
- [ ] Create `packages/ui/tokens/layout.json` with layout tokens
- [ ] Create `packages/ui/tokens/radius.json` with border radius tokens
- [ ] Create `packages/ui/tokens/shadow.json` with shadow tokens
- [ ] Create `packages/ui/tokens/motion.json` with duration and easing tokens
- [ ] Create `packages/ui/tokens/border.json` with border tokens
- [ ] Verify all token files are valid JSON

### 11.4 Build Script

- [ ] Create file `packages/ui/scripts/build-tokens.ts`
- [ ] Import `StyleDictionary` from `style-dictionary`
- [ ] Parse CLI args: `--brand <path>` for custom brand_profile JSON
- [ ] If `--brand` flag provided: read brand JSON file, merge tokens with defaults
- [ ] If no `--brand` flag: use default token source files
- [ ] Write merged tokens to temp directory as Style Dictionary source files
- [ ] Initialize StyleDictionary with config
- [ ] Call `StyleDictionary.buildAllPlatforms()`
- [ ] Log output file paths
- [ ] Handle errors: missing files, invalid JSON, build failures
- [ ] Exit with code 0 on success, 1 on failure

### 11.5 Output Files

- [ ] Verify `packages/ui/generated/css-vars.css` is generated with CSS custom properties
- [ ] Verify `packages/ui/generated/tokens.json` is generated with flat token map
- [ ] Verify `packages/ui/generated/tokens.js` is generated as ES6 module
- [ ] Verify `packages/ui/generated/tokens.swift` is generated for iOS
- [ ] Verify `packages/ui/generated/tokens.xml` is generated for Android
- [ ] Add `packages/ui/generated/` to `.gitignore` (generated files)
- [ ] Or remove from `.gitignore` and commit generated files (document decision)

### 11.6 Deck Theme Output

- [ ] Add custom format `deck-theme-json` to Style Dictionary config
- [ ] Define deck theme output structure: `slide_master` palette, font config, chart colors
- [ ] Generate `packages/ui/generated/deck.theme.json` from brand tokens
- [ ] Map `color.brand.500` to deck primary color
- [ ] Map `color.brand.50-900` to chart color sequence
- [ ] Map `typography.fontFamily.heading` to deck title font
- [ ] Map `typography.fontFamily.body` to deck body font
- [ ] Verify deck.theme.json matches expected structure

### 11.7 Report Theme Output

- [ ] Add custom format `report-theme-css` to Style Dictionary config
- [ ] Generate `packages/ui/generated/report.theme.css` with report-specific CSS vars
- [ ] Include `--report-header-bg`, `--report-header-text`, `--report-section-spacing`
- [ ] Include `--report-chart-color-1` through `--report-chart-color-8`
- [ ] Include `--report-callout-bg`, `--report-callout-border`
- [ ] Include `--report-font-heading`, `--report-font-body`
- [ ] Verify report.theme.css contains all expected variables

### 11.8 Tailwind Theme Output

- [ ] Add custom format `tailwind-theme` to Style Dictionary config
- [ ] Generate `packages/ui/generated/tailwind-theme.js` exporting a Tailwind theme extension
- [ ] Map color tokens to Tailwind `colors.brand.*`
- [ ] Map typography tokens to Tailwind `fontFamily`, `fontSize`
- [ ] Map spacing tokens to Tailwind `spacing`
- [ ] Map radius tokens to Tailwind `borderRadius`
- [ ] Map shadow tokens to Tailwind `boxShadow`
- [ ] Verify tailwind-theme.js is importable and contains correct values

### 11.9 Package Scripts

- [ ] Add `"build:tokens"` script to `packages/ui/package.json`: `ts-node scripts/build-tokens.ts`
- [ ] Add `"build:tokens:brand"` script: `ts-node scripts/build-tokens.ts --brand`
- [ ] Verify `npm run build:tokens` succeeds from `packages/ui/`
- [ ] Verify output directory `generated/` is created

### 11.10 Tokens Studio / W3C Format

- [ ] Add Tokens Studio format export: generate `packages/ui/generated/tokens-studio.json` compatible with Figma Tokens Studio plugin
- [ ] Structure tokens in Tokens Studio format with `$value`, `$type` keys
- [ ] Add W3C Design Tokens Community Group format export
- [ ] Generate `packages/ui/generated/tokens-w3c.json` following DTCG specification
- [ ] Verify Tokens Studio JSON is valid by importing into a test Figma plugin config

### 11.11 Token Category Verification

- [ ] Verify `color.brand.50` exported correctly in CSS format
- [ ] Verify `color.brand.100` exported correctly in CSS format
- [ ] Verify `color.brand.200` exported correctly in CSS format
- [ ] Verify `color.brand.300` exported correctly in CSS format
- [ ] Verify `color.brand.400` exported correctly in CSS format
- [ ] Verify `color.brand.500` exported correctly in CSS format
- [ ] Verify `color.brand.600` exported correctly in CSS format
- [ ] Verify `color.brand.700` exported correctly in CSS format
- [ ] Verify `color.brand.800` exported correctly in CSS format
- [ ] Verify `color.brand.900` exported correctly in CSS format
- [ ] Verify `color.surface.*` tokens exported correctly per platform
- [ ] Verify `color.text.*` tokens exported correctly per platform
- [ ] Verify `color.state.*` tokens exported correctly per platform
- [ ] Verify `color.border.*` tokens exported correctly per platform
- [ ] Verify `color.neutral.*` tokens exported correctly per platform
- [ ] Verify `typography.fontFamily.*` exported correctly per platform
- [ ] Verify `typography.fontSize.*` exported correctly per platform
- [ ] Verify `typography.heading.h1` through `h6` exported with font, size, weight, lineHeight
- [ ] Verify `typography.body` exported correctly
- [ ] Verify `typography.caption` exported correctly
- [ ] Verify `typography.small` exported correctly
- [ ] Verify `spacing.*` tokens exported correctly per platform
- [ ] Verify `radius.*` tokens exported correctly per platform
- [ ] Verify `shadow.*` tokens exported correctly per platform
- [ ] Verify `motion.duration.*` tokens exported correctly per platform
- [ ] Verify `motion.easing.*` tokens exported correctly per platform

### 11.12 Integration with Existing Code

- [ ] Update `tokensToCssVars()` in existing code to use Style Dictionary CSS output or add deprecation notice
- [ ] Document migration path from hand-written CSS vars to Style Dictionary output in `packages/ui/README.md`
- [ ] Add section in `packages/ui/README.md` explaining `build:tokens` script usage
- [ ] Add section explaining `--brand` flag for custom brand profile JSON

### 11.13 Tests

- [ ] Test: run `build:tokens` with default tokens, verify all 7 output files exist
- [ ] Test: run `build:tokens --brand sample-brand.json`, verify overrides applied in CSS output
- [ ] Test: verify `css-vars.css` contains `--color-brand-500` with correct hex value
- [ ] Test: verify `tailwind-theme.js` exports object with `colors.brand` key
- [ ] Test: verify `deck.theme.json` contains `chart_colors` array
- [ ] Test: verify `report.theme.css` contains `--report-header-bg`
- [ ] Test: verify `tokens-studio.json` has correct `$type` annotations

### 11.14 CI Integration

- [ ] Add `build:tokens` step to GitHub Actions CI workflow
- [ ] Run `build:tokens` before the main UI build step
- [ ] Cache `packages/ui/generated/` directory in CI for faster builds
- [ ] Verify CI passes with token build step

- [ ] Add custom transform `brand/color-shade` to generate tint/shade variants from base color
- [ ] Add custom transform `brand/font-stack` to append web-safe fallback fonts
- [ ] Add custom transform `brand/spacing-rem` to convert px spacing to rem units
- [ ] Add custom transform `brand/shadow-css` to format shadow tokens as CSS `box-shadow` value
- [ ] Add custom transform `brand/motion-css` to format motion tokens as CSS `transition` value
- [ ] Document all custom transforms in `packages/ui/style-dictionary.config.js` with JSDoc comments
- [ ] Test custom transform `brand/color-shade` produces correct hex values
- [ ] Test custom transform `brand/font-stack` appends Arial, sans-serif
- [ ] Test custom transform `brand/spacing-rem` converts 16px to 1rem
- [ ] Add `build:tokens:watch` script for development (watch mode, rebuild on token file changes)
- [ ] Add color format transforms: output hex, rgb(), hsl() variants
- [ ] Test CSS vars file includes rgb variant: `--color-brand-500-rgb: 59, 130, 246`
- [ ] Verify token source files are valid JSON with `json-lint` or equivalent
- [ ] Add pre-build validation step: check all required token categories exist in source
- [ ] Add post-build validation step: verify output files are non-empty
- [ ] Verify tokens.swift contains proper Swift Color initializers
- [ ] Verify tokens.xml contains proper Android resource format
- [ ] Add `build:tokens:clean` script to remove `generated/` directory
- [ ] Test: run `build:tokens:clean` then `build:tokens` — verify clean rebuild
- [ ] Document required Node.js version for Style Dictionary in packages/ui/README.md
- [ ] Add `.editorconfig` to `packages/ui/tokens/` for consistent JSON formatting
- [ ] Verify Style Dictionary config handles missing optional token categories gracefully
- [ ] Test build with minimal token set (only color.brand.500) — verify partial output generated
- [ ] Add CSS media query tokens for `prefers-color-scheme: dark` in CSS output
- [ ] Test dark mode CSS vars are generated when dark mode tokens provided
- [ ] Verify Tailwind theme output is compatible with Tailwind CSS v3.x
- [ ] Test Tailwind theme import in a test tailwind.config.js — verify no errors
- [ ] Add `packages/ui/generated/.gitkeep` to track directory in git while ignoring generated files

---

## 12. Brand Compiler Factory Job (Items 1156–1240)

### 12.1 Job Type Registration

- [ ] Define `brand_compile` as a new LangGraph job type constant
- [ ] Add `brand_compile` to job type enum/union in `runners/src/kernel-contract.ts`
- [ ] Document `brand_compile` job type: input is `brand_profile_id`, output is compiled token artifacts

### 12.2 Handler Implementation

- [ ] Create file `runners/src/handlers/brand-compile.ts`
- [ ] Define `BrandCompileInput` interface: `brand_profile_id: string`
- [ ] Define `BrandCompileOutput` interface: `artifacts: { type: string, path: string }[]`
- [ ] Implement `execute(input: BrandCompileInput, brandContext: MaybeBrandContext)`
- [ ] Step 1: Load brand_profile from CP API: `GET /v1/brand_profiles/{brand_profile_id}`
- [ ] Handle missing brand profile: throw with descriptive error
- [ ] Step 2: Extract design_tokens from brand profile
- [ ] Write design_tokens to temp JSON file for Style Dictionary input
- [ ] Step 3: Call `build-tokens.ts` script with `--brand <temp-file-path>`
- [ ] Or: import Style Dictionary programmatically and run build in-process
- [ ] Capture build output file paths
- [ ] Step 4: Read generated files: `tailwind-theme.js`, `css-vars.css`, `tokens.json`, `deck.theme.json`, `report.theme.css`
- [ ] Step 5: Write each generated file as an artifact
- [ ] Write artifact for `tailwind-theme.js` with `artifact_type = 'tailwind_theme'`
- [ ] Write artifact for `css-vars.css` with `artifact_type = 'css_vars'`
- [ ] Write artifact for `tokens.json` with `artifact_type = 'tokens_json'`
- [ ] Write artifact for `deck.theme.json` with `artifact_type = 'deck_theme'`
- [ ] Write artifact for `report.theme.css` with `artifact_type = 'report_theme_css'`
- [ ] Set `producer_plan_node_id` on all artifacts
- [ ] Return `BrandCompileOutput` with artifact references

### 12.3 Executor Registry

- [ ] Register `brand_compile` handler in `runners/src/executor-registry.ts`
- [ ] Map job_type `brand_compile` to `brand-compile.ts` handler
- [ ] Verify handler is discoverable by executor registry lookup

### 12.4 Plan Compiler Integration

- [ ] Open plan compiler (where plan nodes are emitted)
- [ ] When initiative has `brand_profile_id` and plan includes generation nodes
- [ ] Optionally emit `brand_compile` as the first plan node in the DAG
- [ ] Set dependency: downstream generation nodes depend on `brand_compile` output
- [ ] Make `brand_compile` node conditional: only emit if initiative has brand_profile_id

### 12.5 Unit Tests

- [ ] Create test file `runners/src/handlers/__tests__/brand-compile.test.ts`
- [ ] Test execute with valid brand_profile_id: mock API, verify 5 artifacts produced
- [ ] Test execute with non-existent brand_profile_id: verify error thrown
- [ ] Test artifact types match expected values
- [ ] Test each artifact contains non-empty content
- [ ] Test CSS vars artifact contains `--color-brand-500`
- [ ] Test Tailwind theme artifact exports valid JS object
- [ ] Test tokens.json artifact is valid JSON

### 12.6 Integration Tests

- [ ] Test full pipeline: create brand_profile → run brand_compile job → verify all artifacts stored
- [ ] Test brand_compile output is usable by downstream deck_generate handler
- [ ] Test brand_compile with custom overrides: verify CSS vars reflect overrides
- [ ] Mock CP API and Style Dictionary for isolated testing

### 12.7 Documentation

- [ ] Add `brand_compile` job type description to `docs/STACK_AND_DECISIONS.md`
- [ ] Document input/output schema for `brand_compile`
- [ ] Document how `brand_compile` fits into the plan DAG
- [ ] Document when `brand_compile` is automatically emitted vs manually triggered

- [ ] Add timeout for brand_compile job: 120 seconds max execution time
- [ ] Add progress reporting: emit progress events at each step (loading, building, writing)
- [ ] Log each step duration for performance profiling
- [ ] Add `force` flag to brand_compile input: rebuild even if cached artifacts exist
- [ ] Implement artifact caching: check if brand_profile.updated_at > last compile time, skip if unchanged
- [ ] Add cache check function: `isBrandCompileCacheValid(brandProfileId, lastCompileArtifact)`
- [ ] Test cache validity check: brand unchanged → cache valid
- [ ] Test cache validity check: brand updated → cache invalid
- [ ] Add `brand_compile` to allowed job types in runner configuration
- [ ] Document brand_compile execution flow with step diagram
- [ ] Add error handling for each step: if Step 2 (build) fails, clean up temp files
- [ ] Add temp file cleanup in finally block of execute function
- [ ] Test execute with brand_profile that has empty design_tokens → uses all defaults
- [ ] Test execute with brand_profile that has partial overrides → merges correctly
- [ ] Add artifact metadata: `compile_duration_ms`, `brand_profile_version`, `compiler_version`
- [ ] Test artifact metadata includes compile_duration_ms > 0
- [ ] Verify artifacts are linked to the correct plan node via producer_plan_node_id
- [ ] Test brand_compile job can be triggered via CP API job endpoint
- [ ] Add health check: verify Style Dictionary binary/module is available before execute
- [ ] Add retry logic: if Style Dictionary build fails, retry once with clean temp directory
- [ ] Document supported brand_profile design_token keys that affect compilation output
- [ ] Add `brand_compile` job to plan visualizer (if exists) with correct node type icon
- [ ] Test plan compiler emits brand_compile node only when initiative has brand_profile_id
- [ ] Test plan compiler does NOT emit brand_compile when initiative has no brand_profile_id
- [ ] Verify downstream nodes (deck_generate, report_generate) correctly depend on brand_compile output
- [ ] Test downstream handler can read artifacts produced by brand_compile
- [ ] Add integration test: brand_compile → deck_generate pipeline executes successfully
- [ ] Add integration test: brand_compile → report_generate pipeline executes successfully
- [ ] Add monitoring alert: brand_compile job duration exceeds 60 seconds
- [ ] Document how to manually trigger brand_compile for debugging
- [ ] Add `--dry-run` flag to brand_compile: show what would be generated without writing artifacts
- [ ] Test dry-run mode returns artifact descriptions without writing to database
- [ ] Add `brand_compile` job type to executor-registry type union
- [ ] Verify executor-registry.ts type-checks with new brand_compile handler
- [ ] Add example brand_compile job request payload to documentation
- [ ] Test brand_compile with maximum token overrides (all categories) produces valid output
- [ ] Verify brand_compile artifacts are downloadable via artifact download endpoint
- [ ] Add cleanup job: delete stale brand_compile artifacts older than configurable retention period

---

## 13. Console — Brand Management UI: List Page (Items 1241–1345)

### 13.1 API Layer

- [ ] Create file `console/src/lib/api/brand-profiles.ts`
- [ ] Implement `getBrandProfiles(params: BrandProfileListQuery): Promise<PaginatedResponse<BrandProfile>>`
- [ ] Build URL: `/v1/brand_profiles` with query params
- [ ] Handle pagination params: `limit`, `offset`
- [ ] Handle filter params: `status`, `search`
- [ ] Parse response as `PaginatedResponse<BrandProfile>`
- [ ] Handle API errors: throw typed error
- [ ] Implement `getBrandProfile(id: string): Promise<BrandProfile>`
- [ ] Handle 404: throw `BrandProfileNotFoundError`

### 13.2 React Query Hooks

- [ ] Create file `console/src/hooks/use-brand-profiles.ts`
- [ ] Implement `useBrandProfiles(params)` hook using `useQuery`
- [ ] Set query key: `['brand-profiles', params]`
- [ ] Set staleTime: 30 seconds
- [ ] Return `{ data, isLoading, isError, error }`
- [ ] Implement `useBrandProfile(id)` hook using `useQuery`
- [ ] Set query key: `['brand-profile', id]`
- [ ] Enable query only when `id` is truthy

### 13.3 TypeScript Types

- [ ] Add `BrandProfile` interface to `console/src/lib/api.ts` or dedicated types file
- [ ] Add `BrandProfileListQuery` interface
- [ ] Add `PaginatedBrandProfileResponse` interface
- [ ] Export all types

### 13.4 Page Component

- [ ] Create file `console/app/brands/page.tsx`
- [ ] Import `PageFrame` from existing layout components
- [ ] Import `Stack` from existing layout components
- [ ] Import `PageHeader` from `@/components/ui/PageHeader`
- [ ] Render `PageFrame` wrapper
- [ ] Render `PageHeader` with title "Brands", subtitle "Manage brand profiles and design tokens"
- [ ] Render "New Brand" button in PageHeader actions, linked to `/brands/new`
- [ ] Render search input for filtering by name
- [ ] Render status filter dropdown: All, Active, Draft, Archived
- [ ] Call `useBrandProfiles` hook with current filters
- [ ] Render loading skeleton while data loads
- [ ] Render empty state when no brands exist: illustration, "No brands yet", "Create your first brand profile" CTA
- [ ] Render `DataTable` with brand profile rows

### 13.5 DataTable Columns

- [ ] Column: `name` — render brand name as text link
- [ ] Column: `archetype` — extract from `identity.archetype`, render as text
- [ ] Column: `industry` — extract from `identity.industry`, render as text
- [ ] Column: `primary_color` — extract from `design_tokens.color.brand.500`, render as color swatch circle
- [ ] Column: `status` — render as shadcn `Badge` with color variant (green=active, yellow=draft, gray=archived)
- [ ] Column: `created_at` — render as formatted date
- [ ] Row click handler: `router.push('/brands/${row.id}')`

### 13.6 Pagination

- [ ] Render pagination controls below table
- [ ] Show "Showing X–Y of Z brands"
- [ ] Previous/Next page buttons
- [ ] Update query params on page change
- [ ] Sync pagination state with URL search params

### 13.7 Navigation

- [ ] Add "Brands" item to sidebar navigation
- [ ] Place under "Brand & Design" group in sidebar
- [ ] Use Lucide `Palette` icon for Brands nav item
- [ ] Set active state when on `/brands` route
- [ ] Add breadcrumb component: Home > Brands

### 13.8 Styling

- [ ] Use shadcn `Table` component for DataTable
- [ ] Use shadcn `Badge` for status column
- [ ] Use shadcn `Skeleton` for loading states
- [ ] Use shadcn `Input` for search field
- [ ] Use shadcn `Select` for status filter
- [ ] Use shadcn `Button` for "New Brand" CTA
- [ ] Style color swatch as 24x24 rounded circle with border
- [ ] Ensure responsive layout: table scrolls horizontally on mobile

### 13.9 Tests

- [ ] Test: brands list page renders without errors
- [ ] Test: loading skeleton appears while fetching
- [ ] Test: empty state appears when API returns no brands
- [ ] Test: table renders correct columns and data
- [ ] Test: status badge shows correct variant per status
- [ ] Test: color swatch renders with correct background color
- [ ] Test: search input filters list on change
- [ ] Test: status filter updates query
- [ ] Test: pagination updates offset param
- [ ] Test: row click navigates to `/brands/{id}`
- [ ] Test: "New Brand" button navigates to `/brands/new`

- [ ] Add keyboard shortcut support: Cmd+K to focus search input on brands list
- [ ] Add multi-select support for bulk actions (archive, export)
- [ ] Render bulk action toolbar when rows are selected: Archive Selected, Export Selected
- [ ] Implement bulk archive: call DELETE for each selected brand, refresh list
- [ ] Add export button: export brand profiles as JSON file
- [ ] Implement JSON export: fetch all matching profiles, download as .json file
- [ ] Add column visibility toggle: hide/show columns via dropdown menu
- [ ] Add responsive layout: card view on mobile, table view on desktop
- [ ] Render card layout on screens < 768px: brand name, color swatch, status badge
- [ ] Add sort column headers: click column header to sort, show sort direction indicator
- [ ] Implement client-side or URL-param based sorting
- [ ] Add favicon/icon preview in table row if brand has favicon asset
- [ ] Add last updated relative time: "2 hours ago", "3 days ago"
- [ ] Add empty search result state: "No brands matching '{search}'", clear search CTA
- [ ] Add quick create: inline form at top of table for rapid brand creation (name only)
- [ ] Add accessibility: proper `aria-label` on all interactive elements
- [ ] Add accessibility: keyboard navigation support for table rows
- [ ] Add accessibility: screen reader text for color swatches
- [ ] Test: sort by name changes row order
- [ ] Test: bulk archive archives multiple brands
- [ ] Test: export downloads JSON file
- [ ] Test: column visibility toggle hides and shows columns
- [ ] Test: card layout renders on mobile viewport
- [ ] Test: keyboard shortcut focuses search input
- [ ] Ensure Next.js page uses `'use client'` directive for interactive features
- [ ] Add page metadata: `<title>Brands | AI Factory Console</title>`
- [ ] Add Open Graph metadata for brands page
- [ ] Add `prefetchQuery` for brand profiles on sidebar nav hover for faster navigation
- [ ] Add error boundary wrapping brands list page
- [ ] Test: error boundary catches and displays render errors gracefully
- [ ] Implement URL-synced filters: `/brands?status=active&search=acme&page=2`
- [ ] Test: refreshing page with URL filters restores filter state
- [ ] Test: back button preserves previous filter state
- [ ] Test: navigating to /brands with no params shows default state
- [ ] Add analytics tracking: page view event for /brands list

---

## 14. Console — Brand Detail Page (Items 1346–1475)

### 14.1 Page Component Setup

- [ ] Create file `console/app/brands/[id]/page.tsx`
- [ ] Extract `id` from route params
- [ ] Call `useBrandProfile(id)` hook
- [ ] Render `PageFrame` wrapper
- [ ] Render `PageHeader` with brand name as title
- [ ] Render "Edit" button in PageHeader linking to `/brands/{id}/edit`
- [ ] Render "Archive" button in PageHeader with confirmation dialog
- [ ] Render breadcrumb: Brands > {brand name}
- [ ] Handle loading state: render skeleton per section
- [ ] Handle 404: render "Brand profile not found" message with back link

### 14.2 Tabs

- [ ] Render shadcn `Tabs` component with tabs: Overview, Tokens, Assets, Embeddings
- [ ] Default to "Overview" tab
- [ ] Sync active tab with URL hash or query param

### 14.3 Identity Card Section

- [ ] Create `CardSection` wrapper component (or reuse existing)
- [ ] Render "Identity" card section
- [ ] Display `archetype` with label
- [ ] Display `industry` with label
- [ ] Display `tagline` with label
- [ ] Display `mission` with label (multiline)
- [ ] Display `values` as tag list if present
- [ ] Handle missing fields: show "Not set" in muted text

### 14.4 Tone & Voice Card Section

- [ ] Render "Tone & Voice" card section
- [ ] Display `voice_descriptors` as badge/tag list
- [ ] Display `reading_level` with label
- [ ] Display `sentence_length` with label
- [ ] Display `formality` with label
- [ ] Style badges with brand primary color

### 14.5 Visual Style Card Section

- [ ] Render "Visual Style" card section
- [ ] Display `density` (spacious/default/compact)
- [ ] Display `style_description` as text block
- [ ] Display `image_style` with label
- [ ] Display `illustration_style` with label

### 14.6 Copy Style Card Section

- [ ] Render "Copy Style" card section
- [ ] Display `voice` as text block
- [ ] Display `banned_words` as red-tinted tag list
- [ ] Display `preferred_phrases` as green-tinted tag list
- [ ] Display `cta_style` with label

### 14.7 Design Tokens Preview — Colors

- [ ] Render "Design Tokens" card section
- [ ] Render color palette subsection header: "Brand Colors"
- [ ] Render brand color swatches 50 through 900 (10 swatches in a row)
- [ ] Each swatch: show hex value on hover tooltip
- [ ] Render "Surface Colors" subsection with swatches for each surface token
- [ ] Render "Text Colors" subsection with swatches
- [ ] Render "State Colors" subsection (success, warning, error, info swatches)
- [ ] Render "Border Colors" subsection with swatches
- [ ] Render "Neutral Colors" subsection with swatches

### 14.8 Design Tokens Preview — Typography

- [ ] Render "Typography" subsection
- [ ] Display heading samples h1–h6: render actual text with the heading's font, size, weight, lineHeight
- [ ] Display subheading sample
- [ ] Display body text sample
- [ ] Display caption sample
- [ ] Display small text sample
- [ ] Show font family name, size in px, and weight next to each sample
- [ ] Use brand fonts if loaded (from design_tokens.typography.fontFamily)

### 14.9 Design Tokens Preview — Spacing, Radius, Shadow

- [ ] Render spacing scale visualization: boxes with increasing padding labeled with token name
- [ ] Render radius samples: boxes with each border-radius value applied
- [ ] Render shadow samples: cards with each shadow level applied
- [ ] Render motion tokens: show duration values as text

### 14.10 Deck Theme Card Section

- [ ] Render "Deck Theme" card section
- [ ] Display chart color sequence as a row of color swatches
- [ ] Display KPI card style preview: mock KPI card rendered with deck theme
- [ ] Display table style preview: mini table header/row with deck theme colors
- [ ] Display slide master config: background, logo position, font

### 14.11 Report Theme Card Section

- [ ] Render "Report Theme" card section
- [ ] Display header style preview: colored bar with logo position
- [ ] Display section spacing value
- [ ] Display chart defaults (type, color sequence)
- [ ] Display callout style preview: mock callout rendered with report theme

### 14.12 Brand Assets Card Section

- [ ] Render "Brand Assets" card section
- [ ] Display logo thumbnail if logo asset exists
- [ ] Display icon thumbnail if icon asset exists
- [ ] Display favicon thumbnail
- [ ] Display og_image thumbnail
- [ ] For each asset: show asset_type label and clickable thumbnail
- [ ] Handle missing assets: show placeholder with "No {type} uploaded" message
- [ ] Link each asset to full-size view

### 14.13 Brand Embeddings Card Section

- [ ] Render "Brand Embeddings" summary card
- [ ] Display total embedding count
- [ ] Display breakdown by type (bar chart or stat list)
- [ ] Render "Manage Embeddings" link to `/brands/{id}/embeddings`

### 14.14 API & Hooks

- [ ] Ensure `useBrandProfile(id)` fetches from `GET /v1/brand_profiles/{id}`
- [ ] Add `useArchiveBrandProfile(id)` mutation hook
- [ ] On archive: call `DELETE /v1/brand_profiles/{id}`, invalidate query, redirect to `/brands`
- [ ] Show success toast on archive
- [ ] Show error toast on failure

### 14.15 Tests

- [ ] Test: detail page renders all card sections for a full brand profile
- [ ] Test: identity section displays archetype and industry
- [ ] Test: tone section displays voice descriptors as badges
- [ ] Test: color swatches render with correct background colors
- [ ] Test: typography samples use correct font/size/weight
- [ ] Test: deck theme shows chart color sequence
- [ ] Test: report theme shows callout preview
- [ ] Test: assets section shows thumbnails
- [ ] Test: embeddings section shows count
- [ ] Test: 404 state renders when brand not found
- [ ] Test: loading skeleton renders while fetching
- [ ] Test: archive button triggers confirmation dialog
- [ ] Test: edit button navigates to edit page
- [ ] Test: tabs switch content correctly

- [ ] Add print styles for brand detail page (print-friendly layout)
- [ ] Add "Duplicate Brand" button in PageHeader actions
- [ ] Implement duplicate: POST to clone endpoint, redirect to new brand detail
- [ ] Add "Export as JSON" button: download brand profile as formatted JSON file
- [ ] Implement JSON export: serialize BrandProfile to JSON, trigger browser download
- [ ] Add "Compile Tokens" button: trigger brand_compile job from UI
- [ ] Show compilation status after triggering: polling for job completion
- [ ] Display last compilation timestamp and artifact links
- [ ] Add copy-to-clipboard on hex values in color swatches
- [ ] Show toast on copy: "Copied #3B82F6"
- [ ] Add CSS variable name display next to each token preview: `--color-brand-500`
- [ ] Add expandable/collapsible sections for each card (default expanded)
- [ ] Remember collapsed state in localStorage per section
- [ ] Add responsive layout: single column on mobile, two columns on desktop for token previews
- [ ] Add token preview live mode: mini iframe rendering a sample UI with brand tokens applied
- [ ] Render sample button, input, and card in live preview using brand tokens
- [ ] Add "Open in Playground" link to test brand tokens in isolated environment
- [ ] Add loading animation for each card section (staggered skeleton fade-in)
- [ ] Add accessibility: color contrast ratio display next to text/background color pairs
- [ ] Show WCAG AA/AAA compliance badge next to color contrast ratio
- [ ] Test: "Duplicate Brand" creates a copy and redirects
- [ ] Test: "Export as JSON" triggers file download
- [ ] Test: copy-to-clipboard copies correct hex value
- [ ] Test: collapsible sections toggle visibility
- [ ] Test: live preview renders with correct brand tokens
- [ ] Add page metadata: `<title>{brand name} | Brands | AI Factory Console</title>`
- [ ] Add structured data (JSON-LD) for brand detail page
- [ ] Test: deck theme card renders chart color swatches in correct order
- [ ] Test: report theme card renders callout preview with correct border color
- [ ] Test: tabs correctly show/hide content based on active tab
- [ ] Verify all card sections handle deeply nested null values without crashing

---

## 15. Console — Brand Edit/New Pages (Items 1476–1630)

### 15.1 Form Schema (Zod)

- [ ] Create file `console/src/lib/validators/brand-profile-form.ts`
- [ ] Define `brandProfileFormSchema` using zod
- [ ] Validate `name`: `z.string().min(1).max(255)`
- [ ] Validate `status`: `z.enum(['active','draft','archived']).default('active')`
- [ ] Validate `identity.archetype`: `z.string().optional()`
- [ ] Validate `identity.industry`: `z.string().optional()`
- [ ] Validate `identity.tagline`: `z.string().max(500).optional()`
- [ ] Validate `identity.mission`: `z.string().max(2000).optional()`
- [ ] Validate `tone.voice_descriptors`: `z.array(z.string()).optional()`
- [ ] Validate `tone.reading_level`: `z.enum(['grade_5','grade_7','grade_9','grade_12','professional']).optional()`
- [ ] Validate `tone.sentence_length`: `z.enum(['short','medium','long']).optional()`
- [ ] Validate `visual_style.density`: `z.enum(['spacious','default','compact']).optional()`
- [ ] Validate `visual_style.style_description`: `z.string().optional()`
- [ ] Validate `visual_style.image_style`: `z.string().optional()`
- [ ] Validate `visual_style.illustration_style`: `z.string().optional()`
- [ ] Validate `copy_style.voice`: `z.string().optional()`
- [ ] Validate `copy_style.banned_words`: `z.array(z.string()).optional()`
- [ ] Validate `copy_style.preferred_phrases`: `z.array(z.string()).optional()`
- [ ] Validate `copy_style.cta_style`: `z.string().optional()`
- [ ] Validate design_tokens nested color fields
- [ ] Validate design_tokens typography fields
- [ ] Validate deck_theme fields
- [ ] Validate report_theme fields
- [ ] Export schema and inferred type `BrandProfileFormValues`

### 15.2 Mutation Hooks

- [ ] Create `useCreateBrandProfile()` hook using `useMutation`
- [ ] On success: invalidate `['brand-profiles']` query, show success toast, redirect to `/brands/{id}`
- [ ] On error: show error toast with message
- [ ] Create `useUpdateBrandProfile(id)` hook using `useMutation`
- [ ] On success: invalidate `['brand-profile', id]` and `['brand-profiles']`, show success toast, redirect to `/brands/{id}`
- [ ] On error: show error toast

### 15.3 New Brand Page

- [ ] Create file `console/app/brands/new/page.tsx`
- [ ] Render `PageFrame` with `PageHeader` title "New Brand"
- [ ] Render breadcrumb: Brands > New
- [ ] Initialize `react-hook-form` with `brandProfileFormSchema` resolver
- [ ] Pass `useCreateBrandProfile` mutation to form submit handler
- [ ] Render form sections (detailed below)
- [ ] Render "Create Brand" submit button
- [ ] Render "Cancel" button linking to `/brands`

### 15.4 Edit Brand Page

- [ ] Create file `console/app/brands/[id]/edit/page.tsx`
- [ ] Extract `id` from route params
- [ ] Fetch existing brand profile with `useBrandProfile(id)`
- [ ] Initialize form with existing values as `defaultValues`
- [ ] Render `PageFrame` with `PageHeader` title "Edit {brand name}"
- [ ] Render breadcrumb: Brands > {name} > Edit
- [ ] Pass `useUpdateBrandProfile(id)` mutation to form submit handler
- [ ] Render form sections
- [ ] Render "Save Changes" submit button
- [ ] Render "Cancel" button linking to `/brands/{id}`
- [ ] Handle loading: show form skeleton
- [ ] Handle 404: show error message

### 15.5 Form Section: Basic Info

- [ ] Render section header "Basic Information"
- [ ] Render `name` input field with label "Brand Name", placeholder "e.g. Acme Corp"
- [ ] Show validation error if name is empty
- [ ] Render `status` select field: Active, Draft, Archived
- [ ] Default to "Active" for new brands

### 15.6 Form Section: Identity

- [ ] Render section header "Brand Identity"
- [ ] Render `archetype` input with label "Brand Archetype", placeholder "e.g. The Creator"
- [ ] Render `industry` input with label "Industry", placeholder "e.g. SaaS / FinTech"
- [ ] Render `tagline` textarea with label "Tagline", max 500 chars, character counter
- [ ] Render `mission` textarea with label "Mission Statement", max 2000 chars, character counter

### 15.7 Form Section: Tone

- [ ] Render section header "Tone & Voice"
- [ ] Render `voice_descriptors` as tag input: type text, press Enter to add tag, click X to remove
- [ ] Render `reading_level` select: Grade 5, Grade 7, Grade 9, Grade 12, Professional
- [ ] Render `sentence_length` select: Short, Medium, Long
- [ ] Render `formality` select: Casual, Conversational, Neutral, Formal, Very Formal

### 15.8 Form Section: Visual Style

- [ ] Render section header "Visual Style"
- [ ] Render `density` select: Spacious, Default, Compact
- [ ] Render `style_description` textarea with label and placeholder
- [ ] Render `image_style` input with label "Image Style", placeholder "e.g. Photography, Illustrations"
- [ ] Render `illustration_style` input with label "Illustration Style", placeholder "e.g. Flat, 3D, Hand-drawn"

### 15.9 Form Section: Copy Style

- [ ] Render section header "Copy Style"
- [ ] Render `voice` textarea with label "Brand Voice Description"
- [ ] Render `banned_words` as tag input with label "Banned Words"
- [ ] Style banned word tags with red-tinted background
- [ ] Render `preferred_phrases` as tag input with label "Preferred Phrases"
- [ ] Style preferred phrase tags with green-tinted background
- [ ] Render `cta_style` select or input with label "CTA Style", placeholder "e.g. Action-oriented, Friendly"

### 15.10 Form Section: Design Tokens — Colors

- [ ] Render section header "Design Tokens"
- [ ] Render subsection "Brand Colors"
- [ ] Render color picker for `color.brand.50` with hex input and swatch preview
- [ ] Render color picker for `color.brand.100`
- [ ] Render color picker for `color.brand.200`
- [ ] Render color picker for `color.brand.300`
- [ ] Render color picker for `color.brand.400`
- [ ] Render color picker for `color.brand.500` (labeled "Primary")
- [ ] Render color picker for `color.brand.600`
- [ ] Render color picker for `color.brand.700`
- [ ] Render color picker for `color.brand.800`
- [ ] Render color picker for `color.brand.900`
- [ ] Render color pickers for surface tokens: `surface.primary`, `surface.secondary`, `surface.elevated`
- [ ] Render color pickers for text tokens: `text.primary`, `text.secondary`, `text.disabled`
- [ ] Render color pickers for state tokens: `success`, `warning`, `error`, `info`
- [ ] Render color pickers for border token: `border.default`
- [ ] Render color pickers for neutral tokens: `neutral.50` through `neutral.900`
- [ ] Add "Auto-generate palette" button: given brand.500, generate 50-900 via algorithm

### 15.11 Form Section: Design Tokens — Typography

- [ ] Render subsection "Typography"
- [ ] Render font family selector for heading: dropdown or Google Fonts search
- [ ] Render font family selector for body
- [ ] Render font size inputs for h1 through h6
- [ ] Render font weight selectors for h1 through h6
- [ ] Render line height inputs for h1 through h6
- [ ] Render body font size input
- [ ] Render caption font size input
- [ ] Render small font size input

### 15.12 Form Section: Design Tokens — Spacing, Radius, Shadow, Motion

- [ ] Render subsection "Spacing"
- [ ] Render spacing scale editor: key-value pairs (name → pixel value)
- [ ] Render subsection "Border Radius"
- [ ] Render radius selector: slider or presets (none, small, medium, large, full)
- [ ] Render subsection "Shadows"
- [ ] Render shadow presets or custom shadow builder
- [ ] Render subsection "Motion"
- [ ] Render duration input fields with unit (ms)
- [ ] Render easing function selector: ease, ease-in, ease-out, ease-in-out, cubic-bezier custom

### 15.13 Form Section: Deck Theme

- [ ] Render section header "Deck Theme"
- [ ] Render chart color sequence editor: drag-to-reorder color chips
- [ ] Add/remove color chips from sequence
- [ ] Render KPI card style config: value font size input, label font size input, border radius input
- [ ] Render table style config: header background color picker, row stripe color picker
- [ ] Render slide master config: background color, logo position select (top-left, top-right, bottom-left, bottom-right)

### 15.14 Form Section: Report Theme

- [ ] Render section header "Report Theme"
- [ ] Render header style: background color picker, text color picker, logo position select, height input
- [ ] Render section spacing input (px)
- [ ] Render chart defaults: default chart type select, grid lines toggle
- [ ] Render callout style: background color, border left color, border width, padding, font style select

### 15.15 Form Section: Assets

- [ ] Render section header "Brand Assets"
- [ ] Render logo upload: file input accepting images, preview thumbnail
- [ ] Render icon upload with preview
- [ ] Render favicon upload with preview
- [ ] Render og_image upload with preview
- [ ] On file select: upload to storage, get URI, store in form state
- [ ] Show upload progress indicator

### 15.16 Form Submission

- [ ] On form submit: serialize form values to BrandProfileCreate or BrandProfileUpdate
- [ ] Strip empty/null fields from submission
- [ ] Call create or update mutation
- [ ] Show loading spinner on submit button during API call
- [ ] Disable form fields during submission
- [ ] On success: show success toast "Brand profile created/updated"
- [ ] On success: redirect to `/brands/{id}`
- [ ] On error: show error toast with API error message
- [ ] On validation error: scroll to first invalid field

### 15.17 Tests

- [ ] Test: new brand page renders all form sections
- [ ] Test: name field shows validation error when empty on submit
- [ ] Test: tag input adds and removes tags correctly
- [ ] Test: color picker updates hex value
- [ ] Test: form submits successfully with valid data
- [ ] Test: form shows error toast on API failure
- [ ] Test: edit page pre-fills form with existing brand data
- [ ] Test: edit page updates brand on submit
- [ ] Test: cancel button navigates back
- [ ] Test: loading skeleton renders while fetching existing brand

- [ ] Add unsaved changes warning: prompt user on navigation if form is dirty

---

## 16. Console — Brand Embeddings Management (Items 1631–1700)

### 16.1 Page Setup

- [ ] Create file `console/app/brands/[id]/embeddings/page.tsx`
- [ ] Extract brand `id` from route params
- [ ] Render `PageFrame` with `PageHeader` title "Brand Embeddings"
- [ ] Render breadcrumb: Brands > {brand name} > Embeddings
- [ ] Fetch brand profile for header context

### 16.2 API Hooks

- [ ] Implement `useBrandEmbeddings(brandId, params)` hook with `useQuery`
- [ ] Set query key: `['brand-embeddings', brandId, params]`
- [ ] Implement `useCreateBrandEmbedding(brandId)` mutation hook
- [ ] On success: invalidate `['brand-embeddings', brandId]`
- [ ] Implement `useDeleteBrandEmbedding(brandId)` mutation hook
- [ ] On success: invalidate `['brand-embeddings', brandId]`
- [ ] Implement `useSearchBrandEmbeddings(brandId)` hook

### 16.3 DataTable

- [ ] Render DataTable with columns: `embedding_type`, `content` (truncated to 100 chars), `created_at`, actions
- [ ] Render delete button in actions column
- [ ] Style `embedding_type` as badge
- [ ] Truncate content with ellipsis and expand on click/hover

### 16.4 Filtering & Pagination

- [ ] Render embedding_type filter dropdown: All, brand_description, copy_example, visual_guidelines, sample_ad, sample_email, tone_description
- [ ] Render search input for content text search
- [ ] Render pagination controls
- [ ] Sync filters with URL params

### 16.5 Add Embedding Dialog

- [ ] Render "Add Embedding" button in page header
- [ ] Render dialog/modal on button click
- [ ] Dialog contains: textarea for content, select for embedding_type, optional JSON textarea for metadata
- [ ] Validate: content non-empty, type selected
- [ ] Submit button: calls create mutation
- [ ] Show loading state during creation
- [ ] Close dialog on success, show success toast
- [ ] Show error on failure

### 16.6 Bulk Upload

- [ ] Add "Bulk Upload" button in page header
- [ ] Render bulk upload dialog: large textarea for pasting multiple texts (one per line)
- [ ] Select embedding_type for all entries
- [ ] On submit: create embedding for each line sequentially
- [ ] Show progress: "Creating 3/10 embeddings..."
- [ ] Handle partial failures: show which lines failed
- [ ] On complete: invalidate query, show summary toast

### 16.7 Delete Confirmation

- [ ] Render confirmation dialog on delete button click
- [ ] Dialog text: "Are you sure you want to delete this embedding?"
- [ ] Confirm button triggers delete mutation
- [ ] Show loading on confirm button
- [ ] Close dialog on success, show success toast

### 16.8 States

- [ ] Loading state: render skeleton rows
- [ ] Empty state: "No embeddings yet" with "Add your first embedding" CTA
- [ ] Error state: render error message with retry button

### 16.9 Tests

- [ ] Test: embeddings page renders table with data
- [ ] Test: filter by type updates table
- [ ] Test: add embedding dialog creates new embedding
- [ ] Test: delete confirmation dialog removes embedding
- [ ] Test: bulk upload creates multiple embeddings
- [ ] Test: empty state renders when no embeddings
- [ ] Test: loading skeleton renders while fetching

- [ ] Add embedding content preview modal: click embedding row to see full content in modal
- [ ] Add export embeddings as CSV button
- [ ] Implement CSV export: download embedding_type, content, created_at as CSV
- [ ] Add inline editing: double-click embedding metadata to edit in-place
- [ ] Add similarity search tab: input field to search embeddings by semantic similarity
- [ ] Render search results with similarity score badges
- [ ] Add embedding statistics card: total count, count by type pie chart, avg content length
- [ ] Render stats card above the data table
- [ ] Add bulk delete: checkbox column, select multiple, delete selected
- [ ] Implement bulk delete confirmation: show count of selected embeddings
- [ ] Add copy content to clipboard button on each row
- [ ] Test: content preview modal shows full text
- [ ] Test: CSV export downloads correct data
- [ ] Test: similarity search returns ranked results with scores
- [ ] Test: statistics card shows correct counts
- [ ] Test: bulk delete removes multiple embeddings
- [ ] Add accessibility: keyboard navigation for embedding table rows
- [ ] Add pagination page size selector: 10, 25, 50, 100 items per page
- [ ] Test: page size selector updates table rows displayed
- [ ] Add auto-refresh toggle: periodically refresh embedding list (useful during bulk import)

---

## 17. Console — Initiative Brand Selector (Items 1701–1755)

### 17.1 Brand Profile Select Component

- [ ] Create file `console/src/components/BrandProfileSelect.tsx`
- [ ] Accept props: `value` (uuid | null), `onChange` (uuid | null) => void, `disabled`
- [ ] Fetch brand profiles with `useBrandProfiles({ status: 'active', limit: 100 })`
- [ ] Render shadcn `Select` component
- [ ] Add "None" option with value `null`
- [ ] For each brand profile: render option with name + color swatch (inline 12px circle)
- [ ] Show selected brand name and swatch in select trigger
- [ ] Handle loading: show "Loading brands..." placeholder
- [ ] Handle empty: show "No brands available" disabled option

### 17.2 Initiative Create Form Update

- [ ] Open `console/app/initiatives/new` (or create form component)
- [ ] Import `BrandProfileSelect`
- [ ] Add `brand_profile_id` field to form schema
- [ ] Render `BrandProfileSelect` in form with label "Brand Profile"
- [ ] Pass selected value to create mutation payload
- [ ] Validate: brand_profile_id is optional UUID or null

### 17.3 Initiative Edit Form Update

- [ ] Open initiative edit form/page
- [ ] Import `BrandProfileSelect`
- [ ] Add `brand_profile_id` field with existing value as default
- [ ] Render `BrandProfileSelect` in form
- [ ] Pass updated value to update mutation payload

### 17.4 Admin Initiative Form

- [ ] Open `console/app/admin/initiatives/new` if separate admin form exists
- [ ] Add `BrandProfileSelect` to admin initiative form
- [ ] Pass brand_profile_id to create/update payload

### 17.5 Initiative Detail Page

- [ ] Open initiative detail page
- [ ] If `brand_profile_id` is set: display brand profile name
- [ ] Display color swatch next to brand name
- [ ] Render brand name as link to `/brands/{brand_profile_id}`
- [ ] If `brand_profile_id` is null: show "No brand assigned" muted text

### 17.6 API Type Updates

- [ ] Update `Initiative` TypeScript interface to include `brand_profile_id: string | null`
- [ ] Update `InitiativeCreate` interface to include optional `brand_profile_id`
- [ ] Update `InitiativeUpdate` interface to include optional `brand_profile_id`
- [ ] Update `useCreateInitiative` hook to pass `brand_profile_id`
- [ ] Update `useUpdateInitiative` hook to pass `brand_profile_id`

### 17.7 Tests

- [ ] Test: BrandProfileSelect renders options from API
- [ ] Test: BrandProfileSelect shows color swatch per option
- [ ] Test: selecting "None" sets value to null
- [ ] Test: initiative create form includes brand_profile_id in payload
- [ ] Test: initiative edit form pre-selects current brand
- [ ] Test: initiative detail shows brand name with link
- [ ] Test: initiative detail shows "No brand assigned" when null
- [ ] Test: BrandProfileSelect shows loading state

- [ ] Add "Create New Brand" quick action inside BrandProfileSelect dropdown
- [ ] Clicking "Create New Brand" opens a mini dialog to create brand without leaving initiative form
- [ ] After mini-create: new brand appears in dropdown and is auto-selected
- [ ] Add preview tooltip on hover over brand option: show archetype, industry, color palette
- [ ] Add search/filter within BrandProfileSelect dropdown for large brand lists
- [ ] Style selected brand option with color swatch border highlight
- [ ] Show brand status badge in dropdown options (Active/Draft)
- [ ] Filter out archived brands from dropdown (only show active and draft)
- [ ] Add clear button (X) to deselect brand profile (set to None)
- [ ] Test: "Create New Brand" mini dialog creates brand and selects it
- [ ] Test: search within dropdown filters brand options
- [ ] Test: archived brands are not shown in dropdown
- [ ] Test: clear button resets selection to None
- [ ] Test: tooltip shows brand preview on hover

---

## 18. Document Components Library (Items 1756–1855)

### 18.1 Package Setup

- [ ] Create directory `packages/doc-kit/`
- [ ] Create `packages/doc-kit/package.json` with name `@ai-factory/doc-kit`
- [ ] Add dependencies: `pptxgenjs`, `typescript`
- [ ] Create `packages/doc-kit/tsconfig.json` extending root tsconfig
- [ ] Create `packages/doc-kit/src/index.ts` as barrel export

### 18.2 Component Interfaces

- [ ] Create `packages/doc-kit/src/types.ts`
- [ ] Define `DocComponentProps` base interface with `brandTokens`, `deckTheme`, `reportTheme`
- [ ] Define `KPICardProps`: `value`, `label`, `trend`, `trendDirection`, `unit`
- [ ] Define `TableBlockProps`: `headers`, `rows`, `caption`, `striped`
- [ ] Define `ChartBlockProps`: `type` (bar/line/pie/radar), `data`, `labels`, `title`
- [ ] Define `CalloutProps`: `text`, `type` (info/warning/success), `icon`
- [ ] Define `TimelineProps`: `events: { date, title, description }[]`
- [ ] Define `PricingTableProps`: `plans: { name, price, features, cta }[]`
- [ ] Define `CoverSlideProps`: `title`, `subtitle`, `date`, `author`, `logoUri`
- [ ] Define `DividerSlideProps`: `title`, `subtitle`
- [ ] Define `TextBlockProps`: `content` (markdown or rich text), `alignment`
- [ ] Define `ImageBlockProps`: `uri`, `alt`, `caption`, `width`, `height`
- [ ] Define `TwoColumnLayoutProps`: `left`, `right` (each a DocComponent)
- [ ] Define `HeaderBlockProps`: `title`, `logoUri`, `date`
- [ ] Define `FooterBlockProps`: `text`, `pageNumber`
- [ ] Export all interfaces

### 18.3 KPICard Component

- [ ] Create `packages/doc-kit/src/components/kpi-card.ts`
- [ ] Implement `renderKPICardPptx(props: KPICardProps, theme: DeckTheme): PptxSlideContent`
- [ ] Apply deck_theme kpi_card.value_font_size, label_font_size, border_radius
- [ ] Apply brand color from design_tokens for background/text
- [ ] Implement `renderKPICardHtml(props: KPICardProps, theme: ReportTheme): string`
- [ ] Return HTML string with inline styles from brand tokens
- [ ] Unit test: PPTX render produces object with correct font sizes
- [ ] Unit test: HTML render produces valid HTML with brand colors

### 18.4 TableBlock Component

- [ ] Create `packages/doc-kit/src/components/table-block.ts`
- [ ] Implement `renderTableBlockPptx(props, theme)`: create PPTX table with themed header
- [ ] Apply deck_theme table_style colors
- [ ] Apply stripe color for alternating rows
- [ ] Implement `renderTableBlockHtml(props, theme)`: return HTML table with CSS classes
- [ ] Unit test: PPTX table has correct row count
- [ ] Unit test: HTML table has thead and tbody with correct cells

### 18.5 ChartBlock Component

- [ ] Create `packages/doc-kit/src/components/chart-block.ts`
- [ ] Implement `renderChartBlockPptx(props, theme)`: create PPTX chart placeholder with data
- [ ] Apply chart_colors from deck_theme
- [ ] Implement `renderChartBlockHtml(props, theme)`: return Chart.js canvas HTML + script
- [ ] Apply report_theme chart_defaults for type and colors
- [ ] Unit test: PPTX chart uses theme color sequence
- [ ] Unit test: HTML chart includes correct data labels

### 18.6 Callout Component

- [ ] Create `packages/doc-kit/src/components/callout.ts`
- [ ] Implement `renderCalloutPptx(props, theme)`: styled text box in PPTX
- [ ] Implement `renderCalloutHtml(props, theme)`: div with report_theme callout_style
- [ ] Unit test PPTX render
- [ ] Unit test HTML render applies border-left from report_theme

### 18.7 Timeline Component

- [ ] Create `packages/doc-kit/src/components/timeline.ts`
- [ ] Implement `renderTimelinePptx(props, theme)`: vertical timeline in PPTX
- [ ] Implement `renderTimelineHtml(props, theme)`: CSS timeline with brand accent colors
- [ ] Unit test PPTX has correct event count
- [ ] Unit test HTML contains all event titles

### 18.8 PricingTable Component

- [ ] Create `packages/doc-kit/src/components/pricing-table.ts`
- [ ] Implement `renderPricingTablePptx(props, theme)`: columnar pricing comparison
- [ ] Implement `renderPricingTableHtml(props, theme)`: responsive pricing grid
- [ ] Unit test PPTX column count matches plans
- [ ] Unit test HTML renders all plan names

### 18.9 CoverSlide Component

- [ ] Create `packages/doc-kit/src/components/cover-slide.ts`
- [ ] Implement `renderCoverSlidePptx(props, theme)`: title slide with logo, title, subtitle, date
- [ ] Apply slide_master background and font
- [ ] Implement `renderCoverSlideHtml(props, theme)`: full-page cover section
- [ ] Unit test PPTX includes title text
- [ ] Unit test HTML includes logo URI

### 18.10 DividerSlide Component

- [ ] Create `packages/doc-kit/src/components/divider-slide.ts`
- [ ] Implement `renderDividerSlidePptx(props, theme)`: section break slide
- [ ] Implement `renderDividerSlideHtml(props, theme)`: section break with HR
- [ ] Unit test PPTX
- [ ] Unit test HTML

### 18.11 Remaining Components

- [ ] Implement `TextBlock` PPTX and HTML renderers in `text-block.ts`
- [ ] Implement `ImageBlock` PPTX and HTML renderers in `image-block.ts`
- [ ] Implement `TwoColumnLayout` PPTX and HTML renderers in `two-column-layout.ts`
- [ ] Implement `HeaderBlock` PPTX and HTML renderers in `header-block.ts`
- [ ] Implement `FooterBlock` PPTX and HTML renderers in `footer-block.ts`
- [ ] Unit test each remaining component for PPTX output
- [ ] Unit test each remaining component for HTML output

### 18.12 Barrel Export & Renderer Registry

- [ ] Create `packages/doc-kit/src/renderer-registry.ts`
- [ ] Map `component_type` string → PPTX render function
- [ ] Map `component_type` string → HTML render function
- [ ] Implement `renderComponentPptx(type, props, theme)` dispatcher
- [ ] Implement `renderComponentHtml(type, props, theme)` dispatcher
- [ ] Export all components and renderers from `index.ts`
- [ ] Verify all 13 component types are registered

- [ ] Add PDF render function for each component using `@react-pdf/renderer` or HTML-to-PDF pipeline
- [ ] Implement `renderKPICardPdf(props, theme)` returning PDF element
- [ ] Implement `renderTableBlockPdf(props, theme)` returning PDF element
- [ ] Implement `renderChartBlockPdf(props, theme)` returning PDF chart image
- [ ] Implement `renderCalloutPdf(props, theme)` returning PDF element
- [ ] Add `packages/doc-kit/src/utils/color-utils.ts` with color manipulation helpers
- [ ] Implement `hexToRgb(hex)`, `rgbToHex(r,g,b)`, `darken(hex, percent)`, `lighten(hex, percent)`
- [ ] Implement `getContrastColor(bg)` returning black or white text for readability
- [ ] Use `getContrastColor` in all components to ensure text readability on brand backgrounds
- [ ] Add `packages/doc-kit/src/utils/font-utils.ts` with font measurement helpers
- [ ] Implement `estimateTextWidth(text, fontSize, fontFamily)` for layout calculations
- [ ] Unit test color utils: hexToRgb, rgbToHex round-trip
- [ ] Unit test: darken('#3B82F6', 20) produces darker color
- [ ] Unit test: getContrastColor('#000000') returns '#FFFFFF'
- [ ] Unit test: getContrastColor('#FFFFFF') returns '#000000'
- [ ] Add integration test: render all 13 component types to PPTX without errors
- [ ] Add integration test: render all 13 component types to HTML without errors

---

## 19. Deck Generator (PptxGenJS) (Items 1856–1955)

### 19.1 Installation

- [ ] Run `npm install pptxgenjs` in `runners/` or `packages/doc-kit/`
- [ ] Verify `pptxgenjs` in package.json dependencies
- [ ] Verify import works: `import PptxGenJS from 'pptxgenjs'`

### 19.2 Handler Implementation

- [ ] Create file `runners/src/handlers/deck-generate.ts` (if not created in Section 10)
- [ ] Import `PptxGenJS` from `pptxgenjs`
- [ ] Import doc-kit renderers from `@ai-factory/doc-kit`
- [ ] Define `DeckGenerateInput`: `template_id`, `data`, `title`, `subtitle`, `output_format`
- [ ] Implement `execute(input, brandContext)`
- [ ] Fetch document_template: `GET /v1/document_templates/{template_id}`
- [ ] Handle template not found: throw error
- [ ] Extract `component_sequence` from template
- [ ] Extract `deck_theme` from brandContext (or use defaults)
- [ ] Extract `design_tokens` from brandContext (or use defaults)
- [ ] Create new `PptxGenJS` instance
- [ ] Set presentation metadata: title, subject, author

### 19.3 Slide Master Setup

- [ ] Define slide master from `deck_theme.slide_master`
- [ ] Set background color from `slide_master.background_color`
- [ ] Set default font from `slide_master.font_family`
- [ ] Set title font size from `slide_master.title_font_size`
- [ ] Set body font size from `slide_master.body_font_size`
- [ ] Add logo placeholder in `slide_master.logo_position`
- [ ] If brand assets include logo: insert logo image at specified position
- [ ] Apply slide master to all slides via `pptx.defineSlideMaster`

### 19.4 Component Rendering Loop

- [ ] For each component in `component_sequence`:
- [ ] Look up component config from `document_components` or inline config
- [ ] Call `renderComponentPptx(component.type, component.config, deckTheme)` from doc-kit
- [ ] Add rendered content to new PPTX slide
- [ ] Handle `cover` component: render as title slide
- [ ] Handle `divider` component: render as section break slide
- [ ] Handle `kpi_card` component: render KPI cards (2-4 per slide)
- [ ] Handle `table` component: render data table slide
- [ ] Handle `chart` component: render chart slide
- [ ] Handle `callout` component: render callout text box
- [ ] Handle `timeline` component: render timeline slide
- [ ] Handle `text` component: render text content slide
- [ ] Handle `image` component: render full-image slide
- [ ] Handle `two_column` component: render two-column layout slide
- [ ] Handle unknown component type: log warning, skip

### 19.5 Output Generation

- [ ] Call `pptx.writeFile()` or `pptx.write('arraybuffer')`
- [ ] Convert output to Buffer for artifact storage
- [ ] Write PPTX artifact with `artifact_type = 'deck'`
- [ ] Set `producer_plan_node_id` on artifact
- [ ] Include metadata: template_id, brand_profile_id, slide_count, generated_at
- [ ] Return artifact reference with slide count

### 19.6 Default Templates

- [ ] Define default component_sequence for `pitch_deck` template type
- [ ] Define default component_sequence for `financial_deck` template type
- [ ] Define default component_sequence for `investor_update` template type
- [ ] Define default component_sequence for `seo_report_deck` template type
- [ ] Define default component_sequence for `ops_deck` template type
- [ ] Store defaults in `runners/src/handlers/deck-templates/` directory
- [ ] Each default: cover → agenda → content slides → summary → closing

### 19.7 Executor Registry

- [ ] Register `deck_generate` in executor-registry as job_type
- [ ] Verify handler resolves for `deck_generate` job type

### 19.8 Unit Tests

- [ ] Test: deck_generate produces PPTX buffer
- [ ] Test: PPTX has correct number of slides matching component_sequence length
- [ ] Test: title slide contains input title text
- [ ] Test: KPI card slide renders value and label
- [ ] Test: chart slide uses deck_theme chart_colors
- [ ] Test: table slide has correct headers from data
- [ ] Test: slide master background color matches deck_theme
- [ ] Test: logo is placed at correct position from slide_master config
- [ ] Test: unknown component type is skipped with warning log

### 19.9 Integration Tests

- [ ] Test full pipeline: create brand → create template with 5 components → generate deck → verify 5 slides
- [ ] Test deck with custom chart_colors → verify colors in output
- [ ] Test deck without brand context → uses default theme
- [ ] Test deck with all component types → all render without errors
- [ ] Test large deck (20+ slides) → generates successfully
- [ ] Verify PPTX output opens in PowerPoint/LibreOffice (manual check documented)

- [ ] Add presentation metadata: company name, presenter name, date from brand identity
- [ ] Set PPTX `author` field from brand identity or input params
- [ ] Set PPTX `company` field from brand identity.industry or company name
- [ ] Set PPTX `revision` field to 1
- [ ] Add footer to each slide: brand name, date, slide number
- [ ] Configure footer position and font from deck_theme
- [ ] Add transition effects between slides: fade or slide (configurable in deck_theme)
- [ ] Set slide dimensions: 16:9 (default) or 4:3 (configurable in template_config)
- [ ] Add `pricing` component handler: render pricing table slide
- [ ] Add `two_column` component handler: render split-layout slide with left/right content
- [ ] Generate slide thumbnails: render first frame of each slide as PNG for preview
- [ ] Store thumbnails as separate artifacts for preview in console UI
- [ ] Add validation: ensure all required data fields exist for each component before rendering
- [ ] Log warning for components with missing data fields (render placeholder instead of crash)
- [ ] Add `output_format` support: PPTX (default), or PDF (via PPTX-to-PDF conversion)
- [ ] If PDF requested: convert PPTX to PDF using LibreOffice CLI or cloud conversion service
- [ ] Test: presentation metadata contains correct author and company
- [ ] Test: footer appears on all slides with brand name
- [ ] Test: slide dimensions are 16:9 by default
- [ ] Test: pricing component renders correct plan count
- [ ] Test: two_column component renders left and right content
- [ ] Test: missing data field renders placeholder text instead of crashing
- [ ] Test: deck with cover + 3 content + closing = 5 slides
- [ ] Test: each default template (pitch, financial, investor, seo, ops) generates valid PPTX
- [ ] Add performance benchmark: generate 50-slide deck, log execution time
- [ ] Test: PPTX file size is reasonable (< 10MB for 20 slides without images)
- [ ] Add support for embedding images from brand assets into slides
- [ ] Test: brand logo from assets appears on cover slide
- [ ] Verify PPTX output is compatible with PowerPoint, Keynote, and Google Slides
- [ ] Add `--preview` flag to deck-generate: output HTML preview instead of PPTX for quick iteration
- [ ] Test: preview mode generates HTML with slide-by-slide view
- [ ] Add artifact metadata: `slide_count`, `template_type`, `file_size_bytes`

---

## 20. Report Generator (Quarto / HTML) (Items 1956–2035)

### 20.1 Handler Implementation

- [ ] Create file `runners/src/handlers/report-generate.ts` (if not created in Section 10)
- [ ] Define `ReportGenerateInput`: `template_id`, `data`, `title`, `date_range`, `output_format` (html/pdf)
- [ ] Implement `execute(input, brandContext)`
- [ ] Fetch document_template from CP API
- [ ] Extract component_sequence
- [ ] Extract `report_theme` and `design_tokens` from brandContext

### 20.2 HTML Shell

- [ ] Create report HTML shell template string
- [ ] Include `<head>` with brand CSS variables injected from report_theme
- [ ] Include branded header: background color, text color, logo, title
- [ ] Include table of contents placeholder
- [ ] Include `<main>` content area
- [ ] Include branded footer
- [ ] Load Google Fonts for brand typography

### 20.3 Component Rendering

- [ ] For each component in sequence: call `renderComponentHtml` from doc-kit
- [ ] Assemble HTML sections into main content area
- [ ] Generate table of contents from section headers
- [ ] Add section numbering
- [ ] Handle page breaks for PDF output (CSS `page-break-before`)

### 20.4 CSS Variable Injection

- [ ] Generate CSS `:root` block from report_theme
- [ ] Inject `--report-header-bg`, `--report-header-text`
- [ ] Inject `--report-section-spacing`
- [ ] Inject chart color variables `--report-chart-color-N`
- [ ] Inject callout style variables
- [ ] Inject font family variables
- [ ] Inject spacing and radius variables from design_tokens

### 20.5 Templates

- [ ] Define default template for `seo_report`: cover → executive summary → keyword analysis → traffic charts → recommendations
- [ ] Define default template for `finance_report`: cover → P&L table → cash flow chart → KPI cards → outlook
- [ ] Define default template for `ops_report`: cover → status table → incident timeline → metrics → actions
- [ ] Define default template for `analytics_report`: cover → funnel chart → cohort table → retention chart → insights
- [ ] Store default templates in `runners/src/handlers/report-templates/`

### 20.6 PDF Output (Optional)

- [ ] If `output_format === 'pdf'`: use Puppeteer to convert HTML to PDF
- [ ] Install `puppeteer` or `puppeteer-core` as optional dependency
- [ ] Launch headless browser, load HTML, print to PDF
- [ ] Or: use Quarto CLI if installed: `quarto render report.html --to pdf`
- [ ] Handle Puppeteer not available: fallback to HTML-only output with warning
- [ ] Write PDF artifact if generated

### 20.7 Output & Registry

- [ ] Write HTML artifact with `artifact_type = 'report'`
- [ ] Write PDF artifact with `artifact_type = 'report_pdf'` if generated
- [ ] Set `producer_plan_node_id` on all artifacts
- [ ] Register `report_generate` in executor-registry

### 20.8 Unit Tests

- [ ] Test: report HTML contains branded header with report_theme colors
- [ ] Test: report HTML contains table of contents
- [ ] Test: report HTML includes all components from sequence
- [ ] Test: CSS variables block contains expected brand variables
- [ ] Test: chart component renders with report chart colors
- [ ] Test: callout component uses report_theme callout_style
- [ ] Test: without brand context, report uses default styling

### 20.9 Integration Tests

- [ ] Test full pipeline: create brand → create report template → generate report → verify HTML artifact
- [ ] Test seo_report default template generates valid HTML
- [ ] Test finance_report with table data → table renders correctly
- [ ] Test report with custom fonts → Google Fonts link included
- [ ] Test large report with 20+ components renders without errors

- [ ] Add syntax highlighting for code blocks in reports using Prism.js
- [ ] Add responsive CSS: report renders on desktop and tablet viewports
- [ ] Add print stylesheet: report prints cleanly from browser
- [ ] Add auto-numbering for figures and tables
- [ ] Add figure captions with auto-numbering
- [ ] Add table captions with auto-numbering
- [ ] Generate table of contents with clickable anchor links
- [ ] Add back-to-top floating button in report HTML
- [ ] Add report metadata section: author, date range, generation timestamp
- [ ] Include report_theme font imports from Google Fonts CDN
- [ ] Add `output_format` support: HTML (default), PDF (via Puppeteer), DOCX (future)
- [ ] If DOCX requested: convert HTML to DOCX using pandoc or similar tool
- [ ] Add loading indicator for lazy-loaded chart components
- [ ] Inject Chart.js library from CDN for interactive charts in HTML output
- [ ] Add chart interaction: hover shows data values, click shows detail tooltip
- [ ] Add data table below each chart for accessibility
- [ ] Test: table of contents links navigate to correct sections
- [ ] Test: figure auto-numbering is sequential across report
- [ ] Test: Chart.js renders interactive chart in HTML output
- [ ] Test: PDF output includes all sections from HTML
- [ ] Test: report with custom fonts loads fonts from CDN
- [ ] Test: report with all component types renders without errors
- [ ] Test: empty report (no data) renders gracefully with placeholder sections
- [ ] Add report generation metrics: component count, total word count, image count
- [ ] Test: report metadata section shows correct date range
- [ ] Verify HTML output is valid (passes W3C HTML validator)
- [ ] Add accessibility: proper heading hierarchy (h1 > h2 > h3)
- [ ] Add accessibility: alt text for all chart images in PDF output

---

## 21. Brand-Aware Email Generation (Items 2036–2095)

### 21.1 Email Handler Brand Integration

- [ ] Open `runners/src/handlers/email-generate.ts` (created in Section 10)
- [ ] Import `brandContextToDesignTokens` from `brand-context.ts`
- [ ] When brandContext is present: extract design_tokens
- [ ] Map `color.brand.500` to email primary CTA button background
- [ ] Map `color.brand.700` to email header background
- [ ] Map `color.text.primary` to email body text color
- [ ] Map `typography.fontFamily.body` to email font stack

### 21.2 Email Template Styling

- [ ] Create email HTML template with inline CSS (email client compatibility)
- [ ] Apply brand primary color to header bar
- [ ] Apply brand secondary color to footer
- [ ] Apply brand fonts with web-safe fallbacks
- [ ] Apply brand button style to CTA buttons: background, text color, border-radius
- [ ] Apply brand link color to hyperlinks
- [ ] Include brand logo from brand assets (if available)

### 21.3 Copy Generation with Brand Context

- [ ] Build LLM system prompt from brandContext using `brandContextToSystemPrompt`
- [ ] Include copy_style.voice in system prompt for email body
- [ ] Include copy_style.banned_words as negative constraints
- [ ] Include copy_style.preferred_phrases as positive guidance
- [ ] Include copy_style.cta_style for CTA text generation
- [ ] Include tone.reading_level for complexity targeting
- [ ] Include tone.sentence_length preference

### 21.4 Metadata & Tracking

- [ ] Store `brand_profile_id` in email artifact metadata
- [ ] Store brand colors used in artifact metadata for audit
- [ ] Include brand_profile_id in LLM call metadata for cost attribution
- [ ] Track brand-specific email generation metrics

### 21.5 Email-Marketing-Factory Integration

- [ ] Open `email-marketing-factory/` relevant files
- [ ] When campaign has brand_profile_id: load brand context
- [ ] Pass brand design tokens to email template renderer
- [ ] Override MUI theme colors with brand tokens if applicable
- [ ] Ensure brand-specific emails render correctly in email preview

### 21.6 Tests

- [ ] Test: email HTML contains brand primary color in header
- [ ] Test: email HTML contains brand font family
- [ ] Test: CTA button uses brand colors
- [ ] Test: email without brand context uses default colors
- [ ] Test: LLM prompt includes brand tone and copy style
- [ ] Test: banned words from copy_style appear in system prompt
- [ ] Test: generate email with brand A → brand A colors in output
- [ ] Test: generate email with brand B → brand B colors in output (different from A)
- [ ] Test: email artifact metadata includes brand_profile_id
- [ ] Test: brand logo appears in email header if asset exists

- [ ] Add email preview endpoint: render email HTML without sending, return as API response
- [ ] Add support for dark mode email templates using `prefers-color-scheme` media query
- [ ] Add brand watermark option: subtle brand pattern in email background
- [ ] Add email template variants: text-only, HTML, AMP email
- [ ] Validate email HTML against common email client rendering rules (litmus-style checks)
- [ ] Add email component library: reusable header, footer, CTA button, divider with brand tokens
- [ ] Create branded email header component with logo and background color
- [ ] Create branded email footer component with social links and unsubscribe
- [ ] Create branded CTA button component with configurable text and brand colors
- [ ] Test: dark mode email uses brand dark-mode colors
- [ ] Test: text-only variant strips HTML and preserves content structure
- [ ] Test: email preview endpoint returns rendered HTML
- [ ] Test: email component library header renders with brand logo
- [ ] Test: email component library CTA button uses brand primary color
- [ ] Test: email HTML is compatible with major email clients (Gmail, Outlook, Apple Mail)
- [ ] Add A/B test support: generate two email variants with different CTAs
- [ ] Test: A/B variant generation produces two distinct emails with same brand
- [ ] Add email subject line scoring: use LLM to rate subject line effectiveness
- [ ] Test: subject line score is between 0 and 100
- [ ] Document email template customization options in docs/BRAND_ENGINE.md

---

## 22. Brand-Aware UI Scaffold Generation (Items 2096–2140)

### 22.1 Handler Implementation

- [ ] Open `runners/src/handlers/ui-scaffold.ts` (created in Section 10)
- [ ] Implement Tailwind config generation from brand design_tokens
- [ ] Map `color.brand.*` to Tailwind `colors.brand` in generated config
- [ ] Map `color.surface.*` to Tailwind `colors.surface`
- [ ] Map `color.text.*` to Tailwind `colors.text`
- [ ] Map `typography.fontFamily.*` to Tailwind `fontFamily`
- [ ] Map `spacing.*` to Tailwind `spacing` if custom values
- [ ] Map `radius.*` to Tailwind `borderRadius`
- [ ] Map `shadow.*` to Tailwind `boxShadow`

### 22.2 CSS Variables Output

- [ ] Generate CSS custom properties file from brand tokens
- [ ] Output `--color-brand-50` through `--color-brand-900`
- [ ] Output `--color-surface-primary`, `--color-surface-secondary`
- [ ] Output `--font-heading`, `--font-body`
- [ ] Output `--radius-*`, `--shadow-*`
- [ ] Write CSS vars artifact

### 22.3 Component Token Generation

- [ ] Generate component-level token overrides (e.g., Button, Card, Input primitives)
- [ ] Map brand tokens to shadcn CSS variables format
- [ ] Output as artifact for direct consumption by generated UI

### 22.4 Prompt Templates for AI Code Generation

- [ ] Create prompt template for Cursor AI: "Use these brand design tokens: {tokens}"
- [ ] Create prompt template for v0: include brand colors and typography in prompt
- [ ] Store prompt templates as configurable artifacts
- [ ] Document how to inject brand tokens into AI code generation prompts

### 22.5 Landing Page / Dashboard Generation

- [ ] Generate landing page scaffold with brand tokens applied
- [ ] Generate dashboard scaffold with brand tokens applied
- [ ] Each scaffold: use brand colors, fonts, spacing
- [ ] Output as HTML/React artifact

### 22.6 Tests

- [ ] Test: Tailwind config contains brand colors from design_tokens
- [ ] Test: CSS variables file contains all expected custom properties
- [ ] Test: component tokens map correctly to shadcn variable format
- [ ] Test: prompt template includes brand token values
- [ ] Test: scaffold without brand context uses defaults
- [ ] Test: scaffold with brand context applies overrides
- [ ] Test: generated artifacts are syntactically valid (JS for Tailwind, CSS for vars)
- [ ] Test: UI scaffold handler registered in executor-registry
- [ ] Test: landing page scaffold includes brand primary color
- [ ] Test: dashboard scaffold includes brand font family

- [ ] Add shadcn component override generation: map brand tokens to shadcn CSS variable overrides
- [ ] Generate `globals.css` with brand token CSS custom properties for Next.js projects
- [ ] Add theme preview component: rendered iframe showing sample page with brand tokens
- [ ] Generate brand-specific Storybook theme configuration
- [ ] Implement Storybook theme output: `.storybook/brand-theme.ts` artifact
- [ ] Test: shadcn CSS variable overrides include all color and radius tokens
- [ ] Test: globals.css contains `--background`, `--foreground`, `--primary` mapped from brand tokens
- [ ] Test: Storybook theme uses brand colors for sidebar and toolbar
- [ ] Add prompt template for GitHub Copilot / Cursor: include brand tokens as context

---

## 23. Brand Embeddings Pipeline (RAG) (Items 2141–2195)

### 23.1 Embedding Adapter

- [ ] Create file `runners/src/adapters/embedding-adapter.ts`
- [ ] Implement `embedText(text: string): Promise<number[]>`
- [ ] Call LLM gateway `/embeddings` endpoint with `model: 'text-embedding-3-small'` and `input: text`
- [ ] Parse response to extract embedding vector (array of 1536 floats)
- [ ] Handle API errors: retry once, then throw
- [ ] Add request timeout (30 seconds)
- [ ] Log embedding generation latency for monitoring
- [ ] Export `embedText`

### 23.2 Brand RAG Module

- [ ] Create file `runners/src/brand-rag.ts`
- [ ] Implement `storeBrandEmbedding(brandId: string, type: string, content: string): Promise<void>`
- [ ] Call `embedText(content)` to generate vector
- [ ] Call CP API `POST /v1/brand_profiles/{brandId}/embeddings` with content, type, embedding vector
- [ ] Handle duplicate content: log warning, skip
- [ ] Implement `searchBrandEmbeddings(brandId: string, query: string, topK: number): Promise<SearchResult[]>`
- [ ] Call `embedText(query)` to embed query
- [ ] Call CP API `GET /v1/brand_profiles/{brandId}/embeddings/search?q={query}&top_k={topK}`
- [ ] Return ranked results with content and similarity score
- [ ] Export both functions

### 23.3 Runner Integration

- [ ] Before LLM call in copy_generate handler: search brand embeddings for relevant context
- [ ] Inject top-k embedding results into LLM user message as "Brand Context Examples"
- [ ] Before LLM call in email_generate handler: search brand embeddings for tone examples
- [ ] Inject results as additional context
- [ ] Before LLM call in ui_scaffold handler: search for visual guideline embeddings
- [ ] Make RAG injection configurable: enable/disable per handler
- [ ] Default to top-3 results if not specified

### 23.4 MCP Tool Registration

- [ ] Register MCP tool `brand_embed_text`: input (brand_id, type, content), calls `storeBrandEmbedding`
- [ ] Register MCP tool `brand_search_embeddings`: input (brand_id, query, top_k), calls `searchBrandEmbeddings`
- [ ] Define tool schemas for MCP
- [ ] Add tool descriptions for LLM tool-use

### 23.5 Unit Tests

- [ ] Test: `embedText` calls LLM gateway and returns 1536-length vector
- [ ] Test: `embedText` retries on first failure
- [ ] Test: `storeBrandEmbedding` calls embedText then CP API
- [ ] Test: `searchBrandEmbeddings` embeds query then calls search API
- [ ] Test: search results sorted by similarity descending
- [ ] Test: MCP tool `brand_embed_text` invokes correctly
- [ ] Test: MCP tool `brand_search_embeddings` invokes correctly

### 23.6 Integration Tests

- [ ] Test: embed sample brand description → search with related query → verify result contains embedded content
- [ ] Test: embed multiple texts → search returns correct ranking (most similar first)
- [ ] Test: copy_generate handler injects RAG context into LLM prompt
- [ ] Test: email_generate handler includes brand tone examples from RAG
- [ ] Test: RAG disabled → handler works without embedding search
- [ ] Test: verify cosine similarity scores are in [0, 1] range
- [ ] Test: embed, delete, search → deleted embedding not returned

- [ ] Add embedding batch processing: process multiple texts concurrently with rate limiting
- [ ] Implement rate limiter: max 10 concurrent embedding API calls
- [ ] Add embedding deduplication: check if content already embedded before creating duplicate
- [ ] Implement dedup check: hash content, check against existing embeddings metadata.content_hash
- [ ] Add content chunking: split long content (>8000 tokens) into overlapping chunks before embedding
- [ ] Implement chunk overlap: 200 token overlap between consecutive chunks
- [ ] Store chunk metadata: `chunk_index`, `total_chunks`, `parent_content_hash`
- [ ] Test: batch processing embeds 10 texts with max 10 concurrent calls
- [ ] Test: deduplication skips already-embedded content
- [ ] Test: content chunking splits 20000-char text into multiple embeddings
- [ ] Test: chunk overlap preserves context at boundaries
- [ ] Add embedding freshness: track when source content changes, re-embed stale embeddings

---

## 24. Documentation (Items 2196–2275)

### 24.1 docs/BRAND_ENGINE.md

- [ ] Create file `docs/BRAND_ENGINE.md`
- [ ] Write title: "Brand Engine + BrandOS Architecture"
- [ ] Write introduction: purpose of the Brand Engine in the AI Factory
- [ ] Write architecture diagram section: describe BrandOS layers (data → compiler → runtime → UI)
- [ ] Draw ASCII or Mermaid diagram of brand context flow
- [ ] Document `brand_profiles` table schema with all columns and types
- [ ] Document `brand_embeddings` table schema
- [ ] Document `document_templates` table schema
- [ ] Document `document_components` table schema
- [ ] Document `brand_assets` table schema
- [ ] Document brand context flow: initiative → brand_profile_id → runner loadBrandContext → LLM system prompt
- [ ] Document Style Dictionary pipeline: tokens → build → multi-platform output
- [ ] Document deck generation: template + brand + data → PptxGenJS → .pptx artifact
- [ ] Document report generation: template + brand + data → HTML → PDF
- [ ] Document brand embeddings RAG: embed content → vector store → similarity search → context injection
- [ ] Add GitHub references to relevant source files
- [ ] Add "Getting Started" section: how to create a brand profile and use it
- [ ] Add "API Reference" section: list all brand-related endpoints

### 24.2 docs/DESIGN_TOKENS.md Updates

- [ ] Open `docs/DESIGN_TOKENS.md` (or create if not exists)
- [ ] Add section referencing `brand_profiles` as the source of custom design tokens
- [ ] Document Style Dictionary as the token compiler
- [ ] Document output formats: CSS, JS, JSON, Swift, Android XML, Tailwind
- [ ] Document deck_theme and report_theme token subsets
- [ ] Reference `packages/ui/scripts/build-tokens.ts` for build instructions
- [ ] Reference `packages/ui/style-dictionary.config.js` for configuration

### 24.3 docs/STACK_AND_DECISIONS.md Updates

- [ ] Open `docs/STACK_AND_DECISIONS.md`
- [ ] Add "Brand Engine" section describing the BrandOS integration
- [ ] Document `brand_compile` job type: purpose, input, output
- [ ] Document `deck_generate` job type: purpose, input, output
- [ ] Document `report_generate` job type: purpose, input, output
- [ ] Document `copy_generate`, `email_generate`, `ui_scaffold` job types
- [ ] Note decision to use PptxGenJS for deck generation
- [ ] Note decision to use Style Dictionary for multi-platform token compilation
- [ ] Note decision to use pgvector for brand embeddings

### 24.4 docs/FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md Updates

- [ ] Open `docs/FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md`
- [ ] Add "Brand Engine" row to feature adoption table
- [ ] Columns: feature name, prompt phase, SaaS phase, status

### 24.5 docs/README.md Updates

- [ ] Open `docs/README.md` (or project root README)
- [ ] Add link to `docs/BRAND_ENGINE.md` in documentation index
- [ ] Add link to `docs/DOCUMENT_GENERATION.md`
- [ ] Add brief description of Brand Engine feature

### 24.6 docs/LLM_GATEWAY_AND_OPTIMIZATION.md Updates

- [ ] Open `docs/LLM_GATEWAY_AND_OPTIMIZATION.md` (or create)
- [ ] Add note about brand context injection in LLM calls
- [ ] Document `x-brand-profile-id` header for brand-scoped cost tracking
- [ ] Document embedding generation costs via LLM gateway
- [ ] Note brand context increases prompt token count — impact on costs

### 24.7 docs/DOCUMENT_GENERATION.md

- [ ] Create file `docs/DOCUMENT_GENERATION.md`
- [ ] Write title: "Document Generation — Decks & Reports"
- [ ] Document deck templates: pitch_deck, financial_deck, investor_update, seo_report_deck, ops_deck
- [ ] Document report templates: seo_report, finance_report, ops_report, analytics_report
- [ ] Document PptxGenJS usage for deck generation
- [ ] Document HTML + optional PDF for report generation
- [ ] Document document components library (packages/doc-kit)
- [ ] Document component types and their props
- [ ] Document how templates reference components via component_sequence
- [ ] Document how brand tokens are applied to each component type
- [ ] Add example: creating a pitch deck from a template

### 24.8 Code-Level Documentation

- [ ] Add JSDoc to `loadBrandContext` function in `runners/src/brand-context.ts`
- [ ] Add JSDoc to `brandContextToSystemPrompt` function
- [ ] Add JSDoc to `brandContextToDesignTokens` function
- [ ] Add JSDoc to `embedText` function in embedding-adapter
- [ ] Add JSDoc to `searchBrandEmbeddings` function in brand-rag
- [ ] Add README.md to `packages/doc-kit/` explaining component library usage
- [ ] Add inline documentation to `style-dictionary.config.js` explaining each platform

- [ ] Add sequence diagram in BRAND_ENGINE.md showing branded artifact generation flow
- [ ] Add ER diagram in BRAND_ENGINE.md showing all brand-related tables and relationships
- [ ] Add data flow diagram: brand_profile → design_tokens → Style Dictionary → multi-platform output
- [ ] Add troubleshooting section: common issues with brand context loading, embedding generation, token compilation
- [ ] Add FAQ section: "Can I use multiple brands per initiative?" — not yet, planned in roadmap
- [ ] Add performance tuning section: IVFFlat probes, embedding batch size, context cache TTL
- [ ] Add migration guide: how to add brand support to existing initiatives
- [ ] Add changelog section: version history of Brand Engine features
- [ ] Document all environment variables related to Brand Engine: `BRAND_CONTEXT_ENABLED`, `FIGMA_API_TOKEN`
- [ ] Add API rate limit documentation for brand-related endpoints
- [ ] Document document component props with examples in DOCUMENT_GENERATION.md
- [ ] Add example: creating a financial report template with specific components
- [ ] Add example: generating a branded email campaign
- [ ] Add example: searching brand embeddings for copy inspiration
- [ ] Add glossary of Brand Engine terms: brand profile, design tokens, deck theme, report theme, brand embeddings
- [ ] Review all documentation for consistency in terminology and formatting

---

## 25. Testing & CI (Items 2276–2365)

### 25.1 Unit Tests Checklist

- [ ] Unit tests exist for `brand_profiles` CRUD in control plane
- [ ] Unit tests exist for `brand_embeddings` CRUD in control plane
- [ ] Unit tests exist for `document_templates` CRUD in control plane
- [ ] Unit tests exist for `brand_assets` CRUD in control plane
- [ ] Unit tests exist for `loadBrandContext` in runner
- [ ] Unit tests exist for `brandContextToSystemPrompt` in runner
- [ ] Unit tests exist for `brandContextToDesignTokens` in runner
- [ ] Unit tests exist for `BrandContextCache` in runner
- [ ] Unit tests exist for `embedText` in embedding adapter
- [ ] Unit tests exist for `storeBrandEmbedding` in brand-rag
- [ ] Unit tests exist for `searchBrandEmbeddings` in brand-rag
- [ ] Unit tests exist for Style Dictionary build script
- [ ] Unit tests exist for each doc-kit component PPTX render
- [ ] Unit tests exist for each doc-kit component HTML render
- [ ] Unit tests exist for deck generator handler
- [ ] Unit tests exist for report generator handler
- [ ] Unit tests exist for brand-compile handler
- [ ] Unit tests exist for copy_generate handler
- [ ] Unit tests exist for email_generate handler
- [ ] Unit tests exist for ui_scaffold handler
- [ ] All unit tests pass locally: `npm test` in each package

### 25.2 Integration Tests Checklist

- [ ] Integration test: create brand_profile via CP API → verify stored in DB
- [ ] Integration test: create initiative with brand_profile_id → load brand context in runner → verify context populated
- [ ] Integration test: compile plan for branded initiative → verify brand_compile node emitted
- [ ] Integration test: run brand_compile job → verify token artifacts generated
- [ ] Integration test: run deck_generate with brand → verify branded PPTX artifact
- [ ] Integration test: run report_generate with brand → verify branded HTML artifact
- [ ] Integration test: embed brand content → search → verify ranked results
- [ ] Integration test: generate branded email → verify brand colors in HTML
- [ ] Integration test: full lifecycle: brand → initiative → plan → run → artifact with brand metadata

### 25.3 E2E Tests (Playwright)

- [ ] Create E2E test file for brand flows
- [ ] E2E: navigate to /brands → page renders with title "Brands"
- [ ] E2E: /brands list renders data table with brand rows
- [ ] E2E: click "New Brand" → navigate to /brands/new
- [ ] E2E: fill brand form with name, archetype, primary color → submit → brand created
- [ ] E2E: navigate to /brands/[id] → detail page renders identity section
- [ ] E2E: detail page renders color swatches
- [ ] E2E: click "Edit" → navigate to edit page with pre-filled form
- [ ] E2E: update brand name → submit → name updated
- [ ] E2E: archive brand → status changes to archived
- [ ] E2E: navigate to initiative create → brand selector dropdown present
- [ ] E2E: select brand in initiative form → submit → initiative has brand_profile_id
- [ ] E2E: navigate to /brands/[id]/embeddings → embeddings page renders
- [ ] E2E: add embedding via dialog → embedding appears in table

### 25.4 CI Pipeline Updates

- [ ] Add brand_engine migration step to CI: run `20250303000007_brand_engine.sql` on test DB
- [ ] Add `build:tokens` step to CI pipeline (before UI build)
- [ ] Add `packages/doc-kit` build step to CI
- [ ] Add brand-related unit tests to CI test matrix
- [ ] Add brand-related integration tests to CI test matrix
- [ ] Add E2E brand tests to Playwright CI step
- [ ] Verify CI pipeline passes with all new steps
- [ ] Add test coverage threshold for brand-related code (80% minimum)
- [ ] Add CI check for Style Dictionary output file existence
- [ ] Verify CI caches `packages/ui/generated/` between runs

### 25.5 Test Utilities

- [ ] Create test fixture: sample `BrandProfile` object with all fields populated
- [ ] Create test fixture: sample `BrandContext` object
- [ ] Create test fixture: sample `DocumentTemplate` with component_sequence
- [ ] Create mock: CP API brand profile endpoint mock
- [ ] Create mock: LLM gateway embedding endpoint mock
- [ ] Create helper: `createTestBrandProfile()` for integration tests
- [ ] Create helper: `createTestDocumentTemplate()` for integration tests
- [ ] Document test fixture usage in `__tests__/README.md` or equivalent

- [ ] Unit tests exist for BrandProfileSelect component rendering and interactions
- [ ] Unit tests exist for brand form zod validation schema
- [ ] Unit tests exist for brand color picker component
- [ ] Unit tests exist for brand tag input component
- [ ] Unit tests exist for chart color sequence editor component
- [ ] Unit tests exist for brand profile JSON export function
- [ ] Unit tests exist for brand-rag MCP tool registration
- [ ] Unit tests exist for report HTML shell generation
- [ ] Unit tests exist for email component library (header, footer, CTA)
- [ ] Integration test: update brand design_tokens → re-compile → verify new artifacts reflect changes
- [ ] Integration test: add brand embedding → generate copy with RAG → verify embedding content referenced
- [ ] Integration test: brand with assets → generate deck → verify logo appears on cover slide
- [ ] Integration test: clone document template → generate deck with clone → verify identical output
- [ ] E2E: navigate to /brands/[id]/embeddings → add embedding → search → verify search result
- [ ] E2E: brand detail page renders color swatches with correct colors
- [ ] E2E: brand detail page typography samples use correct fonts (visual regression test)
- [ ] E2E: brand edit form tag input adds and removes tags correctly
- [ ] E2E: brand edit form color picker updates swatch preview
- [ ] CI: add `packages/doc-kit` unit tests to test matrix
- [ ] CI: add E2E brand tests to Playwright parallel test shards
- [ ] CI: add brand-related API integration tests to CI test matrix
- [ ] CI: verify all brand-related migrations apply cleanly to test database
- [ ] CI: add performance regression check for brand_compile job (max 60s)
- [ ] CI: add performance regression check for deck_generate (max 30s per 10 slides)
- [ ] CI: add performance regression check for report_generate (max 20s per 10 components)
- [ ] Create shared test mock: mock LLM gateway that returns deterministic embeddings for tests
- [ ] Create shared test mock: mock CP API that returns fixtures for brand profile, templates
- [ ] Add snapshot tests for brand detail page card sections (UI snapshot testing)

---

## 26. Future / Roadmap (Items 2366–2500)

### 26.1 Brand Latent Space & Style Dimensions

- [ ] Add `style_dimensions jsonb` column to `brand_profiles` table in future migration
- [ ] Define style dimension schema: `serious_playful` (0–100), `luxury_accessible` (0–100), `minimal_expressive` (0–100), `traditional_modern` (0–100)
- [ ] Build UI for style sliders: dual-labeled range inputs (e.g., Serious ← → Playful)
- [ ] Map style dimensions to token overrides: high `luxury_accessible` toward luxury → darker palette, serif fonts
- [ ] Map `minimal_expressive` to spacing density and shadow intensity
- [ ] Store dimension values on brand_profile creation/update
- [ ] Compute style dimension from existing tokens via heuristic or LLM classification
- [ ] Add API endpoint: `GET /v1/brand_profiles/:id/style_dimensions` returning computed values
- [ ] Add API endpoint: `PUT /v1/brand_profiles/:id/style_dimensions` to update slider values
- [ ] Rebuild design_tokens from style dimensions on save (style → tokens pipeline)

### 26.2 Brand Clustering via Embeddings

- [ ] Compute brand identity embedding for each brand_profile (embed identity + tone + visual_style text)
- [ ] Store identity embedding as a special `embedding_type = 'brand_identity_composite'`
- [ ] Implement `clusterBrands()`: fetch all brand identity embeddings, run k-means or DBSCAN
- [ ] Store cluster assignments on brand_profiles: `cluster_id int`
- [ ] Build visualization: 2D t-SNE/UMAP projection of brand embeddings
- [ ] Display in console: brands page shows cluster scatter plot
- [ ] Color-code brands by cluster in list view
- [ ] Allow filtering brands by cluster
- [ ] Add API endpoint: `GET /v1/brand_profiles/clusters` returning cluster assignments
- [ ] Recompute clusters periodically or on brand creation

### 26.3 Brand Suggestion for New Initiatives

- [ ] When creating a new initiative: user enters industry and description
- [ ] Embed initiative description
- [ ] Search brand identity embeddings for most similar brands
- [ ] Return top-3 brand suggestions with similarity scores
- [ ] Display suggestions in initiative create form: "Suggested brands: Brand A (92%), Brand B (85%)"
- [ ] Allow one-click selection from suggestions
- [ ] Add API endpoint: `POST /v1/brand_profiles/suggest` with `{ industry, description }` → returns suggestions
- [ ] Fall back gracefully if no brands exist: show "Create your first brand" prompt
- [ ] Log suggestion acceptance rate for analytics
- [ ] Improve suggestion algorithm over time with feedback data

### 26.4 Figma Sync via Tokens Studio

- [ ] Research Tokens Studio Figma plugin API for push/pull
- [ ] Create `packages/ui/scripts/figma-sync.ts` script
- [ ] Implement `pushTokensToFigma(brandId)`: read brand tokens, format as Tokens Studio JSON, push via API
- [ ] Implement `pullTokensFromFigma(brandId)`: fetch tokens from Figma, update brand_profile design_tokens
- [ ] Add Figma API token configuration (environment variable `FIGMA_API_TOKEN`)
- [ ] Add `figma:push` script to `packages/ui/package.json`
- [ ] Add `figma:pull` script to `packages/ui/package.json`
- [ ] Build conflict resolution: if Figma tokens differ from DB, prompt user to choose
- [ ] Add Figma sync button to console brand detail page
- [ ] Show last sync timestamp on brand detail page
- [ ] Document Figma integration setup in `docs/BRAND_ENGINE.md`
- [ ] Handle Figma API rate limits with exponential backoff
- [ ] Test: push tokens to mock Figma API → verify correct format
- [ ] Test: pull tokens from mock Figma API → verify brand_profile updated

### 26.5 Report → Deck Bridge

- [ ] Create `report-to-deck` transformer: given HTML report, extract key data
- [ ] Auto-summarize report tables into deck-friendly KPI cards
- [ ] Auto-summarize report charts into deck chart slides
- [ ] Map report sections to deck slide sequence
- [ ] Implement as a new job type: `report_to_deck`
- [ ] Input: report artifact ID → output: deck artifact
- [ ] Use LLM to generate slide titles and talking points from report content
- [ ] Preserve brand theme across report → deck transformation
- [ ] Add API endpoint: `POST /v1/artifacts/{id}/convert?to=deck`
- [ ] Add console UI: "Convert to Deck" button on report artifact detail
- [ ] Unit test: table data extracts correctly into KPI values
- [ ] Unit test: chart data maps to deck chart configuration
- [ ] Integration test: generate report → convert to deck → verify slides

### 26.6 Brand Analytics

- [ ] Create `brand_usage_events` table: id, brand_profile_id, event_type, job_type, metadata, created_at
- [ ] Record event on every brand context load (event_type = 'context_load')
- [ ] Record event on every branded artifact generation (event_type = 'artifact_generated')
- [ ] Record event on every branded LLM call (event_type = 'llm_call')
- [ ] Build analytics dashboard in console: `/brands/analytics`
- [ ] Show "Most Used Brands" leaderboard (bar chart)
- [ ] Show "Cost per Brand" breakdown from LLM call costs attributed via x-brand-profile-id
- [ ] Show "Artifacts per Brand" count over time (line chart)
- [ ] Show "Quality per Brand" from any feedback/rating data
- [ ] Add date range filter to analytics dashboard
- [ ] Add brand filter to analytics dashboard
- [ ] Export analytics data as CSV
- [ ] Add API endpoint: `GET /v1/brand_analytics` with filters
- [ ] Unit test: usage event recorded on context load
- [ ] Integration test: generate artifacts → analytics show correct counts

### 26.7 Multi-Tenant Brand Isolation

- [ ] Add `org_id uuid` column to `brand_profiles` table
- [ ] Add FK to organizations table (if exists)
- [ ] Update RLS policies: users can only see brands from their org
- [ ] Update RLS: `brand_profiles_select_policy` adds `WHERE org_id = auth.jwt() ->> 'org_id'`
- [ ] Update RLS for INSERT, UPDATE, DELETE with org_id check
- [ ] Add org_id to brand_embeddings RLS (via brand_profiles join)
- [ ] Add org_id to document_templates RLS (via brand_profiles join)
- [ ] Add org_id to brand_assets RLS (via brand_profiles join)
- [ ] Update CP API to extract org_id from auth token and filter queries
- [ ] Update console: brand list only shows current org's brands
- [ ] Test: org A cannot see org B's brands
- [ ] Test: org A cannot update org B's brand
- [ ] Add org_id index on brand_profiles for query performance

### 26.8 Brand Versioning

- [ ] Add `version int NOT NULL DEFAULT 1` column to `brand_profiles`
- [ ] Create `brand_profile_versions` table: id, brand_profile_id FK, version, snapshot jsonb, created_at, created_by
- [ ] On brand_profile update: insert current state into brand_profile_versions before update
- [ ] Increment version counter on each update
- [ ] Add API endpoint: `GET /v1/brand_profiles/:id/versions` — list all versions
- [ ] Add API endpoint: `GET /v1/brand_profiles/:id/versions/:version` — get specific version snapshot
- [ ] Add API endpoint: `POST /v1/brand_profiles/:id/versions/:version/restore` — restore to a previous version
- [ ] Build console UI: version history timeline on brand detail page
- [ ] Show diff between versions: highlight changed tokens/fields
- [ ] Allow rollback with confirmation dialog
- [ ] Test: update brand 3 times → 3 versions stored
- [ ] Test: restore version 1 → brand matches original snapshot
- [ ] Test: version list ordered by version descending

### 26.9 Advanced Token Features

- [ ] Add dark mode token set: `design_tokens_dark jsonb` on brand_profiles
- [ ] Toggle dark/light mode in console brand detail preview
- [ ] Style Dictionary: generate separate dark mode CSS vars file
- [ ] Add responsive token scales: different spacing/font sizes for mobile/tablet/desktop
- [ ] Add animation token library: entrance, exit, hover, focus animations
- [ ] Add iconography style tokens: icon weight, size, color
- [ ] Generate icon sprite from brand visual style
- [ ] Add color contrast checker: verify brand colors meet WCAG AA/AAA
- [ ] Flag color combinations that fail contrast requirements
- [ ] Suggest accessible alternatives for failing color pairs

### 26.10 AI Brand Generation

- [ ] Create "Generate Brand" wizard: user inputs industry, company name, values
- [ ] Call LLM to generate identity, tone, copy_style, visual_style from inputs
- [ ] Call LLM to generate color palette from brand archetype and industry
- [ ] Call LLM to suggest typography pairing (heading + body fonts)
- [ ] Preview generated brand in real-time
- [ ] Allow user to iterate: "Make it more playful", "Darker palette", etc.
- [ ] Save generated brand as new brand_profile
- [ ] Add "AI Generate" button on /brands/new page
- [ ] Add API endpoint: `POST /v1/brand_profiles/generate` with `{ name, industry, description, preferences }`
- [ ] Test: generate brand → brand_profile has non-empty identity, tone, design_tokens
- [ ] Test: generated colors form a coherent palette (contrast ratios, hue harmony)

### 26.11 Brand Compliance & Guardrails

- [ ] Create brand compliance rules table: `brand_compliance_rules (id, brand_profile_id, rule_type, rule_config, severity)`
- [ ] Rule types: `color_usage`, `font_usage`, `copy_tone`, `banned_content`, `required_disclaimer`
- [ ] Before artifact generation: load compliance rules for brand
- [ ] After artifact generation: run compliance checks
- [ ] Flag violations: wrong colors, off-brand tone, banned words in output
- [ ] Return violations in artifact metadata
- [ ] Show compliance badge on artifact detail: "Compliant" / "X violations"
- [ ] Show violation details with severity (error, warning, info)
- [ ] Add console UI for managing compliance rules per brand
- [ ] Test: artifact with banned word → violation flagged
- [ ] Test: artifact with correct brand colors → no violations

### 26.12 Brand Performance Benchmarking

- [ ] Track artifact generation time per brand (start → complete)
- [ ] Track LLM token usage per brand across all job types
- [ ] Track artifact quality scores per brand (if rating system exists)
- [ ] Build benchmarking report: compare brands on speed, cost, quality
- [ ] Identify brands with unusually high costs (complex tokens, many embeddings)
- [ ] Suggest optimizations: "Brand X has 500 embeddings but only uses 10 — prune unused"
- [ ] Add benchmark data to brand analytics dashboard
- [ ] Export benchmarking data for external analysis
- [ ] Test: benchmarking correctly aggregates multi-job metrics per brand


---

*End of checklist — 2,500 items total.*
