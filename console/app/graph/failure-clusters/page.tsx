"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useFailureClusters } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function FailureClustersPage() {
  const { data, isLoading, error } = useFailureClusters({ limit: 50 });
  const clusters = data?.clusters ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Failure clusters"
          description="Clusters by failure_class."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/incidents" className="text-brand-600 hover:underline">Incidents</Link> · <Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        )}
        <CardSection title="Failure clusters">
          {isLoading ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : clusters.length === 0 ? (
            <EmptyState title="No failure clusters" description="Clusters will appear from incident_memory data." />
          ) : (
            <DataTable
              columns={[
                { key: "failure_class", header: "Failure class" },
                { key: "count", header: "Count" },
                { key: "last_seen", header: "Last seen", render: (r: { last_seen?: string }) => r.last_seen ? new Date(r.last_seen).toLocaleString() : "—" },
              ]}
              data={clusters}
              keyExtractor={(r: { failure_class: string }) => r.failure_class}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
