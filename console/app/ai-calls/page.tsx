"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, DataTable, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useLlmCalls } from "@/hooks/use-api";

export default function AiCallsPage() {
  const { data, isLoading, error } = useLlmCalls({ limit: 50 });
  const items = data?.items ?? [];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="AI Calls" description="LLM call history with tokens and latency." />
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
          title="AI Calls"
          description="LLM call history with tokens and latency. Only runs that execute LLM-backed nodes insert here."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/cost-dashboard" className="text-brand-600 hover:underline">Cost Dashboard</Link> · <Link href="/llm-budgets" className="text-brand-600 hover:underline">LLM Budgets</Link>
        </p>
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : items.length === 0 ? (
          <CardSection>
            <EmptyState title="No AI calls yet" description="LLM calls are recorded when pipeline runs execute nodes that use the LLM (email generation, copy, etc.)." />
          </CardSection>
        ) : (
          <CardSection>
          <TableFrame>
            <DataTable
              columns={([
                { key: "id", header: "ID", render: (r) => r.id?.slice(0, 8) + "…" },
                { key: "job_run_id", header: "Job Run", render: (r) => r.job_run_id?.slice(0, 8) + "…" },
                { key: "model_id", header: "Model" },
                { key: "tokens_in", header: "Tokens In" },
                { key: "tokens_out", header: "Tokens Out" },
                { key: "latency_ms", header: "Latency (ms)" },
              ]) as Column<import("@/lib/api").LlmCallRow>[]}
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
