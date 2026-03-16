-- Graph OS: projection mapping layer (0019).
-- graph_projections, graph_projection_node_mappings, graph_projection_edge_mappings, graph_projection_query_presets + seeds.

BEGIN;

-- graph_projections: registry of the five graph views
CREATE TABLE IF NOT EXISTS graph_projections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text UNIQUE NOT NULL,
  display_name text,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_projections_key ON graph_projections(key);

-- graph_projection_node_mappings: source table → node kind per projection
CREATE TABLE IF NOT EXISTS graph_projection_node_mappings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projection_id         uuid NOT NULL REFERENCES graph_projections(id) ON DELETE CASCADE,
  node_kind_id          uuid NOT NULL REFERENCES graph_node_kinds(id) ON DELETE RESTRICT,
  source_table          text NOT NULL,
  source_where_sql      text,
  source_order_sql      text,
  backing_id_column     text NOT NULL,
  title_column          text,
  slug_column           text,
  state_column          text,
  title_template        text,
  summary_template      text,
  spec_columns_json     jsonb,
  desired_columns_json  jsonb,
  observed_columns_json jsonb,
  passthrough_metadata_json jsonb,
  is_enabled            boolean NOT NULL DEFAULT true,
  priority              int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gp_node_mappings_projection ON graph_projection_node_mappings(projection_id);
CREATE INDEX IF NOT EXISTS idx_gp_node_mappings_kind ON graph_projection_node_mappings(node_kind_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gp_node_mappings_unique ON graph_projection_node_mappings(projection_id, node_kind_id, source_table);

-- graph_projection_edge_mappings: relationship table → edge kind per projection
CREATE TABLE IF NOT EXISTS graph_projection_edge_mappings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projection_id         uuid NOT NULL REFERENCES graph_projections(id) ON DELETE CASCADE,
  edge_kind_id          uuid NOT NULL REFERENCES graph_edge_kinds(id) ON DELETE RESTRICT,
  source_table           text NOT NULL,
  from_source_table      text NOT NULL,
  from_backing_id_column text NOT NULL,
  from_node_kind_id      uuid NOT NULL REFERENCES graph_node_kinds(id) ON DELETE RESTRICT,
  to_source_table        text NOT NULL,
  to_backing_id_column   text NOT NULL,
  to_node_kind_id        uuid NOT NULL REFERENCES graph_node_kinds(id) ON DELETE RESTRICT,
  source_from_ref_column text NOT NULL,
  source_to_ref_column   text NOT NULL,
  metadata_columns_json  jsonb,
  is_enabled             boolean NOT NULL DEFAULT true,
  priority               int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gp_edge_mappings_projection ON graph_projection_edge_mappings(projection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gp_edge_mappings_unique ON graph_projection_edge_mappings(projection_id, edge_kind_id, source_table, source_from_ref_column, source_to_ref_column);

-- graph_projection_query_presets: named query shapes per projection
CREATE TABLE IF NOT EXISTS graph_projection_query_presets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projection_id   uuid NOT NULL REFERENCES graph_projections(id) ON DELETE CASCADE,
  key             text NOT NULL,
  display_name    text,
  description     text,
  query_shape_json jsonb,
  is_enabled      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projection_id, key)
);
CREATE INDEX IF NOT EXISTS idx_gp_query_presets_projection ON graph_projection_query_presets(projection_id);

-- Seed five projections
INSERT INTO graph_projections (key, display_name, description) VALUES
  ('dependency', 'Dependency', 'Artifact and run dependency graph'),
  ('topology', 'Topology', 'Environments and deployment targets'),
  ('strategy', 'Strategy', 'Plans, runs, and blocked tasks'),
  ('governance', 'Governance', 'Policies and approvals'),
  ('catalog', 'Catalog', 'Operators, flows, and templates')
ON CONFLICT (key) DO NOTHING;

-- Strategy projection: node mappings (plans, plan_nodes, runs)
INSERT INTO graph_projection_node_mappings (projection_id, node_kind_id, source_table, backing_id_column, title_column, state_column, priority)
SELECT p.id, nk.id, 'initiatives', 'id', 'title', NULL, 10
FROM graph_projections p, graph_node_kinds nk
WHERE p.key = 'strategy' AND nk.key = 'initiative'
ON CONFLICT (projection_id, node_kind_id, source_table) DO NOTHING;

INSERT INTO graph_projection_node_mappings (projection_id, node_kind_id, source_table, backing_id_column, title_column, state_column, priority)
SELECT p.id, nk.id, 'plans', 'id', NULL, NULL, 20
FROM graph_projections p, graph_node_kinds nk
WHERE p.key = 'strategy' AND nk.key = 'plan'
ON CONFLICT (projection_id, node_kind_id, source_table) DO NOTHING;

INSERT INTO graph_projection_node_mappings (projection_id, node_kind_id, source_table, backing_id_column, title_column, state_column, priority)
SELECT p.id, nk.id, 'plan_nodes', 'id', 'node_key', NULL, 30
FROM graph_projections p, graph_node_kinds nk
WHERE p.key = 'strategy' AND nk.key = 'plan_node'
ON CONFLICT (projection_id, node_kind_id, source_table) DO NOTHING;

INSERT INTO graph_projection_node_mappings (projection_id, node_kind_id, source_table, backing_id_column, title_column, state_column, priority)
SELECT p.id, nk.id, 'runs', 'id', NULL, 'status', 40
FROM graph_projections p, graph_node_kinds nk
WHERE p.key = 'strategy' AND nk.key = 'run'
ON CONFLICT (projection_id, node_kind_id, source_table) DO NOTHING;

-- Strategy: plan_edges → depends_on
INSERT INTO graph_projection_edge_mappings (
  projection_id, edge_kind_id, source_table,
  from_source_table, from_backing_id_column, from_node_kind_id,
  to_source_table, to_backing_id_column, to_node_kind_id,
  source_from_ref_column, source_to_ref_column, priority
)
SELECT p.id, ek.id, 'plan_edges',
  'plan_nodes', 'from_node_id', fnk.id,
  'plan_nodes', 'to_node_id', tnk.id,
  'from_node_id', 'to_node_id', 10
FROM graph_projections p
JOIN graph_edge_kinds ek ON ek.key = 'depends_on'
JOIN graph_node_kinds fnk ON fnk.key = 'plan_node'
JOIN graph_node_kinds tnk ON tnk.key = 'plan_node'
WHERE p.key = 'strategy'
ON CONFLICT (projection_id, edge_kind_id, source_table, source_from_ref_column, source_to_ref_column) DO NOTHING;

-- Strategy query presets
INSERT INTO graph_projection_query_presets (projection_id, key, display_name, query_shape_json)
SELECT id, 'blocked_tasks', 'Blocked tasks', '{"blocked_only": true}'::jsonb FROM graph_projections WHERE key = 'strategy';

INSERT INTO graph_projection_query_presets (projection_id, key, display_name, query_shape_json)
SELECT id, 'active_runs', 'Active runs', '{"running_only": true}'::jsonb FROM graph_projections WHERE key = 'strategy';

-- Dependency projection: artifacts, runs
INSERT INTO graph_projection_node_mappings (projection_id, node_kind_id, source_table, backing_id_column, title_column, state_column, priority)
SELECT p.id, nk.id, 'artifacts', 'id', NULL, NULL, 10
FROM graph_projections p, graph_node_kinds nk
WHERE p.key = 'dependency' AND nk.key = 'artifact';

INSERT INTO graph_projection_node_mappings (projection_id, node_kind_id, source_table, backing_id_column, title_column, state_column, priority)
SELECT p.id, nk.id, 'runs', 'id', NULL, 'status', 20
FROM graph_projections p, graph_node_kinds nk
WHERE p.key = 'dependency' AND nk.key = 'run';

-- Dependency: artifact_consumption → consumes_context_from (artifact -> job_run/plan_node; we map to run for simplicity)
INSERT INTO graph_projection_edge_mappings (
  projection_id, edge_kind_id, source_table,
  from_source_table, from_backing_id_column, from_node_kind_id,
  to_source_table, to_backing_id_column, to_node_kind_id,
  source_from_ref_column, source_to_ref_column, priority
)
SELECT p.id, ek.id, 'artifact_consumption',
  'artifacts', 'artifact_id', fnk.id,
  'runs', 'run_id', tnk.id,
  'artifact_id', 'run_id', 10
FROM graph_projections p
JOIN graph_edge_kinds ek ON ek.key = 'consumes_context_from'
JOIN graph_node_kinds fnk ON fnk.key = 'artifact'
JOIN graph_node_kinds tnk ON tnk.key = 'run'
WHERE p.key = 'dependency'
ON CONFLICT (projection_id, edge_kind_id, source_table, source_from_ref_column, source_to_ref_column) DO NOTHING;

INSERT INTO graph_projection_query_presets (projection_id, key, display_name, query_shape_json)
SELECT id, 'blast_radius', 'Blast radius', '{"if_fails": true}'::jsonb FROM graph_projections WHERE key = 'dependency';

INSERT INTO graph_projection_query_presets (projection_id, key, display_name, query_shape_json)
SELECT id, 'upstream_dependencies', 'Upstream dependencies', '{"node_id": true}'::jsonb FROM graph_projections WHERE key = 'dependency';

-- Catalog: operators (from capability graph), brand_profiles if present
INSERT INTO graph_projection_node_mappings (projection_id, node_kind_id, source_table, backing_id_column, title_column, priority)
SELECT p.id, nk.id, 'operators', 'id', 'key', 10
FROM graph_projections p, graph_node_kinds nk
WHERE p.key = 'catalog' AND nk.key = 'operator';

INSERT INTO graph_projection_query_presets (projection_id, key, display_name, query_shape_json)
SELECT id, 'operator_inventory', 'Operator inventory', '{}'::jsonb FROM graph_projections WHERE key = 'catalog';

INSERT INTO graph_projection_query_presets (projection_id, key, display_name, query_shape_json)
SELECT id, 'flow_inventory', 'Flow inventory', '{}'::jsonb FROM graph_projections WHERE key = 'catalog';

-- Topology & Governance: summary presets only (thin first)
INSERT INTO graph_projection_query_presets (projection_id, key, display_name, query_shape_json)
SELECT id, 'deployment_map', 'Deployment map', '{}'::jsonb FROM graph_projections WHERE key = 'topology';

INSERT INTO graph_projection_query_presets (projection_id, key, display_name, query_shape_json)
SELECT id, 'summary', 'Summary', '{}'::jsonb FROM graph_projections WHERE key = 'governance';

COMMIT;
