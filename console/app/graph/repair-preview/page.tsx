"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState, Button } from "@/components/ui";
import { useRuns, useGraphRepairPlan, usePostGraphSubgraphReplay } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function RepairPreviewPage() {
  const [runId, setRunId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const { data: runsData } = useRuns({ limit: 100 });
  const { data: repairPlan, isLoading, error } = useGraphRepairPlan(runId || null, nodeId || null);
  const replayMutation = usePostGraphSubgraphReplay();
  const runs = runsData?.items ?? [];
  const suggestedActions = repairPlan?.suggested_actions ?? [];
  const replayScope = repairPlan?.subgraph_replay_scope ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Repair Preview"
          description="Repair plan and replay scope for a failed node."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link> · <Link href="/graph/deploys" className="text-brand-600 hover:underline">Deploy events</Link> · <Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link>
        </p>
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="repair-run" className="text-body-small text-text-muted">Run ID</label>
            <select
              id="repair-run"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[180px]"
            >
              <option value="">Select run…</option>
              {runs.map((r: { id: string; status?: string }) => (
                <option key={r.id} value={r.id}>{r.id.slice(0, 8)}… ({r.status ?? "—"})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="repair-node" className="text-body-small text-text-muted">Node ID</label>
            <input
              id="repair-node"
              type="text"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              placeholder="e.g. node_key or plan_node_id"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[160px]"
            />
          </div>
        </div>
        {error && <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">{formatApiError(error)}</div>}
        <CardSection title="Repair plan">
          {!runId || !nodeId ? (
            <EmptyState title="Select run and node" description="Choose a run and enter a node ID to view repair plan." />
          ) : isLoading ? (
            <LoadingSkeleton className="h-32 rounded-lg" />
          ) : repairPlan ? (
            <div className="space-y-4">
              <p className="text-body-small text-text-muted">Run {repairPlan.run_id} · Node {repairPlan.node_id}</p>
              {suggestedActions.length > 0 ? (
                <DataTable
                  columns={[{ key: "action", header: "Action" }, { key: "detail", header: "Detail" }]}
                  data={suggestedActions as Array<{ action?: string; detail?: string }>}
                  keyExtractor={(r) => String((r as { action?: string }).action ?? JSON.stringify(r))}
                />
              ) : (
                <p className="text-body-small text-text-muted">No suggested actions.</p>
              )}
              {replayScope.length > 0 && (
                <>
                  <p className="text-body-small font-medium">Subgraph replay scope</p>
                  <p className="font-mono text-caption-small">{JSON.stringify(replayScope)}</p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => replayMutation.mutate({ run_id: runId, node_ids: replayScope as string[] })}
                    disabled={replayMutation.isPending}
                  >
                    {replayMutation.isPending ? "Replaying…" : "Trigger subgraph replay"}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
