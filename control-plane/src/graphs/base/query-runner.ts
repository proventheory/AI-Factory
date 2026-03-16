/**
 * Run graph projection: load definition, extract nodes/edges, normalize, apply query shape/preset.
 */

import type { PoolClient } from "pg";
import type {
  GraphProjectionKey,
  GraphProjectionResult,
  GraphQueryRequest,
  GraphQueryResponse,
  GraphNodeEnvelope,
  GraphEdgeEnvelope,
} from "./types.js";
import { loadProjectionDefinition } from "./mapping-loader.js";
import { extractNodesFromMapping } from "./node-extractor.js";
import { extractEdgesFromMapping } from "./edge-extractor.js";
import { normalizeNodes, normalizeEdges, buildSummary } from "./normalizer.js";
import { addSyntheticNodes } from "./synthetic-provider.js";

const DEFAULT_NODE_LIMIT = 500;
const DEFAULT_EDGE_LIMIT = 1000;

export async function buildProjection(
  client: PoolClient,
  projectionKey: GraphProjectionKey,
  options?: { nodeLimit?: number; edgeLimit?: number }
): Promise<GraphProjectionResult> {
  const def = await loadProjectionDefinition(client, projectionKey);
  const diagnostics: { level: "info" | "warning" | "error"; code: string; message: string; details?: Record<string, unknown> }[] = [];
  if (!def) {
    return {
      graph: projectionKey,
      nodes: [],
      edges: [],
      summary: { node_count: 0, edge_count: 0, node_counts_by_kind: {}, edge_counts_by_kind: {} },
      diagnostics: [{ level: "error", code: "PROJECTION_NOT_FOUND", message: `Projection not found: ${projectionKey}` }],
    };
  }

  const nodeLimit = options?.nodeLimit ?? DEFAULT_NODE_LIMIT;
  const edgeLimit = options?.edgeLimit ?? DEFAULT_EDGE_LIMIT;
  const allNodes: GraphNodeEnvelope[] = [];
  const allEdges: GraphEdgeEnvelope[] = [];

  for (const mapping of def.nodeMappings) {
    const { nodes, diagnostics: d } = await extractNodesFromMapping(client, projectionKey, mapping, nodeLimit);
    allNodes.push(...nodes);
    diagnostics.push(...d);
  }

  const nodeIdSet = new Set(allNodes.map((n) => n.node_id));
  const synthetic = addSyntheticNodes(projectionKey, allNodes, []);
  allNodes.push(...synthetic);
  synthetic.forEach((n) => nodeIdSet.add(n.node_id));

  for (const mapping of def.edgeMappings) {
    const { edges, diagnostics: d } = await extractEdgesFromMapping(client, projectionKey, mapping, nodeIdSet, edgeLimit);
    allEdges.push(...edges);
    diagnostics.push(...d);
  }

  const nodes = normalizeNodes(allNodes);
  const edges = normalizeEdges(allEdges);
  const summary = buildSummary(nodes, edges);

  return {
    graph: projectionKey,
    summary,
    nodes,
    edges,
    diagnostics: diagnostics.length ? diagnostics : undefined,
  };
}

export async function executeQuery(
  client: PoolClient,
  request: GraphQueryRequest
): Promise<GraphQueryResponse> {
  const result = await buildProjection(client, request.graph);
  let nodes = result.nodes;
  let edges = result.edges;

  let shape = request.query ?? undefined;
  if (request.preset) {
    const def = await loadProjectionDefinition(client, request.graph);
    shape = def?.presets.find((p) => p.key === request.preset)?.query_shape_json ?? shape;
  }

  if (shape) {
    if (shape.blocked_only) {
      const blockedStates = new Set(["blocked", "pending"]);
      nodes = nodes.filter((n) => blockedStates.has(n.state));
      const nodeIds = new Set(nodes.map((n) => n.node_id));
      edges = edges.filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id));
    }
    if (shape.running_only) {
      nodes = nodes.filter((n) => n.state === "running" || n.state === "queued");
      const nodeIds = new Set(nodes.map((n) => n.node_id));
      edges = edges.filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id));
    }
  }

  return {
    graph: request.graph,
    preset: request.preset,
    nodes,
    edges,
    summary: buildSummary(nodes, edges),
    diagnostics: result.diagnostics,
  };
}
