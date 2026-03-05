"use client";

import { PageFrame, Stack, TableFrame, PageHeader, LoadingSkeleton, DataTable } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useRoutingPolicies } from "@/hooks/use-api";

export default function RoutingPoliciesPage() {
  const { data, isLoading, error } = useRoutingPolicies();

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Routing Policies" />
          <p className="text-red-600">Error: {String(error)}</p>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Routing Policies"
          description="Model routing by job type."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <TableFrame>
            <DataTable
              columns={([
                { key: "job_type", header: "Job Type" },
                { key: "model_tier", header: "Model Tier" },
                { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
              ]) as Column<{ job_type: string; model_tier: string; active: boolean; id: string }>[]}
              data={data?.items ?? []}
              keyExtractor={(r) => r.id}
            />
          </TableFrame>
        )}
      </Stack>
    </PageFrame>
  );
}
