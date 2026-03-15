"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useContractBreakageScan } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function SchemaContractsPage() {
  const { data, isLoading, error } = useContractBreakageScan();
  const contracts = data?.contracts ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Schema & contracts"
          description="Plan nodes with input/output_schema_ref and contract breakage scan."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/plans" className="text-brand-600 hover:underline">Plans</Link> · <Link href="/graph/explorer" className="text-brand-600 hover:underline">Graph Explorer</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        )}
        <CardSection title="Contracts at risk">
          {isLoading ? (
            <LoadingSkeleton className="h-32 rounded-lg" />
          ) : contracts.length === 0 ? (
            <EmptyState
              title="No contract refs"
              description={data?.message ?? "No plan nodes with input_schema_ref or output_schema_ref."}
            />
          ) : (
            <DataTable
              columns={[
                { key: "plan_id", header: "Plan ID", render: (r: { plan_id?: string }) => <span className="font-mono text-xs">{r.plan_id ?? "—"}</span> },
                { key: "node_key", header: "Node" },
                { key: "job_type", header: "Job type", render: (r: { job_type?: string }) => r.job_type ?? "—" },
                { key: "input_schema_ref", header: "Input schema", render: (r: { input_schema_ref?: string | null }) => r.input_schema_ref ?? "—" },
                { key: "output_schema_ref", header: "Output schema", render: (r: { output_schema_ref?: string | null }) => r.output_schema_ref ?? "—" },
              ]}
              data={contracts}
              keyExtractor={(r: { plan_node_id: string }) => r.plan_node_id}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
