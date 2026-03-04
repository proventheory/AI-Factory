"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useArtifacts } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import type { ArtifactRow } from "@/lib/api";

const resource = getResource("artifacts")!;

export default function AdminArtifactsListPage() {
  const { data, isLoading, error } = useArtifacts({ limit: 50 });
  const items = data?.items ?? [];

  const columns: Column<ArtifactRow>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/admin/artifacts/${row.id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
          {String(row.id).slice(0, 8)}…
        </Link>
      ),
    },
    { key: "artifact_type", header: "Type" },
    { key: "uri", header: "URI", render: (row) => (row.uri?.slice(0, 40) ?? "—") + (row.uri && row.uri.length > 40 ? "…" : "") },
    { key: "producer_plan_node_id", header: "Producer Node", render: (row) => row.producer_plan_node_id ? String(row.producer_plan_node_id).slice(0, 8) + "…" : "—" },
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
            <EmptyState title="No artifacts yet." />
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
