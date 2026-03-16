-- Graph OS: node and edge kind registry (Phase 1).
-- See docs/GRAPH_OS_FOUNDATION.md and .cursor/plans/ai_factory_os_traversable_graph_plan.md

BEGIN;

-- graph_node_kinds: type system for canonical nodes
CREATE TABLE IF NOT EXISTS graph_node_kinds (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text UNIQUE NOT NULL,
  display_name text,
  description text,
  category   text CHECK (category IN ('planning', 'artifact', 'runtime', 'deployment', 'policy')),
  schema_json jsonb,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_node_kinds_key ON graph_node_kinds(key);
CREATE INDEX IF NOT EXISTS idx_graph_node_kinds_category ON graph_node_kinds(category) WHERE category IS NOT NULL;

-- graph_edge_kinds: type system for canonical edges
CREATE TABLE IF NOT EXISTS graph_edge_kinds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text UNIQUE NOT NULL,
  display_name text,
  description  text,
  reverse_label text,
  is_dag_edge  boolean NOT NULL DEFAULT true,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_edge_kinds_key ON graph_edge_kinds(key);

-- Seed node kinds (minimal set for projections)
INSERT INTO graph_node_kinds (key, display_name, category) VALUES
  ('initiative', 'Initiative', 'planning'),
  ('plan', 'Plan', 'planning'),
  ('plan_node', 'Plan Node', 'planning'),
  ('artifact', 'Artifact', 'artifact'),
  ('run', 'Run', 'runtime'),
  ('job_run', 'Job Run', 'runtime'),
  ('release', 'Release', 'deployment'),
  ('deploy_target', 'Deploy Target', 'deployment'),
  ('environment', 'Environment', 'deployment'),
  ('service', 'Service', 'deployment'),
  ('brand_profile', 'Brand Profile', 'artifact'),
  ('operator', 'Operator', 'runtime'),
  ('saved_flow', 'Saved Flow', 'runtime'),
  ('policy', 'Policy', 'policy'),
  ('artifact_type', 'Artifact Type', 'artifact')
ON CONFLICT (key) DO NOTHING;

-- Seed edge kinds
INSERT INTO graph_edge_kinds (key, display_name, reverse_label, is_dag_edge) VALUES
  ('depends_on', 'Depends On', 'dependency_of', true),
  ('blocked_by', 'Blocked By', 'blocks', true),
  ('produces', 'Produces', 'produced_by', true),
  ('consumes_context_from', 'Consumes Context From', 'context_for', true),
  ('derived_from', 'Derived From', 'derived_into', true),
  ('deploys_to', 'Deploys To', 'deployed_from', true),
  ('owned_by', 'Owned By', 'owns', false),
  ('validates', 'Validates', 'validated_by', true),
  ('applies_to', 'Applies To', 'applied_by', false),
  ('scoped_by', 'Scoped By', 'scope_for', false)
ON CONFLICT (key) DO NOTHING;

COMMIT;
