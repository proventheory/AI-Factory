/**
 * Catalog projection: operators, saved_flows, templates, brands.
 * Presets: operator_inventory, flow_inventory.
 */

import type { PoolClient } from "pg";
import type { GraphProjectionKey, GraphProjectionResult, GraphQueryRequest, GraphQueryResponse } from "./base/types.js";
import { buildProjection, executeQuery } from "./base/query-runner.js";

const KEY: GraphProjectionKey = "catalog";

export const catalogGraph = {
  key: KEY,

  async build(client: PoolClient, options?: { nodeLimit?: number; edgeLimit?: number }): Promise<GraphProjectionResult> {
    return buildProjection(client, KEY, options);
  },

  async query(client: PoolClient, request: GraphQueryRequest): Promise<GraphQueryResponse> {
    if (request.graph !== KEY) {
      return {
        graph: KEY,
        diagnostics: [{ level: "error", code: "WRONG_GRAPH", message: `Expected graph ${KEY}` }],
      };
    }
    const result = await executeQuery(client, request);
    const k = result.summary?.node_counts_by_kind ?? {};
    const ops = k.operator ?? k.operators ?? 0;
    const flows = k.saved_flow ?? k.flow ?? 0;
    const brands = k.brand ?? 0;
    const templates = k.template ?? 0;
    const parts: string[] = [];
    if (ops > 0) parts.push(`${ops} operators`);
    if (flows > 0) parts.push(`${flows} saved flows`);
    if (brands > 0) parts.push(`${brands} brands`);
    if (templates > 0) parts.push(`${templates} templates`);
    result.answer = parts.length > 0
      ? parts.join(", ") + " in catalog."
      : `${result.nodes?.length ?? 0} structural objects, ${result.edges?.length ?? 0} relationships.`;
    return result;
  },
};
