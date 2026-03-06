"use client";
import { useMemo, useCallback } from "react";
import type { Node } from "@xyflow/react";
import { FlowCanvas } from "./FlowCanvas";
import { layoutDag } from "./layout";
import { usePlan } from "@/hooks/use-api";
import { LoadingSkeleton } from "@/components/ui";
import { ChartLegend } from "@/components/charts/ChartLegend";

const STATUS_COLORS: Record<string, string> = {
  queued: "hsl(var(--muted-foreground))",
  running: "hsl(var(--chart-1))",
  succeeded: "#10b981",
  failed: "hsl(var(--destructive))",
  blocked: "#f59e0b",
};

export function PlanDagViewer({ planId, nodeStatuses, className, onNodeClick, runPlanNodes, runPlanEdges }: {
  planId: string;
  nodeStatuses?: Record<string, string>;
  className?: string;
  onNodeClick?: (nodeId: string) => void;
  /** When provided (e.g. from run detail), use these instead of fetching the plan so progress and chart match. */
  runPlanNodes?: Array<Record<string, unknown>>;
  runPlanEdges?: Array<Record<string, unknown>>;
}) {
  const { data: planData, isLoading, error } = usePlan(runPlanNodes == null ? planId : null);

  const { nodes, edges } = useMemo(() => {
    const planNodes = runPlanNodes ?? (planData as Record<string, unknown> | undefined)?.nodes ?? (planData as Record<string, unknown> | undefined)?.plan_nodes ?? [];
    const planEdges = runPlanEdges ?? (planData as Record<string, unknown> | undefined)?.edges ?? (planData as Record<string, unknown> | undefined)?.plan_edges ?? [];
    const resolved = (Array.isArray(planNodes) ? planNodes : []) as Array<Record<string, unknown>>;
    const resolvedEdges = (Array.isArray(planEdges) ? planEdges : []) as Array<Record<string, unknown>>;
    if (resolved.length === 0 && !planData && runPlanNodes == null) return { nodes: [], edges: [] };
    if (resolved.length === 0) return { nodes: [], edges: [] };

    const flowNodes: Node[] = [];
    const flowEdges: { id: string; source: string; target: string }[] = [];

    flowNodes.push({ id: "__start__", type: "startNode", position: { x: 0, y: 0 }, data: {} });
    flowNodes.push({ id: "__end__", type: "endNode", position: { x: 0, y: 0 }, data: {} });

    for (const n of resolved) {
      const nid = String(n.id);
      flowNodes.push({
        id: nid,
        type: "planNode",
        position: { x: 0, y: 0 },
        data: {
          display_name: n.display_name ?? n.node_key ?? nid.slice(0, 8),
          agent_role: n.agent_role,
          job_type: n.job_type,
          status: nodeStatuses?.[nid] ?? "queued",
          sequence: n.sequence,
        },
      });
    }

    for (const e of resolvedEdges) {
      flowEdges.push({ id: String(e.id ?? `${e.from_node_id}-${e.to_node_id}`), source: String(e.from_node_id), target: String(e.to_node_id) });
    }

    const roots = new Set(flowNodes.filter((n) => n.type === "planNode").map((n) => n.id));
    const targets = new Set(flowEdges.map((e) => e.target));
    const sources = new Set(flowEdges.map((e) => e.source));
    const rootNodes = [...roots].filter((id) => !targets.has(id));
    const leafNodes = [...roots].filter((id) => !sources.has(id));

    rootNodes.forEach((id) => flowEdges.push({ id: `__start__-${id}`, source: "__start__", target: id }));
    leafNodes.forEach((id) => flowEdges.push({ id: `${id}-__end__`, source: id, target: "__end__" }));

    return layoutDag(flowNodes, flowEdges);
  }, [planData, nodeStatuses, runPlanNodes, runPlanEdges]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id.startsWith("__")) return;
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  const planNodesFromApi = planData != null ? (planData as Record<string, unknown>).nodes ?? (planData as Record<string, unknown>).plan_nodes : undefined;
  const hasData = (runPlanNodes != null && runPlanNodes.length > 0) || (Array.isArray(planNodesFromApi) && planNodesFromApi.length > 0);
  if (!hasData && isLoading) return <LoadingSkeleton className="h-[500px] w-full rounded-lg" />;
  if (!hasData && error) return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Failed to load plan: {(error as Error).message}</div>;
  if (nodes.length === 0) return <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">No plan nodes found.</div>;

  return (
    <div className={className}>
      <FlowCanvas nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
      <ChartLegend className="mt-3 justify-center" items={Object.entries(STATUS_COLORS).map(([label, color]) => ({ label, color }))} />
    </div>
  );
}
