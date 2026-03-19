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
    const result = await executeQuery(client, request);
    const k = result.summary?.node_counts_by_kind ?? {};
    const n = result.nodes?.length ?? 0;
    const e = result.edges?.length ?? 0;
    const parts: string[] = [];
    if (k.artifact != null) parts.push(`${k.artifact} artifacts`);
    if (k.run != null) parts.push(`${k.run} runs`);
    if (k.resource != null) parts.push(`${k.resource} resources`);
    if (parts.length > 0) {
      result.answer = `${parts.join(", ")}; ${e} dependency edges. Blast radius: ${n} nodes.`;
    } else {
      result.answer = `${n} nodes, ${e} edges (dependency graph).`;
    }
    return result;
  },
};
