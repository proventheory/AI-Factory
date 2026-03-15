"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useCheckpoints } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function GraphCheckpointsPage() {
  const { data, isLoading, error } = useCheckpoints({ limit: 50 });
  const items = data?.items ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Checkpoints"
          description="Graph checkpoints for scope."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/graph/checkpoint-diff" className="text-brand-600 hover:underline">Checkpoint diff</Link> · <Link href="/graph/change-impact" className="text-brand-600 hover:underline">Change Impact</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        )}
        <CardSection title="Checkpoints">
          {isLoading ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No checkpoints" description="Create checkpoints for scope to track schema/contract state." />
          ) : (
            <DataTable
              columns={[
                { key: "checkpoint_id", header: "ID", render: (r: { checkpoint_id: string }) => <Link href={`/graph/checkpoint-diff?id=${encodeURIComponent(r.checkpoint_id)}`} className="text-brand-600 hover:underline font-mono text-xs">{r.checkpoint_id.slice(0, 8)}…</Link> },
                { key: "scope_type", header: "Scope type" },
                { key: "scope_id", header: "Scope ID" },
                { key: "run_id", header: "Run", render: (r: { run_id?: string | null }) => r.run_id ?? "—" },
                { key: "created_at", header: "Created", render: (r: { created_at?: string }) => r.created_at ? new Date(r.created_at).toLocaleString() : "—" },
              ]}
              data={items}
              keyExtractor={(r: { checkpoint_id: string }) => r.checkpoint_id}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
