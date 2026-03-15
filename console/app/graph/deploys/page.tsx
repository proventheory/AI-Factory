"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useDeployEvents } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function GraphDeploysPage() {
  const { data, isLoading, error } = useDeployEvents({ limit: 50 });
  const items = data?.items ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Deploy events"
          description="List builds; sync from Render or GitHub Actions; open a deploy to see repair plan and suggested file actions."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link> · <Link href="/graph/repair-preview" className="text-brand-600 hover:underline">Repair Preview</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        )}
        <CardSection title="Deploy events">
          {isLoading ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No deploy events" description="Sync from Render or GitHub Actions to populate." />
          ) : (
            <DataTable
              columns={[
                { key: "deploy_id", header: "ID", render: (r: { deploy_id: string }) => <span className="font-mono text-xs">{r.deploy_id.slice(0, 8)}…</span> },
                { key: "service_id", header: "Service", render: (r: { service_id?: string }) => r.service_id ?? "—" },
                { key: "status", header: "Status", render: (r: { status?: string }) => r.status ?? "—" },
                { key: "created_at", header: "Created", render: (r: { created_at?: string }) => r.created_at ? new Date(r.created_at).toLocaleString() : "—" },
              ]}
              data={items}
              keyExtractor={(r: { deploy_id: string }) => r.deploy_id}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
