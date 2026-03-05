-- Console/API required tables: agent_memory, webhook_outbox (separate file), mcp_server_config,
-- llm_budgets, routing_policies, brand_themes, brand_profiles, document_templates, document_components.
-- Run after core schema (001/002) so initiatives, runs, plan_nodes exist. All CREATE TABLE IF NOT EXISTS.

BEGIN;

-- Helper for updated_at (idempotent)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========== brand_themes (no deps) ==========
CREATE TABLE IF NOT EXISTS brand_themes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  token_overrides   jsonb       NOT NULL DEFAULT '{}',
  component_variants jsonb       DEFAULT '{}',
  mode              text        NOT NULL DEFAULT 'light' CHECK (mode IN ('light', 'dark')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_themes_mode ON brand_themes (mode);
CREATE INDEX IF NOT EXISTS idx_brand_themes_name ON brand_themes (name);

-- ========== brand_profiles (dep: brand_themes) ==========
CREATE TABLE IF NOT EXISTS brand_profiles (
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
CREATE INDEX IF NOT EXISTS idx_brand_profiles_name ON brand_profiles (name);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_slug ON brand_profiles (slug);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_status ON brand_profiles (status);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_brand_theme_id ON brand_profiles (brand_theme_id);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_created_at ON brand_profiles (created_at DESC);

-- ========== document_templates (dep: brand_profiles) ==========
CREATE TABLE IF NOT EXISTS document_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id   uuid REFERENCES brand_profiles(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_document_templates_brand_profile_id ON document_templates (brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_template_type ON document_templates (template_type);
CREATE INDEX IF NOT EXISTS idx_document_templates_status ON document_templates (status);

-- ========== document_components (dep: document_templates) ==========
CREATE TABLE IF NOT EXISTS document_components (
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
CREATE INDEX IF NOT EXISTS idx_document_components_template_id ON document_components (template_id);
CREATE INDEX IF NOT EXISTS idx_document_components_component_type ON document_components (component_type);
CREATE INDEX IF NOT EXISTS idx_document_components_template_position ON document_components (template_id, position);

-- ========== agent_memory (dep: runs, initiatives from core) ==========
CREATE TABLE IF NOT EXISTS agent_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid REFERENCES runs(id),
  initiative_id uuid REFERENCES initiatives(id),
  scope         text NOT NULL,
  key           text NOT NULL,
  value         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_initiative_scope ON agent_memory (initiative_id, scope) WHERE initiative_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memory_run ON agent_memory (run_id) WHERE run_id IS NOT NULL;

-- ========== routing_policies, llm_budgets, mcp_server_config (no deps) ==========
CREATE TABLE IF NOT EXISTS routing_policies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      text        NOT NULL,
  model_tier    text        NOT NULL DEFAULT 'auto/chat',
  config_json   jsonb,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_type)
);
CREATE INDEX IF NOT EXISTS idx_routing_policies_active ON routing_policies (active, job_type);

CREATE TABLE IF NOT EXISTS llm_budgets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type      text        NOT NULL CHECK (scope_type IN ('job_type', 'initiative')),
  scope_value     text        NOT NULL,
  budget_tokens   bigint,
  budget_dollars  numeric(12, 4),
  period          text        NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly')),
  current_usage   bigint      NOT NULL DEFAULT 0,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_value)
);
CREATE INDEX IF NOT EXISTS idx_llm_budgets_scope ON llm_budgets (scope_type, scope_value);

CREATE TABLE IF NOT EXISTS mcp_server_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,
  server_type   text        NOT NULL CHECK (server_type IN ('http', 'stdio')),
  url_or_cmd    text        NOT NULL,
  args_json     jsonb,
  env_json      jsonb,
  auth_header   text,
  capabilities  text[],
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_server_config_active ON mcp_server_config (active);

COMMIT;
