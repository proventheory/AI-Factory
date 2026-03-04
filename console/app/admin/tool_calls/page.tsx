"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useToolCalls } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import type { ToolCallRow } from "@/lib/api";

const resource = getResource("tool_calls")!;

export default function AdminToolCallsListPage() {
  const { data, isLoading, error } = useToolCalls({ limit: 50 });
  const items = data?.items ?? [];

  const columns: Column<ToolCallRow>[] = [
    { key: "id", header: "ID", render: (row) => <span className="font-mono text-caption-small">{String(row.id).slice(0, 8)}…</span> },
    { key: "job_run_id", header: "Job Run", render: (row) => <Link href={`/admin/job_runs/${row.job_run_id}`} className="font-mono text-caption-small text-brand-600 hover:underline">{String(row.job_run_id).slice(0, 8)}…</Link> },
    { key: "capability", header: "Capability", render: (row) => row.capability ?? "—" },
    { key: "adapter_id", header: "Adapter", render: (row) => row.adapter_id ?? "—" },
    { key: "status", header: "Status", render: (row) => row.status ?? "—" },
    { key: "started_at", header: "Started", render: (row) => row.started_at ? new Date(row.started_at).toLocaleString() : "—" },
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
            <EmptyState title="No tool calls yet." />
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
