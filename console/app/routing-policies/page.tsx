"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, DataTable, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useRoutingPolicies } from "@/hooks/use-api";

export default function RoutingPoliciesPage() {
  const { data, isLoading, error } = useRoutingPolicies();
  const items = data?.items ?? [];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Routing Policies" description="Model routing by job type." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {String(error)}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Routing Policies"
          description="Model routing by job type (model tier, active flag)."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/llm-budgets" className="text-brand-600 hover:underline">LLM Budgets</Link> · <Link href="/cost-dashboard" className="text-brand-600 hover:underline">Cost Dashboard</Link>
        </p>
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : items.length === 0 ? (
          <CardSection>
            <EmptyState title="No routing policies" description="No routing policies configured yet." />
          </CardSection>
        ) : (
          <CardSection>
          <TableFrame>
            <DataTable
              columns={([
                { key: "job_type", header: "Job Type" },
                { key: "model_tier", header: "Model Tier" },
                { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
              ]) as Column<{ job_type: string; model_tier: string; active: boolean; id: string }>[]}
              data={items}
              keyExtractor={(r) => r.id}
            />
          </TableFrame>
          </CardSection>
        )}
      </Stack>
    </PageFrame>
  );
}
