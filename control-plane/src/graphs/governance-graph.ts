/**
 * Governance projection: policies, action_policies, approval_policies (rules, decisions, scopes).
 * Thin real implementation: reads from policies + action_policies + approval_policies; no mapping layer.
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

const KEY: GraphProjectionKey = "governance";

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

export const governanceGraph = {
  key: KEY,

  async build(client: PoolClient, options?: { nodeLimit?: number; edgeLimit?: number }): Promise<GraphProjectionResult> {
    const nodeLimit = options?.nodeLimit ?? 500;
    const nodes: GraphNodeEnvelope[] = [];
    const edges: GraphEdgeEnvelope[] = [];

    try {
      const policyRows = await client.query(
        `SELECT version, created_at FROM policies ORDER BY created_at DESC LIMIT $1`,
        [nodeLimit]
      );
      for (const r of policyRows.rows as { version: string; created_at: string }[]) {
        nodes.push({
          node_id: `g:policy:policies:${r.version}`,
          node_kind: "policy",
          backing_table: "policies",
          backing_id: r.version,
          projection: KEY,
          label: r.version,
          slug: r.version,
          state: "declared",
          summary: null,
          spec: null,
          desired: null,
          observed: null,
          metadata: { created_at: r.created_at },
        });
      }
    } catch {
      // policies table may not exist in all envs
    }

    try {
      const actionRows = await client.query(
        `SELECT id, policy_key, action_type, scope_type, requires_approval, is_enabled FROM action_policies WHERE is_enabled = true ORDER BY policy_key LIMIT $1`,
        [nodeLimit]
      );
      for (const r of actionRows.rows as { id: string; policy_key: string; action_type: string; scope_type: string | null; requires_approval: boolean }[]) {
        nodes.push({
          node_id: `g:policy:action_policies:${r.id}`,
          node_kind: "policy",
          backing_table: "action_policies",
          backing_id: r.id,
          projection: KEY,
          label: r.policy_key,
          slug: r.policy_key,
          state: "declared",
          summary: `${r.action_type}${r.requires_approval ? " (approval)" : ""}`,
          spec: null,
          desired: null,
          observed: null,
          metadata: { action_type: r.action_type, scope_type: r.scope_type, requires_approval: r.requires_approval },
        });
      }
    } catch {
      // action_policies may not exist
    }

    try {
      const approvalRows = await client.query(
        `SELECT id, policy_key, scope_type, scope_ref, is_active FROM approval_policies WHERE is_active = true ORDER BY policy_key LIMIT $1`,
        [nodeLimit]
      );
      for (const r of approvalRows.rows as { id: string; policy_key: string; scope_type: string | null; scope_ref: string | null }[]) {
        nodes.push({
          node_id: `g:policy:approval_policies:${r.id}`,
          node_kind: "policy",
          backing_table: "approval_policies",
          backing_id: r.id,
          projection: KEY,
          label: r.policy_key,
          slug: r.policy_key,
          state: "declared",
          summary: r.scope_type ? `scope: ${r.scope_type}` : null,
          spec: null,
          desired: null,
          observed: null,
          metadata: { scope_type: r.scope_type, scope_ref: r.scope_ref },
        });
      }
    } catch {
      // approval_policies may not exist
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
    const byTable: Record<string, number> = {};
    for (const n of result.nodes) {
      const t = n.backing_table ?? "other";
      byTable[t] = (byTable[t] ?? 0) + 1;
    }
    const answer =
      `${byTable.policies ?? 0} policies, ${byTable.action_policies ?? 0} action policies, ${byTable.approval_policies ?? 0} approval policies`;
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
