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

export function PlanDagViewer({ planId, nodeStatuses, className, onNodeClick }: {
  planId: string;
  nodeStatuses?: Record<string, string>;
  className?: string;
  onNodeClick?: (nodeId: string) => void;
}) {
  const { data: planData, isLoading, error } = usePlan(planId);

  const { nodes, edges } = useMemo(() => {
    if (!planData) return { nodes: [], edges: [] };
    const plan = planData as Record<string, unknown>;
    const planNodes = (plan.nodes ?? plan.plan_nodes ?? []) as Array<Record<string, unknown>>;
    const planEdges = (plan.edges ?? plan.plan_edges ?? []) as Array<Record<string, unknown>>;

    const flowNodes: Node[] = [];
    const flowEdges: { id: string; source: string; target: string }[] = [];

    if (planNodes.length > 0) {
      flowNodes.push({ id: "__start__", type: "startNode", position: { x: 0, y: 0 }, data: {} });
      flowNodes.push({ id: "__end__", type: "endNode", position: { x: 0, y: 0 }, data: {} });
    }

    for (const n of planNodes) {
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

    for (const e of planEdges) {
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
  }, [planData, nodeStatuses]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id.startsWith("__")) return;
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  if (isLoading) return <LoadingSkeleton className="h-[500px] w-full rounded-lg" />;
  if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Failed to load plan: {(error as Error).message}</div>;
  if (nodes.length === 0) return <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">No plan nodes found.</div>;

  return (
    <div className={className}>
      <FlowCanvas nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
      <ChartLegend className="mt-3 justify-center" items={Object.entries(STATUS_COLORS).map(([label, color]) => ({ label, color }))} />
    </div>
  );
}
