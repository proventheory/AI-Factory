"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState, Button } from "@/components/ui";
import { useDecisionLoopObserve, useDecisionLoopTick } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function DecisionLoopPage() {
  const { data, isLoading, error } = useDecisionLoopObserve();
  const tickMutation = useDecisionLoopTick();
  const anomalies = data?.anomalies ?? [];
  const baselines = data?.baselines ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Decision loop"
          description="Run a tick, compute baselines, view anomalies; optional auto-act (e.g. open_incident)."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/policies" className="text-brand-600 hover:underline">Policies</Link> · <Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        )}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button
            variant="primary"
            size="sm"
            onClick={() => tickMutation.mutate({})}
            disabled={tickMutation.isPending}
          >
            {tickMutation.isPending ? "Running…" : "Run tick"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => tickMutation.mutate({ compute_baselines: true })}
            disabled={tickMutation.isPending}
          >
            Compute baselines
          </Button>
        </div>
        <CardSection title="Anomalies">
          {isLoading ? (
            <LoadingSkeleton className="h-24 rounded-lg" />
          ) : anomalies.length === 0 ? (
            <EmptyState title="No anomalies" description="Observed metrics are within baseline." />
          ) : (
            <DataTable
              columns={[
                { key: "kpi_key", header: "KPI" },
                { key: "current", header: "Current", render: (r: { current?: number }) => String(r.current ?? "—") },
                { key: "baseline", header: "Baseline", render: (r: { baseline?: number }) => String(r.baseline ?? "—") },
                { key: "deviation_pct", header: "Deviation %", render: (r: { deviation_pct?: number }) => r.deviation_pct != null ? `${r.deviation_pct}%` : "—" },
              ]}
              data={anomalies}
              keyExtractor={(r: { kpi_key: string }) => r.kpi_key}
            />
          )}
        </CardSection>
        <CardSection title="Baselines">
          {isLoading ? (
            <LoadingSkeleton className="h-24 rounded-lg" />
          ) : baselines.length === 0 ? (
            <EmptyState title="No baselines" description="Run “Compute baselines” to populate." />
          ) : (
            <DataTable
              columns={[
                { key: "kpi_key", header: "KPI" },
                { key: "value", header: "Value", render: (r: { value?: number }) => String(r.value ?? "—") },
              ]}
              data={baselines}
              keyExtractor={(r: { kpi_key: string }) => r.kpi_key}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
