"use client";
import { useMemo } from "react";
import { PlanDagViewer } from "./PlanDagViewer";
import { useRun } from "@/hooks/use-api";
import { LoadingSkeleton } from "@/components/ui";

type RunFlightRecorder = {
  run?: { plan_id?: string };
  plan_nodes?: Array<{ id: string }>;
  plan_edges?: Array<Record<string, unknown>>;
  job_runs?: Array<{ plan_node_id?: string; status?: string }>;
};

export function RunFlowViewer({ runId, className, onNodeClick }: {
  runId: string;
  className?: string;
  onNodeClick?: (nodeId: string) => void;
}) {
  const { data: runData, isLoading: runLoading, error: runError } = useRun(runId);
  const run = runData as RunFlightRecorder | undefined;
  const planNodes = run?.plan_nodes ?? [];
  const planEdges = run?.plan_edges ?? [];
  const jobRuns = run?.job_runs ?? [];

  const nodeStatuses = useMemo(() => {
    const statuses: Record<string, string> = {};
    for (const jr of jobRuns) {
      const nodeId = String(jr.plan_node_id ?? "");
      if (nodeId) statuses[nodeId] = String(jr.status ?? "queued");
    }
    return statuses;
  }, [jobRuns]);

  const totalCount = planNodes.length;
  const completedCount = totalCount > 0
    ? planNodes.filter((n) => nodeStatuses[String(n.id)] === "succeeded").length
    : Object.values(nodeStatuses).filter((s) => s === "succeeded").length;

  const runRow = run?.run;
  const planId = runRow ? String(runRow.plan_id ?? "") : "";

  if (runLoading) return <LoadingSkeleton className="h-[500px] w-full rounded-lg" />;
  if (runError) return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Failed to load run: {(runError as Error).message}</div>;
  if (!planId) return <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">No plan associated with this run.</div>;

  return (
    <div className={className}>
      {totalCount > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Progress: {completedCount} / {totalCount} steps</span>
            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(completedCount / totalCount) * 100}%` }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Steps in the execution flow below.</p>
        </div>
      )}
      <PlanDagViewer
        planId={planId}
        nodeStatuses={nodeStatuses}
        onNodeClick={onNodeClick}
        runPlanNodes={planNodes as Array<Record<string, unknown>>}
        runPlanEdges={planEdges}
      />
    </div>
  );
}
