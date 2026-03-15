"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useChangeEvents } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function ChangeImpactPage() {
  const { data, isLoading, error } = useChangeEvents({ limit: 50 });
  const items = data?.items ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Change Impact"
          description="Compute and view graph impacts for change events."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/graph/checkpoints" className="text-brand-600 hover:underline">Checkpoints</Link> · <Link href="/graph/repair-preview" className="text-brand-600 hover:underline">Repair Preview</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        )}
        <CardSection title="Change events">
          {isLoading ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No change events" description="Change events will appear here when created." />
          ) : (
            <DataTable
              columns={[
                { key: "change_event_id", header: "ID", render: (r: { change_event_id: string }) => <Link href={`/graph/change-impact/${r.change_event_id}`} className="text-brand-600 hover:underline font-mono text-xs">{r.change_event_id.slice(0, 8)}…</Link> },
                { key: "source_type", header: "Source" },
                { key: "change_class", header: "Class" },
                { key: "summary", header: "Summary", render: (r: { summary?: string | null }) => (r.summary ?? "—").slice(0, 60) + ((r.summary?.length ?? 0) > 60 ? "…" : "") },
                { key: "created_at", header: "Created", render: (r: { created_at?: string }) => r.created_at ? new Date(r.created_at).toLocaleString() : "—" },
              ]}
              data={items}
              keyExtractor={(r: { change_event_id: string }) => r.change_event_id}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
