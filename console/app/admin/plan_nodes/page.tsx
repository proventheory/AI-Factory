"use client";

export const dynamic = "force-dynamic";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { usePlan } from "@/hooks/use-api";

type PlanNodeRow = { id: string; plan_id: string; node_key: string; job_type: string; node_type: string; agent_role?: string; sequence?: number };

function PlanNodesContent() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("plan_id");
  const { data, isLoading, error } = usePlan(planId);

  const columns: Column<PlanNodeRow>[] = [
    { key: "sequence", header: "#", render: (row) => row.sequence ?? "—" },
    { key: "node_key", header: "Node Key" },
    { key: "job_type", header: "Job Type", render: (row) => <Badge variant="neutral">{row.job_type}</Badge> },
    { key: "node_type", header: "Type", render: (row) => <Badge variant={row.node_type === "approval" ? "warning" : "neutral"}>{row.node_type}</Badge> },
    { key: "agent_role", header: "Agent Role", render: (row) => row.agent_role ?? "—" },
    { key: "id", header: "ID", render: (row) => <span className="font-mono text-caption-small">{row.id.slice(0, 8)}…</span> },
  ];

  const nodes = (data as { nodes?: PlanNodeRow[] })?.nodes ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Plan Nodes" description={planId ? `Nodes for plan ${planId.slice(0, 8)}…` : "Select a plan to view nodes. Add ?plan_id=UUID to the URL."} />
        <CardSection>
          {!planId ? (
            <EmptyState title="No plan selected" description="Navigate to a plan detail page and click 'View Nodes', or add ?plan_id=UUID to the URL." />
          ) : isLoading ? (
            <LoadingSkeleton className="h-64 w-full rounded-md" />
          ) : error ? (
            <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{(error as Error).message}</div>
          ) : nodes.length > 0 ? (
            <TableFrame>
              <DataTable columns={columns} data={nodes} keyExtractor={(row) => row.id} />
            </TableFrame>
          ) : (
            <EmptyState title="No nodes in this plan" />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}

export default function AdminPlanNodesPage() {
  return (
    <Suspense fallback={<LoadingSkeleton className="h-64 w-full rounded-md" />}>
      <PlanNodesContent />
    </Suspense>
  );
}
