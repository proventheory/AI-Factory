/**
 * Optional synthetic node injection (e.g. environment, service, artifact_type).
 * V1: minimal; projection modules can add more later.
 */

import type { GraphProjectionKey, GraphNodeEnvelope } from "./types.js";
import { canonicalNodeIdSynthetic } from "./types.js";

export function addSyntheticNodes(
  _projection: GraphProjectionKey,
  _nodes: GraphNodeEnvelope[],
  _edges: { from_node_id: string; to_node_id: string }[]
): GraphNodeEnvelope[] {
  // V1: no synthetic nodes injected by default; topology can add environment/service later
  return [];
}
