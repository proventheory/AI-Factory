"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useInitiatives } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import type { InitiativeRow } from "@/lib/api";

const resource = getResource("initiatives")!;

function riskVariant(risk: string): "success" | "warning" | "error" | "neutral" {
  if (risk === "high") return "error";
  if (risk === "med") return "warning";
  return "success";
}

export default function AdminInitiativesListPage() {
  const { data, isLoading, error } = useInitiatives({ limit: 50 });
  const items = data?.items ?? [];

  const columns: Column<InitiativeRow>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/admin/initiatives/${row.id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
          {String(row.id).slice(0, 8)}…
        </Link>
      ),
    },
    { key: "intent_type", header: "Intent Type" },
    { key: "title", header: "Title", render: (row) => row.title ?? "—" },
    { key: "risk_level", header: "Risk", render: (row) => <Badge variant={riskVariant(row.risk_level)}>{row.risk_level}</Badge> },
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
        <PageHeader
          title={resource.label}
          description="Admin list — internal use only."
          actions={
            <Link
              href="/admin/initiatives/new"
              className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-body-small font-medium text-white hover:bg-brand-700"
            >
              New
            </Link>
          }
        />
        <CardSection>
          {items.length === 0 ? (
            <EmptyState title="No initiatives yet." />
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
