"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge, Button, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useRuns, useCancelRun } from "@/hooks/use-api";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { formatApiError } from "@/lib/api";
import { INTENT_TYPES } from "@/config/intent-types";

type RunRow = {
  id: string;
  plan_id?: string;
  environment: string;
  cohort?: string | null;
  status: string;
  started_at: string | null;
  finished_at?: string | null;
  top_error_signature?: string | null;
  failures_count?: number | null;
  intent_type?: string | null;
  initiative_title?: string | null;
  initiative_id?: string | null;
};

function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "succeeded") return "success";
  if (status === "failed") return "error";
  if (status === "running" || status === "queued") return "warning";
  return "neutral";
}

const RUNS_POLL_MS = 10_000; // poll so status updates (cancel, reaper) show up

function RunsPageSkeleton() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Pipeline Runs" description="Orchestration run history. Filter by pipeline type and status." />
        <CardSection>
          <LoadingSkeleton className="h-64 w-full rounded-md" />
        </CardSection>
      </Stack>
    </PageFrame>
  );
}

function RunsPageContent() {
  const searchParams = useSearchParams();
  const { environment } = useEnvironment();
  const intentFromUrl = searchParams.get("intent_type") ?? "";
  const [intentFilter, setIntentFilter] = useState<string>(intentFromUrl);
  const [confirmingRunId, setConfirmingRunId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  useEffect(() => {
    if (intentFromUrl && intentFilter !== intentFromUrl) setIntentFilter(intentFromUrl);
  }, [intentFromUrl]);
  const { data, isLoading, error } = useRuns(
    { limit: 50, intent_type: intentFilter || undefined, environment },
    { refetchInterval: RUNS_POLL_MS }
  );
  const cancelRun = useCancelRun();
  const items = (data?.items ?? []) as RunRow[];

  function openCancelConfirm(runId: string) {
    setConfirmingRunId(runId);
  }

  function confirmCancelRun() {
    const runId = confirmingRunId;
    setConfirmingRunId(null);
    if (!runId) return;
    setCancellingId(runId);
    cancelRun.mutateAsync({ runId }).finally(() => setCancellingId(null));
  }

  const columns: Column<RunRow>[] = [
    {
      key: "id",
      header: "Run ID",
      render: (row) => (
        <Link href={`/runs/${row.id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
          {row.id.slice(0, 8)}…
        </Link>
      ),
    },
    {
      key: "intent_type",
      header: "Pipeline",
      render: (row) => {
        const label = INTENT_TYPES.find((t) => t.value === row.intent_type)?.label ?? row.intent_type ?? "—";
        return <Badge variant="neutral">{label}</Badge>;
      },
    },
    { key: "environment", header: "Env" },
    { key: "cohort", header: "Cohort", render: (row) => row.cohort ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    },
    {
      key: "started_at",
      header: "Started",
      render: (row) => (row.started_at ? new Date(row.started_at).toLocaleString() : "—"),
    },
    { key: "failures_count", header: "Failures", render: (row) => String(row.failures_count ?? 0) },
    {
      key: "top_error_signature",
      header: "Top error",
      render: (row) => (
        <span className="max-w-[200px] truncate block" title={row.top_error_signature ?? ""}>
          {row.top_error_signature ?? "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const active = row.status === "running" || row.status === "queued";
        if (!active) return null;
        const busy = cancellingId === row.id;
        return (
          <Button
            variant="secondary"
            size="sm"
            disabled={!!cancellingId}
            onClick={() => openCancelConfirm(row.id)}
          >
            {busy ? "…" : "Cancel"}
          </Button>
        );
      },
    },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Pipeline Runs" description="Orchestration run history." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {formatApiError(error)}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  if (isLoading) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Pipeline Runs" description="Orchestration run history." />
          <CardSection>
            <LoadingSkeleton className="h-64 w-full rounded-md" />
          </CardSection>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Pipeline Runs"
          description="Orchestration run history. Filter by pipeline type (dev vs marketing). Runs are created when you start a plan; failed runs appear here once the run has started."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/plans" className="text-brand-600 hover:underline">Plans</Link> · <Link href="/jobs" className="text-brand-600 hover:underline">Jobs</Link> · <Link href="/graph/repair-preview" className="text-brand-600 hover:underline">Repair Preview</Link> · <Link href="/graph/deploys" className="text-brand-600 hover:underline">Deploy events</Link>
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <label htmlFor="intent-filter" className="text-body-small text-text-muted">Pipeline</label>
          <select
            id="intent-filter"
            value={intentFilter}
            onChange={(e) => setIntentFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm"
          >
            <option value="">All</option>
            {INTENT_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <details className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-body-small text-text-muted">
          <summary className="cursor-pointer font-medium text-text-primary">Common Top errors and what to do</summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-body-small">
            <li><strong>lease_expired</strong> — Worker stopped or lost heartbeat. Ensure the Runner (Render worker) is Running and check its logs.</li>
            <li><strong>LLM_GATEWAY_URL is not set</strong> — Set <code>LLM_GATEWAY_URL</code> or <code>OPENAI_API_KEY</code> on the Render worker (e.g. ai-factory-runner-staging). Or set <code>LLM_GATEWAY_URL</code> on the Control Plane and use self-heal to sync to the worker.</li>
            <li><strong>LLM gateway error 404</strong> — Check <code>LLM_GATEWAY_URL</code> on the worker and that the gateway is up (<code>/health</code>).</li>
            <li><strong>current transaction is aborted</strong> — Redeploy Control Plane (and Runner) from <code>main</code> so savepoint fixes are live. Old runs will still show this until you start new runs.</li>
          </ul>
        </details>
        <CardSection>
          {items.length === 0 ? (
            <EmptyState
              title={intentFilter === "email_design_generator" ? "No email design generator runs yet" : "No runs yet"}
              description={
                intentFilter === "email_design_generator"
                  ? "Email design generator runs appear after you finish the wizard (Generate) or click Start run on an email design plan. If you just ran the wizard, set Pipeline to All and check the top of the list (newest first). If you see an error on the Generate page (e.g. Start run failed), the run was not created—fix that error and try again."
                  : "Create an initiative and run a plan to see runs here."
              }
            />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(row) => row.id} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>

      <AlertDialog open={confirmingRunId !== null} onOpenChange={(open) => !open && setConfirmingRunId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel run?</AlertDialogTitle>
            <AlertDialogDescription>This run will be marked failed. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelRun} className="bg-red-600 hover:bg-red-700 !text-white opacity-100 focus-visible:ring-red-500">
              Cancel run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}

export default function RunsPage() {
  return (
    <Suspense fallback={<RunsPageSkeleton />}>
      <RunsPageContent />
    </Suspense>
  );
}
