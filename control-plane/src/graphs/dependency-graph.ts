/**
 * Dependency projection: artifact_consumption, artifacts, runs.
 * Presets: blast_radius, upstream_dependencies.
 */

import type { PoolClient } from "pg";
import type { GraphProjectionKey, GraphProjectionResult, GraphQueryRequest, GraphQueryResponse } from "./base/types.js";
import { buildProjection, executeQuery } from "./base/query-runner.js";

const KEY: GraphProjectionKey = "dependency";

export const dependencyGraph = {
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
