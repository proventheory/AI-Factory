"use client";
import { useMemo } from "react";
import { PlanDagViewer } from "./PlanDagViewer";
import { useRun, useJobRuns } from "@/hooks/use-api";
import { LoadingSkeleton } from "@/components/ui";

export function RunFlowViewer({ runId, className, onNodeClick }: {
  runId: string;
  className?: string;
  onNodeClick?: (nodeId: string) => void;
}) {
  const { data: runData, isLoading: runLoading, error: runError } = useRun(runId);
  const { data: jobRunsData } = useJobRuns({ run_id: runId, limit: 200 });

  const nodeStatuses = useMemo(() => {
    const statuses: Record<string, string> = {};
    for (const jr of (jobRunsData?.items ?? [])) {
      const nodeId = String((jr as Record<string, unknown>).plan_node_id ?? "");
      if (nodeId) statuses[nodeId] = String((jr as Record<string, unknown>).status ?? "queued");
    }
    return statuses;
  }, [jobRunsData]);

  const completedCount = Object.values(nodeStatuses).filter((s) => s === "succeeded").length;
  const totalCount = Object.keys(nodeStatuses).length;

  const runRow = runData && typeof runData === "object" && "run" in runData
    ? (runData as { run?: { plan_id?: string } }).run
    : (runData as { plan_id?: string } | undefined);
  const planId = runRow ? String(runRow.plan_id ?? "") : "";

  if (runLoading) return <LoadingSkeleton className="h-[500px] w-full rounded-lg" />;
  if (runError) return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Failed to load run: {(runError as Error).message}</div>;
  if (!planId) return <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">No plan associated with this run.</div>;

  return (
    <div className={className}>
      {totalCount > 0 && (
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span>Progress: {completedCount} / {totalCount} nodes</span>
          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      <PlanDagViewer planId={planId} nodeStatuses={nodeStatuses} onNodeClick={onNodeClick} />
    </div>
  );
}
