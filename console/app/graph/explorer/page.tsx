"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { usePlans, useRuns, useGraphTopology, useGraphFrontier } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function GraphExplorerPage() {
  const [planId, setPlanId] = useState("");
  const [runId, setRunId] = useState("");
  const { data: plansData } = usePlans({ limit: 100 });
  const { data: runsData } = useRuns({ limit: 100 });
  const { data: topology, isLoading: topologyLoading, error: topologyError } = useGraphTopology(planId || null);
  const { data: frontier, isLoading: frontierLoading, error: frontierError } = useGraphFrontier(runId || null);
  const plans = plansData?.items ?? [];
  const runs = runsData?.items ?? [];
  const nodes = topology?.nodes ?? [];
  const edges = topology?.edges ?? [];
  const completed = frontier?.completed_node_ids ?? [];
  const pending = frontier?.pending_node_ids ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Graph Explorer"
          description="Explore plan topology and run frontier."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/plans" className="text-brand-600 hover:underline">Plans</Link> · <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link>
        </p>
        <div className="flex flex-wrap gap-6 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="explorer-plan" className="text-body-small text-text-muted">Plan</label>
            <select
              id="explorer-plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[180px]"
            >
              <option value="">Select plan…</option>
              {plans.map((p: { id: string; initiative_id?: string; version?: number }) => (
                <option key={p.id} value={p.id}>{p.id.slice(0, 8)}… (v{p.version ?? "?"})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="explorer-run" className="text-body-small text-text-muted">Run</label>
            <select
              id="explorer-run"
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
        </div>
        {topologyError && <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">{formatApiError(topologyError)}</div>}
        {frontierError && <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">{formatApiError(frontierError)}</div>}
        <CardSection title="Plan topology">
          {!planId ? (
            <EmptyState title="Select a plan" description="Choose a plan above to view topology." />
          ) : topologyLoading ? (
            <LoadingSkeleton className="h-32 rounded-lg" />
          ) : nodes.length === 0 && edges.length === 0 ? (
            <EmptyState title="Empty topology" description="No nodes or edges for this plan yet." />
          ) : (
            <div className="space-y-3">
              <p className="text-body-small text-text-muted">Plan {topology?.plan_id} · {nodes.length} nodes, {edges.length} edges</p>
              {nodes.length > 0 && (
                <DataTable
                  columns={[{ key: "id", header: "Node" }, { key: "label", header: "Label" }]}
                  data={nodes as Array<{ id?: string; label?: string }>}
                  keyExtractor={(r) => String((r as { id?: string }).id ?? JSON.stringify(r))}
                />
              )}
            </div>
          )}
        </CardSection>
        <CardSection title="Run frontier">
          {!runId ? (
            <EmptyState title="Select a run" description="Choose a run above to view frontier." />
          ) : frontierLoading ? (
            <LoadingSkeleton className="h-32 rounded-lg" />
          ) : (
            <div className="space-y-2">
              <p className="text-body-small text-text-muted">Run {frontier?.run_id}</p>
              <p><strong>Completed:</strong> {completed.length} node(s) · <strong>Pending:</strong> {pending.length} node(s)</p>
              {completed.length > 0 && <p className="font-mono text-caption-small">{completed.join(", ")}</p>}
              {pending.length > 0 && <p className="font-mono text-caption-small text-text-muted">Pending: {pending.join(", ")}</p>}
            </div>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
