-- Graph OS: canonical node/edge registry (Option B = platform_graph_*).
-- Execution layer remains graph_runs / graph_nodes / graph_edges (Phase 6).

BEGIN;

-- platform_graph_nodes: canonical node identity + state (not full payload)
CREATE TABLE IF NOT EXISTS platform_graph_nodes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id      uuid NOT NULL REFERENCES graph_node_kinds(id) ON DELETE RESTRICT,
  backing_table text,
  backing_id   text,
  state        text NOT NULL DEFAULT 'declared',
  title        text,
  slug         text,
  summary      text,
  spec_json    jsonb,
  observed_json jsonb,
  desired_json  jsonb,
  owner_type   text,
  owner_id     text,
  priority     int,
  created_by   text,
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_graph_nodes_backing
  ON platform_graph_nodes (kind_id, backing_table, backing_id)
  WHERE backing_table IS NOT NULL AND backing_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_platform_graph_nodes_kind ON platform_graph_nodes(kind_id);
CREATE INDEX IF NOT EXISTS idx_platform_graph_nodes_state ON platform_graph_nodes(state) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_platform_graph_nodes_updated ON platform_graph_nodes(updated_at DESC);

-- platform_graph_edges: canonical relationships
CREATE TABLE IF NOT EXISTS platform_graph_edges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id   uuid NOT NULL REFERENCES platform_graph_nodes(id) ON DELETE CASCADE,
  edge_kind_id   uuid NOT NULL REFERENCES graph_edge_kinds(id) ON DELETE RESTRICT,
  to_node_id     uuid NOT NULL REFERENCES platform_graph_nodes(id) ON DELETE CASCADE,
  state         text DEFAULT 'active',
  metadata_json jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,
  UNIQUE (from_node_id, edge_kind_id, to_node_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_graph_edges_from ON platform_graph_edges(from_node_id, edge_kind_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_platform_graph_edges_to ON platform_graph_edges(to_node_id, edge_kind_id) WHERE archived_at IS NULL;

COMMIT;
