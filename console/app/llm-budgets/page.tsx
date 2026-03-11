"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, DataTable, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import type { LlmBudgetRow } from "@/lib/api";
import { useLlmBudgets } from "@/hooks/use-api";

export default function LlmBudgetsPage() {
  const { data, isLoading, error } = useLlmBudgets({ limit: 50 });
  const items = data?.items ?? [];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="LLM Budgets" description="Token and spend budgets by scope." />
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
          title="LLM Budgets"
          description="Token and spend budgets by scope (period, active). Used to gate or track LLM usage."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/cost-dashboard" className="text-brand-600 hover:underline">Cost Dashboard</Link> · <Link href="/ai-calls" className="text-brand-600 hover:underline">AI Calls</Link>
        </p>
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : items.length === 0 ? (
          <CardSection>
            <EmptyState title="No LLM budgets" description="No budget records yet. Create via API or admin." />
          </CardSection>
        ) : (
          <CardSection>
          <TableFrame>
            <DataTable
              columns={([
                { key: "scope_type", header: "Scope Type" },
                { key: "scope_value", header: "Scope Value" },
                { key: "budget_tokens", header: "Budget (tokens)" },
                { key: "budget_dollars", header: "Budget ($)" },
                { key: "period", header: "Period" },
                { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
              ]) as Column<LlmBudgetRow>[]}
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
