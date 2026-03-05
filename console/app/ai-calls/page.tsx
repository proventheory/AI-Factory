"use client";

import { PageFrame, Stack, TableFrame, PageHeader, LoadingSkeleton, DataTable } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useLlmCalls } from "@/hooks/use-api";

export default function AiCallsPage() {
  const { data, isLoading, error } = useLlmCalls({ limit: 50 });

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="AI Calls" />
          <p className="text-red-600">Error: {String(error)}</p>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="AI Calls"
          description="LLM call history with tokens and latency."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
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
              data={data?.items ?? []}
              keyExtractor={(r) => r.id}
            />
          </TableFrame>
        )}
      </Stack>
    </PageFrame>
  );
}
