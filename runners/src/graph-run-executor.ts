/**
 * Phase 6: Durable Graph Runtime — execution loop stub.
 * Finds graph runs with status=running and nodes with status=ready; documents lease + execute as next step.
 * Enable with ENABLE_GRAPH_RUN_EXECUTOR=1 (optional). Does not create job_runs or claim jobs yet.
 */

const CONTROL_PLANE_URL = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");

export type GraphRunItem = { id: string; initiative_id: string | null; status: string; created_at: string; updated_at: string };
export type GraphNodeItem = { id: string; graph_run_id: string; plan_node_id: string | null; job_type: string; status: string; operator_id: string | null; priority: number | null };

/** Fetch running graph runs from Control Plane. */
export async function fetchRunningGraphRuns(): Promise<GraphRunItem[]> {
  const res = await fetch(`${CONTROL_PLANE_URL}/v1/graph_runs?status=running&limit=20`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: GraphRunItem[] };
  return Array.isArray(data?.items) ? data.items : [];
}

/** Fetch full graph run (with nodes) from Control Plane. */
export async function fetchGraphRun(runId: string): Promise<{ id: string; status: string; nodes: GraphNodeItem[] } | null> {
  const res = await fetch(`${CONTROL_PLANE_URL}/v1/graph_runs/${runId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; status: string; nodes?: GraphNodeItem[] };
  return { id: data.id, status: data.status, nodes: Array.isArray(data.nodes) ? data.nodes : [] };
}

/** Stub: find ready nodes across running graph runs; log what would be leased/executed. No DB lease or job execution yet. */
export async function processGraphRunsStub(): Promise<void> {
  if (process.env.ENABLE_GRAPH_RUN_EXECUTOR !== "1") return;
  try {
    const runs = await fetchRunningGraphRuns();
    for (const run of runs) {
      const full = await fetchGraphRun(run.id);
      if (!full?.nodes) continue;
      const ready = full.nodes.filter((n) => n.status === "ready");
      for (const node of ready) {
        // Next: lease node (INSERT node_leases), create job_run from node, claim and execute. For now stub.
        console.log("[graph-run-executor] Phase 6 stub: would lease and execute node", node.id, "job_type=", node.job_type);
      }
    }
  } catch (e) {
    console.warn("[graph-run-executor] stub poll error:", (e as Error).message);
  }
}
