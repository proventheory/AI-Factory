-- Graph OS: SQL helper views (0020) for projection mappings.
-- Joins to kinds and projections so the app does not join in code every time.

BEGIN;

-- Expanded node mappings: projection key, node kind key, all node mapping fields
CREATE OR REPLACE VIEW v_graph_projection_node_mappings_expanded AS
SELECT
  p.key AS projection_key,
  nk.key AS node_kind_key,
  m.id,
  m.projection_id,
  m.node_kind_id,
  m.source_table,
  m.source_where_sql,
  m.source_order_sql,
  m.backing_id_column,
  m.title_column,
  m.slug_column,
  m.state_column,
  m.title_template,
  m.summary_template,
  m.spec_columns_json,
  m.desired_columns_json,
  m.observed_columns_json,
  m.passthrough_metadata_json,
  m.is_enabled,
  m.priority,
  m.created_at
FROM graph_projection_node_mappings m
JOIN graph_projections p ON p.id = m.projection_id
JOIN graph_node_kinds nk ON nk.id = m.node_kind_id
WHERE m.is_enabled = true AND p.is_active = true;

-- Expanded edge mappings: projection key, edge kind key, from/to node kind keys, all edge mapping fields
CREATE OR REPLACE VIEW v_graph_projection_edge_mappings_expanded AS
SELECT
  p.key AS projection_key,
  ek.key AS edge_kind_key,
  fnk.key AS from_node_kind_key,
  tnk.key AS to_node_kind_key,
  m.id,
  m.projection_id,
  m.edge_kind_id,
  m.source_table,
  m.from_source_table,
  m.from_backing_id_column,
  m.from_node_kind_id,
  m.to_source_table,
  m.to_backing_id_column,
  m.to_node_kind_id,
  m.source_from_ref_column,
  m.source_to_ref_column,
  m.metadata_columns_json,
  m.is_enabled,
  m.priority,
  m.created_at
FROM graph_projection_edge_mappings m
JOIN graph_projections p ON p.id = m.projection_id
JOIN graph_edge_kinds ek ON ek.id = m.edge_kind_id
JOIN graph_node_kinds fnk ON fnk.id = m.from_node_kind_id
JOIN graph_node_kinds tnk ON tnk.id = m.to_node_kind_id
WHERE m.is_enabled = true AND p.is_active = true;

COMMIT;
