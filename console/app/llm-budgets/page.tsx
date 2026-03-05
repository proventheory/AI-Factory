"use client";

import { PageFrame, Stack, TableFrame, PageHeader, LoadingSkeleton, DataTable } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import type { LlmBudgetRow } from "@/lib/api";
import { useLlmBudgets } from "@/hooks/use-api";

export default function LlmBudgetsPage() {
  const { data, isLoading, error } = useLlmBudgets({ limit: 50 });

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="LLM Budgets" />
          <p className="text-red-600">Error: {String(error)}</p>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="LLM Budgets"
          description="Token and spend budgets by scope."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
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
              data={data?.items ?? []}
              keyExtractor={(r) => r.id}
            />
          </TableFrame>
        )}
      </Stack>
    </PageFrame>
  );
}
