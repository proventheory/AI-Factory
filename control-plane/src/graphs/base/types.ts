/**
 * Graph OS canonical types (Phase 1).
 * See docs/GRAPH_OS_FOUNDATION.md and .cursor/plans/ai_factory_os_traversable_graph_plan.md
 */

export type GraphProjectionKey = "dependency" | "topology" | "strategy" | "governance" | "catalog";

export interface GraphNodeEnvelope {
  node_id: string;
  node_kind: string;
  backing_table: string | null;
  backing_id: string | null;
  projection: GraphProjectionKey;
  label: string;
  slug: string | null;
  state: string;
  summary: string | null;
  spec: Record<string, unknown> | null;
  desired: Record<string, unknown> | null;
  observed: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  synthetic?: boolean;
  synthetic_key?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface GraphEdgeEnvelope {
  edge_id: string;
  edge_kind: string;
  projection: GraphProjectionKey;
  from_node_id: string;
  to_node_id: string;
  metadata: Record<string, unknown>;
  synthetic?: boolean;
}

export interface GraphProjectionSummary {
  node_count: number;
  edge_count: number;
  node_counts_by_kind: Record<string, number>;
  edge_counts_by_kind: Record<string, number>;
}

export type GraphDiagnosticLevel = "info" | "warning" | "error";

export interface GraphDiagnostic {
  level: GraphDiagnosticLevel;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GraphProjectionResult {
  graph: GraphProjectionKey;
  summary?: GraphProjectionSummary;
  nodes: GraphNodeEnvelope[];
  edges: GraphEdgeEnvelope[];
  diagnostics?: GraphDiagnostic[];
}

export interface GraphQueryRequest {
  graph: GraphProjectionKey;
  preset?: string;
  query?: {
    blocked_only?: boolean;
    running_only?: boolean;
    node_id?: string;
    depth?: number;
    if_fails?: boolean;
    [k: string]: unknown;
  };
}

export interface GraphQueryResponse {
  graph: GraphProjectionKey;
  preset?: string;
  answer?: unknown;
  nodes?: GraphNodeEnvelope[];
  edges?: GraphEdgeEnvelope[];
  summary?: GraphProjectionSummary;
  diagnostics?: GraphDiagnostic[];
}

/** Canonical node ID: backed nodes */
export function canonicalNodeIdBacked(nodeKind: string, backingTable: string, backingId: string): string {
  return `g:${nodeKind}:${backingTable}:${backingId}`;
}

/** Canonical node ID: synthetic nodes */
export function canonicalNodeIdSynthetic(projection: GraphProjectionKey, nodeKind: string, syntheticKey: string): string {
  return `s:${projection}:${nodeKind}:${syntheticKey}`;
}

/** Edge ID */
export function canonicalEdgeId(edgeKind: string, fromNodeId: string, toNodeId: string): string {
  return `e:${edgeKind}:${fromNodeId}->${toNodeId}`;
}

/** DB row types for mapping loader */
export interface GraphProjectionRecord {
  id: string;
  key: GraphProjectionKey;
  display_name: string | null;
  description: string | null;
  is_active: boolean;
}

export interface GraphProjectionNodeMapping {
  id: string;
  projection_id: string;
  projection_key: string;
  node_kind_key: string;
  source_table: string;
  source_where_sql: string | null;
  source_order_sql: string | null;
  backing_id_column: string;
  title_column: string | null;
  slug_column: string | null;
  state_column: string | null;
  title_template: string | null;
  summary_template: string | null;
  spec_columns_json: Record<string, unknown> | null;
  desired_columns_json: Record<string, unknown> | null;
  observed_columns_json: Record<string, unknown> | null;
  passthrough_metadata_json: Record<string, unknown> | null;
  is_enabled: boolean;
  priority: number;
}

export interface GraphProjectionEdgeMapping {
  id: string;
  projection_id: string;
  projection_key: string;
  edge_kind_key: string;
  from_node_kind_key: string;
  to_node_kind_key: string;
  source_table: string;
  from_source_table: string;
  from_backing_id_column: string;
  to_source_table: string;
  to_backing_id_column: string;
  source_from_ref_column: string;
  source_to_ref_column: string;
  metadata_columns_json: Record<string, unknown> | null;
  is_enabled: boolean;
  priority: number;
}

export interface GraphProjectionQueryPreset {
  id: string;
  projection_id: string;
  key: string;
  display_name: string | null;
  description: string | null;
  query_shape_json: Record<string, unknown> | null;
  is_enabled: boolean;
}

export interface GraphProjectionDefinition {
  projection: GraphProjectionRecord;
  nodeMappings: GraphProjectionNodeMapping[];
  edgeMappings: GraphProjectionEdgeMapping[];
  presets: GraphProjectionQueryPreset[];
}
