/**
 * Extract graph edges from relationship tables using projection edge mappings.
 * Resolves backing IDs to canonical node IDs via provided node index.
 */

import type { PoolClient } from "pg";
import type { GraphProjectionKey, GraphEdgeEnvelope, GraphProjectionEdgeMapping, GraphDiagnostic } from "./types.js";
import { canonicalEdgeId, canonicalNodeIdBacked } from "./types.js";

const ALLOWED_SOURCE_TABLES = new Set([
  "plan_edges",
  "artifact_consumption",
  "operator_implements_capability",
  "operator_produces_artifact_type",
  "operator_consumes_artifact_type",
]);

function safeColumn(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/i.test(name) && !/^(select|insert|update|delete|drop|exec|where|order|limit|offset|;|--)/i.test(name);
}

export async function extractEdgesFromMapping(
  client: PoolClient,
  projectionKey: GraphProjectionKey,
  mapping: GraphProjectionEdgeMapping,
  nodeIdSet: Set<string>,
  limit: number
): Promise<{ edges: GraphEdgeEnvelope[]; diagnostics: GraphDiagnostic[] }> {
  const diagnostics: GraphDiagnostic[] = [];
  const edges: GraphEdgeEnvelope[] = [];

  if (!ALLOWED_SOURCE_TABLES.has(mapping.source_table)) {
    diagnostics.push({ level: "warning", code: "SKIP_SOURCE_TABLE", message: `Edge source table not in allowed list: ${mapping.source_table}` });
    return { edges, diagnostics };
  }

  const fromCol = mapping.source_from_ref_column;
  const toCol = mapping.source_to_ref_column;
  if (!safeColumn(fromCol) || !safeColumn(toCol) || !safeColumn(mapping.from_backing_id_column) || !safeColumn(mapping.to_backing_id_column)) {
    diagnostics.push({ level: "error", code: "INVALID_COLUMN", message: "Invalid edge mapping column name" });
    return { edges, diagnostics };
  }

  const q = `SELECT ${fromCol} AS from_ref, ${toCol} AS to_ref FROM ${mapping.source_table} LIMIT $1`;
  let rows: { from_ref: string; to_ref: string }[];
  try {
    const result = await client.query(q, [limit]);
    rows = result.rows as { from_ref: string; to_ref: string }[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({ level: "error", code: "QUERY_FAILED", message: `Edge query failed: ${message}`, details: { table: mapping.source_table } });
    return { edges, diagnostics };
  }

  for (const row of rows) {
    const fromBackingId = row.from_ref != null ? String(row.from_ref) : null;
    const toBackingId = row.to_ref != null ? String(row.to_ref) : null;
    if (fromBackingId == null || toBackingId == null) continue;

    const fromNodeId = canonicalNodeIdBacked(mapping.from_node_kind_key, mapping.from_source_table, fromBackingId);
    const toNodeId = canonicalNodeIdBacked(mapping.to_node_kind_key, mapping.to_source_table, toBackingId);

    if (!nodeIdSet.has(fromNodeId)) {
      diagnostics.push({ level: "warning", code: "MISSING_FROM_NODE", message: `From node not in graph: ${fromNodeId}` });
      continue;
    }
    if (!nodeIdSet.has(toNodeId)) {
      diagnostics.push({ level: "warning", code: "MISSING_TO_NODE", message: `To node not in graph: ${toNodeId}` });
      continue;
    }

    const edgeId = canonicalEdgeId(mapping.edge_kind_key, fromNodeId, toNodeId);
    edges.push({
      edge_id: edgeId,
      edge_kind: mapping.edge_kind_key,
      projection: projectionKey,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      metadata: {},
    });
  }

  return { edges, diagnostics };
}
