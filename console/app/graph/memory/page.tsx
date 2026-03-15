"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useIncidentMemory } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function GraphMemoryPage() {
  const { data, isLoading, error } = useIncidentMemory({ limit: 50 });
  const items = data?.items ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Memory (incidents)"
          description="Incident resolutions used by the decision loop and repair planning."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/incidents" className="text-brand-600 hover:underline">Incidents</Link> · <Link href="/graph/failure-clusters" className="text-brand-600 hover:underline">Failure clusters</Link> · <Link href="/graph/decision-loop" className="text-brand-600 hover:underline">Decision loop</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        )}
        <CardSection title="Incident memory">
          {isLoading ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No incident memory" description="Resolutions will appear here as incidents are resolved." />
          ) : (
            <DataTable
              columns={[
                { key: "memory_id", header: "ID", render: (r: { memory_id?: string }) => <span className="font-mono text-xs">{r.memory_id?.slice(0, 8)}…</span> },
                { key: "failure_class", header: "Failure class" },
                { key: "failure_signature", header: "Signature", render: (r: { failure_signature?: string }) => (r.failure_signature ?? "—").slice(0, 40) + ((r.failure_signature?.length ?? 0) > 40 ? "…" : "") },
                { key: "resolution", header: "Resolution", render: (r: { resolution?: string }) => (r.resolution ?? "—").slice(0, 50) + ((r.resolution?.length ?? 0) > 50 ? "…" : "") },
                { key: "times_seen", header: "Seen" },
                { key: "last_seen_at", header: "Last seen", render: (r: { last_seen_at?: string }) => r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : "—" },
              ]}
              data={items}
              keyExtractor={(r: { memory_id: string }) => r.memory_id}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
