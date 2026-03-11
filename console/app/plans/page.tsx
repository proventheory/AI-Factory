"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { usePlans } from "@/hooks/use-api";
import type { PlanRow } from "@/lib/api";

type PlanRowExtended = PlanRow & {
  plan_hash?: string;
  initiative_title?: string | null;
  intent_type?: string;
};

export default function PlansPage() {
  const { data, isLoading, error } = usePlans({ limit: 50 });
  const items = (data?.items ?? []) as PlanRowExtended[];

  const columns: Column<PlanRowExtended>[] = [
    {
      key: "id",
      header: "Plan ID",
      render: (row) => (
        <Link href={`/plans/${row.id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
          {row.id.slice(0, 8)}…
        </Link>
      ),
    },
    {
      key: "initiative_id",
      header: "Initiative",
      render: (row) => (
        <Link href={`/initiatives/${row.initiative_id}`} className="text-brand-600 hover:underline">
          {(row as PlanRowExtended).initiative_title ?? row.initiative_id.slice(0, 8)}…
        </Link>
      ),
    },
    { key: "intent_type", header: "Intent type", render: (row) => (row as PlanRowExtended).intent_type ?? "—" },
    {
      key: "plan_hash",
      header: "Plan hash",
      render: (row) => {
        const hash = (row as PlanRowExtended).plan_hash;
        return <span className="font-mono text-caption-small truncate max-w-[140px] block" title={hash}>{hash ? `${hash.slice(0, 16)}…` : "—"}</span>;
      },
    },
    { key: "created_at", header: "Created", render: (row) => new Date(row.created_at).toLocaleString() },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Plans" />
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
          <PageHeader title="Plans" description="Structured roadmaps from initiatives." />
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
          title="Plans"
          description="Structured roadmaps from initiatives. Create an initiative and generate a plan to see entries here."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/initiatives" className="text-brand-600 hover:underline">Initiatives</Link> · <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link> · <Link href="/graph/explorer" className="text-brand-600 hover:underline">Graph Explorer</Link> · <Link href="/graph/schema-contracts" className="text-brand-600 hover:underline">Schema & contracts</Link>
        </p>
        <CardSection>
          {items.length === 0 ? (
            <EmptyState
              title="No plans yet"
              description="Create an initiative and generate a plan to see entries here."
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
