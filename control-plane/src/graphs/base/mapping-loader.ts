/**
 * Load projection metadata and mappings from DB (views from migration 0020).
 */

import type { PoolClient } from "pg";
import type {
  GraphProjectionKey,
  GraphProjectionDefinition,
  GraphProjectionRecord,
  GraphProjectionNodeMapping,
  GraphProjectionEdgeMapping,
  GraphProjectionQueryPreset,
} from "./types.js";

const VALID_PROJECTION_KEYS: GraphProjectionKey[] = [
  "dependency",
  "topology",
  "strategy",
  "governance",
  "catalog",
];

export function isValidProjectionKey(key: string): key is GraphProjectionKey {
  return (VALID_PROJECTION_KEYS as string[]).includes(key);
}

export async function loadProjectionDefinition(
  client: PoolClient,
  projectionKey: GraphProjectionKey
): Promise<GraphProjectionDefinition | null> {
  const [projRows, nodeRows, edgeRows, presetRows] = await Promise.all([
    client.query(
      "SELECT id, key, display_name, description, is_active FROM graph_projections WHERE key = $1 AND is_active = true",
      [projectionKey]
    ),
    client.query(
      "SELECT * FROM v_graph_projection_node_mappings_expanded WHERE projection_key = $1 ORDER BY priority ASC",
      [projectionKey]
    ),
    client.query(
      "SELECT * FROM v_graph_projection_edge_mappings_expanded WHERE projection_key = $1 ORDER BY priority ASC",
      [projectionKey]
    ),
    client.query(
      "SELECT id, projection_id, key, display_name, description, query_shape_json, is_enabled FROM graph_projection_query_presets WHERE projection_id = (SELECT id FROM graph_projections WHERE key = $1) AND is_enabled = true",
      [projectionKey]
    ),
  ]);

  const proj = projRows.rows[0];
  if (!proj) return null;

  const projection: GraphProjectionRecord = {
    id: proj.id,
    key: proj.key as GraphProjectionKey,
    display_name: proj.display_name ?? null,
    description: proj.description ?? null,
    is_active: proj.is_active ?? true,
  };

  const nodeMappings: GraphProjectionNodeMapping[] = nodeRows.rows.map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ""),
    projection_id: String(r.projection_id ?? ""),
    projection_key: String(r.projection_key ?? projectionKey),
    node_kind_key: String(r.node_kind_key ?? ""),
    source_table: String(r.source_table ?? ""),
    source_where_sql: r.source_where_sql != null ? String(r.source_where_sql) : null,
    source_order_sql: r.source_order_sql != null ? String(r.source_order_sql) : null,
    backing_id_column: String(r.backing_id_column ?? "id"),
    title_column: r.title_column != null ? String(r.title_column) : null,
    slug_column: r.slug_column != null ? String(r.slug_column) : null,
    state_column: r.state_column != null ? String(r.state_column) : null,
    title_template: r.title_template != null ? String(r.title_template) : null,
    summary_template: r.summary_template != null ? String(r.summary_template) : null,
    spec_columns_json: (r.spec_columns_json as Record<string, unknown> | null) ?? null,
    desired_columns_json: (r.desired_columns_json as Record<string, unknown> | null) ?? null,
    observed_columns_json: (r.observed_columns_json as Record<string, unknown> | null) ?? null,
    passthrough_metadata_json: (r.passthrough_metadata_json as Record<string, unknown> | null) ?? null,
    is_enabled: Boolean(r.is_enabled ?? true),
    priority: Number(r.priority) ?? 0,
  }));

  const edgeMappings: GraphProjectionEdgeMapping[] = edgeRows.rows.map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ""),
    projection_id: String(r.projection_id ?? ""),
    projection_key: String(r.projection_key ?? projectionKey),
    edge_kind_key: String(r.edge_kind_key ?? ""),
    from_node_kind_key: String(r.from_node_kind_key ?? ""),
    to_node_kind_key: String(r.to_node_kind_key ?? ""),
    source_table: String(r.source_table ?? ""),
    from_source_table: String(r.from_source_table ?? ""),
    from_backing_id_column: String(r.from_backing_id_column ?? ""),
    to_source_table: String(r.to_source_table ?? ""),
    to_backing_id_column: String(r.to_backing_id_column ?? ""),
    source_from_ref_column: String(r.source_from_ref_column ?? ""),
    source_to_ref_column: String(r.source_to_ref_column ?? ""),
    metadata_columns_json: (r.metadata_columns_json as Record<string, unknown> | null) ?? null,
    is_enabled: Boolean(r.is_enabled ?? true),
    priority: Number(r.priority) ?? 0,
  }));

  const presets: GraphProjectionQueryPreset[] = presetRows.rows.map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ""),
    projection_id: String(r.projection_id ?? ""),
    key: String(r.key ?? ""),
    display_name: r.display_name != null ? String(r.display_name) : null,
    description: r.description != null ? String(r.description) : null,
    query_shape_json: (r.query_shape_json as Record<string, unknown> | null) ?? null,
    is_enabled: Boolean(r.is_enabled ?? true),
  }));

  return { projection, nodeMappings, edgeMappings, presets };
}
