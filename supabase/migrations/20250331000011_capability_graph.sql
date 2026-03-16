-- Capability graph: operators, artifact_types, capabilities, and edges for resolution.
-- Used to answer "which operator can produce artifact type X?" (deterministic ranking).

BEGIN;

-- Nodes
CREATE TABLE IF NOT EXISTS capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_capabilities_key ON capabilities(key);

CREATE TABLE IF NOT EXISTS artifact_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifact_types_key ON artifact_types(key);

CREATE TABLE IF NOT EXISTS operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  priority int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operators_key ON operators(key);
CREATE INDEX IF NOT EXISTS idx_operators_priority ON operators(priority) WHERE priority IS NOT NULL;

-- Edges: operator implements capability; operator consumes/produces artifact_type
CREATE TABLE IF NOT EXISTS operator_implements_capability (
  operator_id uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (operator_id, capability_id)
);
CREATE INDEX IF NOT EXISTS idx_oic_capability ON operator_implements_capability(capability_id);

CREATE TABLE IF NOT EXISTS operator_consumes_artifact_type (
  operator_id uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  artifact_type_id uuid NOT NULL REFERENCES artifact_types(id) ON DELETE CASCADE,
  PRIMARY KEY (operator_id, artifact_type_id)
);
CREATE INDEX IF NOT EXISTS idx_ocat_artifact_type ON operator_consumes_artifact_type(artifact_type_id);

CREATE TABLE IF NOT EXISTS operator_produces_artifact_type (
  operator_id uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  artifact_type_id uuid NOT NULL REFERENCES artifact_types(id) ON DELETE CASCADE,
  PRIMARY KEY (operator_id, artifact_type_id)
);
CREATE INDEX IF NOT EXISTS idx_opat_artifact_type ON operator_produces_artifact_type(artifact_type_id);
CREATE INDEX IF NOT EXISTS idx_opat_operator ON operator_produces_artifact_type(operator_id);

-- Seed: artifact types (keys used by handlers and plan templates)
INSERT INTO artifact_types (key) VALUES
  ('copy'),
  ('email_template'),
  ('landing_page'),
  ('prd_doc'),
  ('design'),
  ('deck'),
  ('report'),
  ('ui_scaffold'),
  ('tokens_json'),
  ('css_vars'),
  ('swe_agent_patch'),
  ('swe_agent_trajectory'),
  ('seo_url_inventory'),
  ('seo_url_match_report'),
  ('seo_redirect_verification'),
  ('seo_content_parity_report'),
  ('seo_technical_diff_report'),
  ('seo_gsc_snapshot'),
  ('seo_ga4_snapshot'),
  ('seo_internal_link_graph'),
  ('seo_ranking_risk_report'),
  ('seo_audit_report'),
  ('quality_gate_result'),
  ('optimizer_result')
ON CONFLICT (key) DO NOTHING;

-- Seed: capabilities (optional grouping)
INSERT INTO capabilities (key) VALUES
  ('copy_generation'),
  ('email_generation'),
  ('landing_page_generation'),
  ('design_generation'),
  ('prd_generation'),
  ('deck_generation'),
  ('report_generation')
ON CONFLICT (key) DO NOTHING;

-- Seed: operators (job_type = key). priority: lower = higher priority; null = lowest.
INSERT INTO operators (key, priority) VALUES
  ('copy_generate', 10),
  ('email_generate_mjml', 10),
  ('landing_page_generate', 10),
  ('design', 10),
  ('prd', 10),
  ('deck_generate', 20),
  ('report_generate', 20),
  ('brand_compile', 20),
  ('ui_scaffold', 20),
  ('quality_gate', 30),
  ('slop_guard', 30),
  ('optimizer', 30),
  ('seo_source_inventory', 10),
  ('seo_target_inventory', 10),
  ('seo_url_matcher', 20),
  ('seo_redirect_verifier', 20),
  ('seo_content_parity', 20),
  ('seo_technical_diff', 20),
  ('seo_internal_graph_builder', 20),
  ('seo_internal_graph_diff', 20),
  ('seo_gsc_snapshot', 20),
  ('seo_ga4_snapshot', 20),
  ('seo_risk_scorer', 20),
  ('seo_audit_report', 20),
  ('swe_agent', 10)
ON CONFLICT (key) DO NOTHING;

-- operator_produces_artifact_type
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'copy_generate' AND at.key = 'copy'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'email_generate_mjml' AND at.key = 'email_template'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'landing_page_generate' AND at.key = 'landing_page'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'prd' AND at.key = 'prd_doc'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'design' AND at.key = 'design'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'deck_generate' AND at.key = 'deck'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'report_generate' AND at.key = 'report'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'ui_scaffold' AND at.key = 'ui_scaffold'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'brand_compile' AND at.key = 'tokens_json'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'brand_compile' AND at.key = 'css_vars'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'quality_gate' AND at.key = 'quality_gate_result'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'optimizer' AND at.key = 'optimizer_result'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'swe_agent' AND at.key = 'swe_agent_patch'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'swe_agent' AND at.key = 'swe_agent_trajectory'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_source_inventory' AND at.key = 'seo_url_inventory'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_target_inventory' AND at.key = 'seo_url_inventory'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_url_matcher' AND at.key = 'seo_url_match_report'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_redirect_verifier' AND at.key = 'seo_redirect_verification'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_content_parity' AND at.key = 'seo_content_parity_report'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_technical_diff' AND at.key = 'seo_technical_diff_report'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_internal_graph_builder' AND at.key = 'seo_internal_link_graph'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_internal_graph_diff' AND at.key = 'seo_internal_link_graph'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_gsc_snapshot' AND at.key = 'seo_gsc_snapshot'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_ga4_snapshot' AND at.key = 'seo_ga4_snapshot'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_risk_scorer' AND at.key = 'seo_ranking_risk_report'
ON CONFLICT DO NOTHING;
INSERT INTO operator_produces_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'seo_audit_report' AND at.key = 'seo_audit_report'
ON CONFLICT DO NOTHING;

-- operator_consumes_artifact_type (landing_page_generate consumes copy; design consumes prd_doc)
INSERT INTO operator_consumes_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'landing_page_generate' AND at.key = 'copy'
ON CONFLICT DO NOTHING;
INSERT INTO operator_consumes_artifact_type (operator_id, artifact_type_id)
SELECT o.id, at.id FROM operators o, artifact_types at
WHERE o.key = 'design' AND at.key = 'prd_doc'
ON CONFLICT DO NOTHING;

COMMIT;
