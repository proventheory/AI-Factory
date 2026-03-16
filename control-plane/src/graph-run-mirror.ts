/**
 * Phase 5A: Mirror run to graph_run (execution layer). When a run is created,
 * create a graph_run + graph_nodes (execution) + graph_edges (execution) for observability.
 */

import type { DbClient } from "./db.js";

export async function mirrorRunToGraphRun(db: DbClient, runId: string, planId: string): Promise<void> {
  const initiativeRow = await db.query(
    "SELECT initiative_id FROM plans WHERE id = $1",
    [planId]
  );
  const initiativeId = initiativeRow.rows[0]?.initiative_id ?? null;

  const graphRun = await db.query(
    `INSERT INTO graph_runs (initiative_id, status) VALUES ($1, 'pending') RETURNING id`,
    [initiativeId]
  ).catch(() => ({ rows: [] as { id: string }[] }));
  if (graphRun.rows.length === 0) return;
  const graphRunId = graphRun.rows[0].id;

  const planNodes = await db.query(
    "SELECT id, job_type FROM plan_nodes WHERE plan_id = $1",
    [planId]
  );
  const planNodeToGraphNode = new Map<string, string>();
  for (const row of planNodes.rows as { id: string; job_type: string }[]) {
    const gn = await db.query(
      `INSERT INTO graph_nodes (graph_run_id, plan_node_id, job_type, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [graphRunId, row.id, row.job_type]
    ).catch(() => ({ rows: [] as { id: string }[] }));
    if (gn.rows.length > 0) planNodeToGraphNode.set(row.id, gn.rows[0].id);
  }

  const planEdges = await db.query(
    "SELECT from_node_id, to_node_id FROM plan_edges WHERE plan_id = $1",
    [planId]
  );
  for (const e of planEdges.rows as { from_node_id: string; to_node_id: string }[]) {
    const fromId = planNodeToGraphNode.get(e.from_node_id);
    const toId = planNodeToGraphNode.get(e.to_node_id);
    if (fromId && toId) {
      await db.query(
        `INSERT INTO graph_edges (graph_run_id, source_node_id, target_node_id, condition_json) VALUES ($1, $2, $3, '{}')`,
        [graphRunId, fromId, toId]
      ).catch(() => {});
    }
  }

  await db.query(
    `INSERT INTO graph_run_events (graph_run_id, event_type, payload_json) VALUES ($1, 'mirrored', $2)`,
    [graphRunId, JSON.stringify({ run_id: runId, plan_id: planId })]
  ).catch(() => {});
}
