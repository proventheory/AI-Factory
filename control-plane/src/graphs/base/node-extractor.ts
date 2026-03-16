/**
 * Extract graph nodes from source tables using projection node mappings.
 * Only uses mapping-defined table and column names; never executes user SQL.
 */

import type { PoolClient } from "pg";
import type { GraphProjectionKey, GraphNodeEnvelope, GraphProjectionNodeMapping, GraphDiagnostic } from "./types.js";
import { canonicalNodeIdBacked } from "./types.js";

const ALLOWED_SOURCE_TABLES = new Set([
  "initiatives",
  "plans",
  "plan_nodes",
  "plan_edges",
  "runs",
  "job_runs",
  "artifacts",
  "operators",
  "artifact_consumption",
  "releases",
  "brand_profiles",
  "policies",
]);

function safeColumn(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/i.test(name) && !/^(select|insert|update|delete|drop|exec|where|order|limit|offset|;|--)/i.test(name);
}

export async function extractNodesFromMapping(
  client: PoolClient,
  projectionKey: GraphProjectionKey,
  mapping: GraphProjectionNodeMapping,
  limit: number
): Promise<{ nodes: GraphNodeEnvelope[]; diagnostics: GraphDiagnostic[] }> {
  const diagnostics: GraphDiagnostic[] = [];
  const nodes: GraphNodeEnvelope[] = [];

  if (!ALLOWED_SOURCE_TABLES.has(mapping.source_table)) {
    diagnostics.push({ level: "error", code: "INVALID_SOURCE_TABLE", message: `Source table not allowed: ${mapping.source_table}` });
    return { nodes, diagnostics };
  }

  const cols = [mapping.backing_id_column];
  if (mapping.title_column) cols.push(mapping.title_column);
  if (mapping.slug_column) cols.push(mapping.slug_column);
  if (mapping.state_column) cols.push(mapping.state_column);
  for (const c of cols) {
    if (!safeColumn(c)) {
      diagnostics.push({ level: "error", code: "INVALID_COLUMN", message: `Invalid column name: ${c}` });
      return { nodes, diagnostics };
    }
  }

  const colList = cols.join(", ");
  const q = `SELECT ${colList} FROM ${mapping.source_table} LIMIT $1`;
  let rows: Record<string, unknown>[];
  try {
    const result = await client.query(q, [limit]);
    rows = result.rows as Record<string, unknown>[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({ level: "error", code: "QUERY_FAILED", message: `Query failed: ${message}`, details: { table: mapping.source_table } });
    return { nodes, diagnostics };
  }

  const backingIdCol = mapping.backing_id_column;
  const titleCol = mapping.title_column ?? null;
  const stateCol = mapping.state_column ?? null;

  for (const row of rows) {
    const backingId = row[backingIdCol];
    if (backingId == null) continue;
    const backingIdStr = String(backingId);
    const nodeId = canonicalNodeIdBacked(mapping.node_kind_key, mapping.source_table, backingIdStr);
    const label = (titleCol ? String(row[titleCol] ?? "") : mapping.title_template) || `${mapping.node_kind_key}:${backingIdStr}`;
    const state = (stateCol ? String(row[stateCol] ?? "") : "") || "declared";

    nodes.push({
      node_id: nodeId,
      node_kind: mapping.node_kind_key,
      backing_table: mapping.source_table,
      backing_id: backingIdStr,
      projection: projectionKey,
      label: label.trim() || nodeId,
      slug: mapping.slug_column ? String(row[mapping.slug_column] ?? "") || null : null,
      state,
      summary: null,
      spec: null,
      desired: null,
      observed: null,
      metadata: { source_table: mapping.source_table, projection: projectionKey },
    });
  }

  return { nodes, diagnostics };
}
