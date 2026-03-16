/**
 * Topology projection: environments, releases, runs (deployment map).
 * Thin real implementation: reads from runs + releases; no mapping layer.
 */

import type { PoolClient } from "pg";
import type {
  GraphProjectionKey,
  GraphProjectionResult,
  GraphQueryRequest,
  GraphQueryResponse,
  GraphNodeEnvelope,
  GraphEdgeEnvelope,
  GraphProjectionSummary,
} from "./base/types.js";

const KEY: GraphProjectionKey = "topology";

function buildSummary(nodes: GraphNodeEnvelope[], edges: GraphEdgeEnvelope[]): GraphProjectionSummary {
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

export const topologyGraph = {
  key: KEY,

  async build(client: PoolClient, options?: { nodeLimit?: number; edgeLimit?: number }): Promise<GraphProjectionResult> {
    const nodeLimit = options?.nodeLimit ?? 500;
    const edgeLimit = options?.edgeLimit ?? 1000;
    const nodes: GraphNodeEnvelope[] = [];
    const edges: GraphEdgeEnvelope[] = [];

    const envRows = await client.query(
      `SELECT DISTINCT environment FROM runs WHERE environment IS NOT NULL ORDER BY environment LIMIT $1`,
      [nodeLimit]
    );
    for (const r of envRows.rows as { environment: string }[]) {
      nodes.push({
        node_id: `s:topology:environment:${r.environment}`,
        node_kind: "environment",
        backing_table: null,
        backing_id: null,
        projection: KEY,
        label: r.environment,
        slug: r.environment,
        state: "declared",
        summary: null,
        spec: null,
        desired: null,
        observed: null,
        metadata: { synthetic: true, synthetic_key: r.environment },
        synthetic: true,
        synthetic_key: r.environment,
      });
    }

    const releaseRows = await client.query(
      `SELECT id, status, percent_rollout, created_at FROM releases ORDER BY created_at DESC NULLS LAST LIMIT $1`,
      [nodeLimit]
    );
    for (const r of releaseRows.rows as { id: string; status: string; percent_rollout: number | null; created_at: string }[]) {
      nodes.push({
        node_id: `g:release:releases:${r.id}`,
        node_kind: "release",
        backing_table: "releases",
        backing_id: r.id,
        projection: KEY,
        label: `Release ${r.id.slice(0, 8)}`,
        slug: r.id,
        state: r.status ?? "draft",
        summary: r.percent_rollout != null ? `${r.percent_rollout}% rollout` : null,
        spec: null,
        desired: null,
        observed: null,
        metadata: { status: r.status, percent_rollout: r.percent_rollout, created_at: r.created_at },
      });
    }

    const runEnvRows = await client.query(
      `SELECT release_id, environment FROM runs WHERE release_id IS NOT NULL AND environment IS NOT NULL
       GROUP BY release_id, environment ORDER BY release_id, environment LIMIT $1`,
      [edgeLimit]
    );
    const nodeIdSet = new Set(nodes.map((n) => n.node_id));
    for (const r of runEnvRows.rows as { release_id: string; environment: string }[]) {
      const fromId = `g:release:releases:${r.release_id}`;
      const toId = `s:topology:environment:${r.environment}`;
      if (nodeIdSet.has(fromId) && nodeIdSet.has(toId)) {
        edges.push({
          edge_id: `e:deploys_to:${fromId}->${toId}`,
          edge_kind: "deploys_to",
          projection: KEY,
          from_node_id: fromId,
          to_node_id: toId,
          metadata: {},
        });
      }
    }

    return {
      graph: KEY,
      nodes,
      edges,
      summary: buildSummary(nodes, edges),
    };
  },

  async query(client: PoolClient, request: GraphQueryRequest): Promise<GraphQueryResponse> {
    if (request.graph !== KEY) {
      return {
        graph: KEY,
        diagnostics: [{ level: "error", code: "WRONG_GRAPH", message: `Expected graph ${KEY}` }],
      };
    }
    const result = await this.build(client);
    const envCount = result.nodes.filter((n) => n.node_kind === "environment").length;
    const releaseCount = result.nodes.filter((n) => n.node_kind === "release").length;
    const answer = `${envCount} environments, ${releaseCount} releases`;
    return {
      graph: KEY,
      preset: request.preset,
      answer,
      nodes: result.nodes,
      edges: result.edges,
      summary: result.summary,
      diagnostics: result.diagnostics,
    };
  },
};
