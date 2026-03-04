"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useApprovals } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import type { ApprovalRow } from "@/lib/api";

const resource = getResource("approvals")!;

export default function AdminApprovalsListPage() {
  const { data, isLoading, error } = useApprovals({ limit: 50 });
  const items = data?.items ?? [];

  const columns: Column<ApprovalRow>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/admin/approvals/${row.id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
          {String(row.id).slice(0, 8)}…
        </Link>
      ),
    },
    { key: "type", header: "Type" },
    { key: "status", header: "Status", render: (row) => <Badge variant={row.status === "approved" ? "success" : row.status === "rejected" ? "error" : "neutral"}>{row.status}</Badge> },
    { key: "run_id", header: "Run", render: (row) => row.run_id ? String(row.run_id).slice(0, 8) + "…" : "—" },
    { key: "created_at", header: "Created", render: (row) => new Date(row.created_at).toLocaleString() },
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
            <EmptyState title="No approvals yet." />
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
