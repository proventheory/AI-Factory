/**
 * Normalize and dedupe nodes and edges; merge metadata.
 */

import type { GraphNodeEnvelope, GraphEdgeEnvelope, GraphProjectionSummary } from "./types.js";

export function normalizeNodes(nodes: GraphNodeEnvelope[]): GraphNodeEnvelope[] {
  const byId = new Map<string, GraphNodeEnvelope>();
  for (const n of nodes) {
    const existing = byId.get(n.node_id);
    if (!existing) {
      byId.set(n.node_id, { ...n, metadata: { ...n.metadata } });
      continue;
    }
    const merged: GraphNodeEnvelope = {
      ...existing,
      label: existing.label || n.label,
      state: n.state || existing.state,
      summary: existing.summary ?? n.summary,
      slug: existing.slug ?? n.slug,
      metadata: { ...existing.metadata, ...n.metadata },
    };
    byId.set(n.node_id, merged);
  }
  return Array.from(byId.values());
}

export function normalizeEdges(edges: GraphEdgeEnvelope[]): GraphEdgeEnvelope[] {
  const byId = new Map<string, GraphEdgeEnvelope>();
  for (const e of edges) {
    const existing = byId.get(e.edge_id);
    if (!existing) {
      byId.set(e.edge_id, { ...e, metadata: { ...e.metadata } });
      continue;
    }
    const merged: GraphEdgeEnvelope = {
      ...existing,
      metadata: { ...existing.metadata, ...e.metadata },
    };
    byId.set(e.edge_id, merged);
  }
  return Array.from(byId.values());
}

export function buildSummary(nodes: GraphNodeEnvelope[], edges: GraphEdgeEnvelope[]): GraphProjectionSummary {
  const node_counts_by_kind: Record<string, number> = {};
  const edge_counts_by_kind: Record<string, number> = {};
  for (const n of nodes) {
    node_counts_by_kind[n.node_kind] = (node_counts_by_kind[n.node_kind] ?? 0) + 1;
  }
  for (const e of edges) {
    edge_counts_by_kind[e.edge_kind] = (edge_counts_by_kind[e.edge_kind] ?? 0) + 1;
  }
  return {
    node_count: nodes.length,
    edge_count: edges.length,
    node_counts_by_kind,
    edge_counts_by_kind,
  };
}
