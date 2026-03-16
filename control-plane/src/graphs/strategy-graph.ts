/**
 * Strategy projection: plans, plan_nodes, plan_edges, runs.
 * Presets: blocked_tasks, active_runs.
 */

import type { PoolClient } from "pg";
import type { GraphProjectionKey, GraphProjectionResult, GraphQueryRequest, GraphQueryResponse } from "./base/types.js";
import { buildProjection, executeQuery } from "./base/query-runner.js";

const KEY: GraphProjectionKey = "strategy";

export const strategyGraph = {
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
