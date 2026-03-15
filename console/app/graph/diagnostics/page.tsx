"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { usePlans, useRuns, useGraphAudit, useGraphMissingCapabilities } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function GraphDiagnosticsPage() {
  const [runId, setRunId] = useState("");
  const [planId, setPlanId] = useState("");
  const { data: plansData } = usePlans({ limit: 100 });
  const { data: runsData } = useRuns({ limit: 100 });
  const { data: audit, isLoading: auditLoading, error: auditError } = useGraphAudit(runId || null);
  const { data: missing, isLoading: missingLoading, error: missingError } = useGraphMissingCapabilities(planId || null);
  const plans = plansData?.items ?? [];
  const runs = runsData?.items ?? [];
  const issues = audit?.issues ?? [];
  const missingCaps = missing?.missing ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Graph health"
          description="Graph audit and missing capabilities."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/jobs" className="text-brand-600 hover:underline">Jobs</Link> · <Link href="/graph/explorer" className="text-brand-600 hover:underline">Graph Explorer</Link>
        </p>
        <div className="flex flex-wrap gap-6 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="audit-run" className="text-body-small text-text-muted">Run (audit)</label>
            <select
              id="audit-run"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[180px]"
            >
              <option value="">Select run…</option>
              {runs.map((r: { id: string; status?: string }) => (
                <option key={r.id} value={r.id}>{r.id.slice(0, 8)}…</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="missing-plan" className="text-body-small text-text-muted">Plan (missing caps)</label>
            <select
              id="missing-plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[180px]"
            >
              <option value="">Select plan…</option>
              {plans.map((p: { id: string; version?: number }) => (
                <option key={p.id} value={p.id}>{p.id.slice(0, 8)}…</option>
              ))}
            </select>
          </div>
        </div>
        {auditError && <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">{formatApiError(auditError)}</div>}
        {missingError && <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">{formatApiError(missingError)}</div>}
        <CardSection title="Graph audit">
          {!runId ? (
            <EmptyState title="Select a run" description="Choose a run to view audit." />
          ) : auditLoading ? (
            <LoadingSkeleton className="h-24 rounded-lg" />
          ) : issues.length === 0 ? (
            <EmptyState title="No issues" description="No audit issues for this run." />
          ) : (
            <DataTable
              columns={[{ key: "type", header: "Type" }, { key: "message", header: "Message" }]}
              data={issues.map((issue, i) => ({
                type: (issue as { type?: string })?.type,
                message: (issue as { message?: string })?.message,
                __key: i,
              }))}
              keyExtractor={(r) => String(r.__key)}
            />
          )}
        </CardSection>
        <CardSection title="Missing capabilities">
          {!planId ? (
            <EmptyState title="Select a plan" description="Choose a plan to view missing capabilities." />
          ) : missingLoading ? (
            <LoadingSkeleton className="h-24 rounded-lg" />
          ) : missingCaps.length === 0 ? (
            <EmptyState title="None missing" description="No missing capabilities for this plan." />
          ) : (
            <pre className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-caption-small overflow-auto max-h-[200px]">{JSON.stringify(missingCaps, null, 2)}</pre>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
