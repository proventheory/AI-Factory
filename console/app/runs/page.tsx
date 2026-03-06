"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge, Button, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useRuns, useCancelRun } from "@/hooks/use-api";
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

export default function RunsPage() {
  const [intentFilter, setIntentFilter] = useState<string>("");
  const [confirmingRunId, setConfirmingRunId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { data, isLoading, error } = useRuns(
    { limit: 50, intent_type: intentFilter || undefined },
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
          description="Orchestration run history. Filter by pipeline type (dev vs marketing)."
        />
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
        <CardSection>
          {items.length === 0 ? (
            <EmptyState
              title="No runs yet"
              description="Create an initiative and run a plan to see runs here."
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
            <AlertDialogAction onClick={confirmCancelRun} className="bg-red-600 hover:bg-red-700">
              Cancel run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
