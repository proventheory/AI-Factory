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
    return executeQuery(client, request);
  },
};
