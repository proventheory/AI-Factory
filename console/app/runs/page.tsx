"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useRuns } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

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
};

function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "succeeded") return "success";
  if (status === "failed") return "error";
  if (status === "running" || status === "queued") return "warning";
  return "neutral";
}

export default function RunsPage() {
  const { data, isLoading, error } = useRuns({ limit: 50 });
  const items = (data?.items ?? []) as RunRow[];

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
          description="Orchestration run history. Create an initiative and run a plan to see runs here."
        />
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
    </PageFrame>
  );
}
