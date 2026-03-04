"use client";

export const dynamic = "force-dynamic";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { usePlan } from "@/hooks/use-api";

type PlanEdgeRow = { id: string; plan_id: string; from_node_id: string; to_node_id: string; condition?: string };

function PlanEdgesContent() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("plan_id");
  const { data, isLoading, error } = usePlan(planId);

  const columns: Column<PlanEdgeRow>[] = [
    { key: "from_node_id", header: "From", render: (row) => <span className="font-mono text-caption-small">{row.from_node_id.slice(0, 8)}…</span> },
    { key: "to_node_id", header: "To", render: (row) => <span className="font-mono text-caption-small">{row.to_node_id.slice(0, 8)}…</span> },
    { key: "condition", header: "Condition", render: (row) => row.condition ? <Badge variant="neutral">{row.condition}</Badge> : "—" },
    { key: "id", header: "ID", render: (row) => <span className="font-mono text-caption-small">{row.id.slice(0, 8)}…</span> },
  ];

  const edges = (data as { edges?: PlanEdgeRow[] })?.edges ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Plan Edges" description={planId ? `Edges for plan ${planId.slice(0, 8)}…` : "Select a plan to view edges. Add ?plan_id=UUID to the URL."} />
        <CardSection>
          {!planId ? (
            <EmptyState title="No plan selected" description="Navigate to a plan detail page and click 'View Edges', or add ?plan_id=UUID to the URL." />
          ) : isLoading ? (
            <LoadingSkeleton className="h-64 w-full rounded-md" />
          ) : error ? (
            <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{(error as Error).message}</div>
          ) : edges.length > 0 ? (
            <TableFrame>
              <DataTable columns={columns} data={edges} keyExtractor={(row) => row.id} />
            </TableFrame>
          ) : (
            <EmptyState title="No edges in this plan" />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}

export default function AdminPlanEdgesPage() {
  return (
    <Suspense fallback={<LoadingSkeleton className="h-64 w-full rounded-md" />}>
      <PlanEdgesContent />
    </Suspense>
  );
}
