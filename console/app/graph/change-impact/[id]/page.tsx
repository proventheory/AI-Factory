"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useChangeEvent, useChangeEventImpacts } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function ChangeEventDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { data: event, isLoading: eventLoading, error: eventError } = useChangeEvent(id || null);
  const { data: impactsData, isLoading: impactsLoading } = useChangeEventImpacts(id || null);
  const impacts = impactsData?.items ?? [];

  if (!id) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Change event" description="Change event detail." />
          <EmptyState title="Missing ID" description="No change event ID in URL." />
        </Stack>
      </PageFrame>
    );
  }

  const error = eventError;
  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Change event" description="Change event and graph impacts." />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/graph/change-impact" className="text-brand-600 hover:underline">Change Impact</Link> · <Link href="/graph/checkpoints" className="text-brand-600 hover:underline">Checkpoints</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        )}
        <CardSection title="Event">
          {eventLoading ? (
            <LoadingSkeleton className="h-20 rounded-lg" />
          ) : event ? (
            <dl className="grid grid-cols-1 gap-2 text-body-small">
              <div><dt className="text-text-muted">ID</dt><dd className="font-mono">{event.change_event_id}</dd></div>
              <div><dt className="text-text-muted">Source type</dt><dd>{event.source_type ?? "—"}</dd></div>
              <div><dt className="text-text-muted">Change class</dt><dd>{event.change_class ?? "—"}</dd></div>
              <div><dt className="text-text-muted">Summary</dt><dd>{event.summary ?? "—"}</dd></div>
              <div><dt className="text-text-muted">Created</dt><dd>{event.created_at ? new Date(event.created_at).toLocaleString() : "—"}</dd></div>
            </dl>
          ) : null}
        </CardSection>
        <CardSection title="Impacts">
          {impactsLoading ? (
            <LoadingSkeleton className="h-24 rounded-lg" />
          ) : impacts.length === 0 ? (
            <EmptyState title="No impacts" description="No graph impacts for this change event." />
          ) : (
            <DataTable
              columns={[
                { key: "impact_id", header: "Impact ID", render: (r: { impact_id?: string }) => <span className="font-mono text-xs">{r.impact_id?.slice(0, 8)}…</span> },
                { key: "plan_id", header: "Plan" },
                { key: "plan_node_id", header: "Node" },
                { key: "impact_type", header: "Type" },
                { key: "reason", header: "Reason" },
              ]}
              data={impacts}
              keyExtractor={(r: { impact_id: string }) => r.impact_id}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
