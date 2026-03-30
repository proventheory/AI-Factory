"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState, Button } from "@/components/ui";
import { useRuns, useGraphRepairPlan, usePostGraphSubgraphReplay } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";
import { useEnvironment } from "@/contexts/EnvironmentContext";

function RepairPreviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { environment } = useEnvironment();
  const [runId, setRunId] = useState("");
  const [nodeId, setNodeId] = useState("");

  useEffect(() => {
    const r = searchParams.get("run_id")?.trim() ?? "";
    const n = searchParams.get("node_id")?.trim() ?? "";
    if (r) setRunId(r);
    if (n) setNodeId(n);
  }, [searchParams]);

  const { data: runsData } = useRuns({ limit: 100, environment });
  const { data: repairPlan, isLoading, error } = useGraphRepairPlan(runId || null, nodeId || null);
  const replayMutation = usePostGraphSubgraphReplay();
  const runs = runsData?.items ?? [];
  const suggestedActions = repairPlan?.suggested_actions ?? [];
  const replayScope = repairPlan?.subgraph_replay_scope ?? [];

  function navigateAfterReplay(data: { run_id?: string | null }) {
    const id = data?.run_id;
    if (id) router.push(`/runs/${id}`);
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Repair Preview"
          description="Repair plan and replay scope for a failed node. Subgraph replay creates a new run on the same plan so the worker can execute jobs again."
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
              placeholder="plan_node_id (UUID from Run → Repair tab)"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[200px]"
            />
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">
            {formatApiError(error)}
          </div>
        )}
        {replayMutation.isError && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">
            {formatApiError(replayMutation.error)}
          </div>
        )}
        <CardSection title="Repair plan">
          {!runId || !nodeId ? (
            <EmptyState
              title="Select run and node"
              description="Pick a run from the list and paste the failed plan_node_id from Pipeline Runs → open run → Repair tab. Links from that tab fill these fields automatically."
            />
          ) : isLoading ? (
            <LoadingSkeleton className="h-32 rounded-lg" />
          ) : repairPlan ? (
            <div className="space-y-4">
              <p className="text-body-small text-text-muted">
                Run {repairPlan.run_id} · Node {repairPlan.node_id}
                {repairPlan.error_signature != null && (
                  <span className="ml-2 font-mono text-caption-small">· signature {String(repairPlan.error_signature)}</span>
                )}
              </p>
              {suggestedActions.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "label", header: "Action" },
                    { key: "description", header: "Detail" },
                  ]}
                  data={suggestedActions as Array<{ label?: string; description?: string | null; action_id?: string }>}
                  keyExtractor={(r) => String((r as { action_id?: string }).action_id ?? JSON.stringify(r))}
                />
              ) : (
                <p className="text-body-small text-text-muted">No similar incidents in memory yet. You can still create a new replay run below.</p>
              )}
              {replayScope.length > 0 ? (
                <>
                  <p className="text-body-small font-medium">Subgraph replay scope</p>
                  <p className="font-mono text-caption-small break-all">{JSON.stringify(replayScope)}</p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      replayMutation.mutate(
                        { run_id: runId, node_ids: replayScope as string[] },
                        { onSuccess: navigateAfterReplay },
                      )
                    }
                    disabled={replayMutation.isPending}
                  >
                    {replayMutation.isPending ? "Replaying…" : "Trigger subgraph replay"}
                  </Button>
                </>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-body-small text-text-muted space-y-2">
                  <p>
                    The API does not return a subgraph node list yet (scope is empty). Use <strong>Replay full plan</strong> to enqueue a <em>new</em> run with the same plan—equivalent to the Run detail → Repair → &quot;Replay subgraph&quot; action.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => replayMutation.mutate({ run_id: runId }, { onSuccess: navigateAfterReplay })}
                    disabled={replayMutation.isPending}
                  >
                    {replayMutation.isPending ? "Replaying…" : "Replay full plan (new run)"}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}

export default function RepairPreviewPage() {
  return (
    <Suspense fallback={
      <PageFrame>
        <Stack>
          <PageHeader title="Repair Preview" description="Loading…" />
          <LoadingSkeleton className="h-48 w-full rounded-lg" />
        </Stack>
      </PageFrame>
    }
    >
      <RepairPreviewInner />
    </Suspense>
  );
}
