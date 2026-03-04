"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useJobRuns } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import type { JobRunRow } from "@/lib/api";

const resource = getResource("job_runs")!;

export default function AdminJobRunsListPage() {
  const { data, isLoading, error } = useJobRuns({ limit: 50 });
  const items = data?.items ?? [];

  const columns: Column<JobRunRow>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/admin/job_runs/${row.id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
          {String(row.id).slice(0, 8)}…
        </Link>
      ),
    },
    { key: "run_id", header: "Run", render: (row) => <Link href={`/admin/runs/${row.run_id}`} className="font-mono text-caption-small text-brand-600 hover:underline">{String(row.run_id).slice(0, 8)}…</Link> },
    { key: "plan_node_id", header: "Plan Node", render: (row) => String(row.plan_node_id).slice(0, 8) + "…" },
    { key: "status", header: "Status", render: (row) => <Badge variant={row.status === "succeeded" ? "success" : row.status === "failed" ? "error" : "neutral"}>{row.status}</Badge> },
    { key: "started_at", header: "Started", render: (row) => row.started_at ? new Date(row.started_at).toLocaleString() : "—" },
    { key: "finished_at", header: "Finished", render: (row) => row.finished_at ? new Date(row.finished_at).toLocaleString() : "—" },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title={resource.label} description="Admin list" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {(error as Error).message}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  if (isLoading) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title={resource.label} description="Admin list" />
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
        <PageHeader title={resource.label} description="Admin list — internal use only." />
        <CardSection>
          {items.length === 0 ? (
            <EmptyState title="No job runs yet." />
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
