"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useCheckpoints, useCheckpointDiff } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

function CheckpointDiffContent() {
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const [selectedId, setSelectedId] = useState(idFromUrl ?? "");
  const queryId = selectedId || idFromUrl || "";
  const { data: listData } = useCheckpoints({ limit: 100 });
  const { data: diffData, isLoading, error } = useCheckpointDiff(queryId || null);
  const checkpoints = listData?.items ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label htmlFor="cp-diff-select" className="text-body-small text-text-muted">Checkpoint</label>
        <select
          id="cp-diff-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[200px]"
        >
          <option value="">Select checkpoint…</option>
          {checkpoints.map((cp: { checkpoint_id: string; scope_type: string; scope_id: string; created_at?: string }) => (
            <option key={cp.checkpoint_id} value={cp.checkpoint_id}>
              {cp.checkpoint_id.slice(0, 8)}… {cp.scope_type}/{cp.scope_id} {cp.created_at ? new Date(cp.created_at).toLocaleDateString() : ""}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">{formatApiError(error)}</div>
      )}
      <CardSection title="Checkpoint diff">
        {!queryId ? (
          <EmptyState title="Select a checkpoint" description="Choose a checkpoint above to view diff." />
        ) : isLoading ? (
          <LoadingSkeleton className="h-48 rounded-lg" />
        ) : diffData ? (
          <div className="space-y-3">
            <p className="text-body-small text-text-muted">
              Checkpoint <span className="font-mono">{diffData.checkpoint_id}</span> · Scope: {diffData.scope_type} / {diffData.scope_id} · Created: {diffData.created_at ? new Date(diffData.created_at).toLocaleString() : "—"}
            </p>
            {diffData.snapshot_diff != null ? (
              <pre className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-caption-small overflow-auto max-h-[300px]">
                {JSON.stringify(diffData.snapshot_diff, null, 2)}
              </pre>
            ) : (
              <p className="text-body-small text-text-muted">No diff available (current vs snapshot not computed).</p>
            )}
          </div>
        ) : null}
      </CardSection>
    </>
  );
}

export default function CheckpointDiffPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Checkpoint diff"
          description="Diff between checkpoints."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/graph/checkpoints" className="text-brand-600 hover:underline">Checkpoints</Link>
        </p>
        <Suspense fallback={<LoadingSkeleton className="h-24 rounded-lg" />}>
          <CheckpointDiffContent />
        </Suspense>
      </Stack>
    </PageFrame>
  );
}
