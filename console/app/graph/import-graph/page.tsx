"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useImportGraph } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function ImportGraphPage() {
  const [serviceId, setServiceId] = useState("");
  const [queryServiceId, setQueryServiceId] = useState("");
  const { data, isLoading, error, isFetching } = useImportGraph(queryServiceId || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQueryServiceId(serviceId.trim());
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Import graph"
          description="Per-service module graph used for deploy repair (e.g. missing file → files to commit)."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/graph/deploys" className="text-brand-600 hover:underline">Deploy events</Link>
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 mb-4">
          <label htmlFor="import-graph-service" className="text-body-small text-text-muted">Service ID</label>
          <input
            id="import-graph-service"
            type="text"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            placeholder="e.g. api-staging"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[160px]"
          />
          <button
            type="submit"
            disabled={!serviceId.trim() || isFetching}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-body-small text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {isFetching ? "Loading…" : "Load graph"}
          </button>
        </form>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">{formatApiError(error)}</div>
        )}
        <CardSection title="Import graph snapshot">
          {!queryServiceId ? (
            <EmptyState title="Enter a service ID" description="Type a service ID above and click Load graph." />
          ) : isLoading || isFetching ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : data == null ? (
            <EmptyState title="No import graph" description={`No snapshot found for service "${queryServiceId}".`} />
          ) : (
            <div className="space-y-2">
              <p className="text-body-small text-text-muted">
                Snapshot ID: <span className="font-mono">{data.snapshot_id}</span> · Created: {data.created_at ? new Date(data.created_at).toLocaleString() : "—"}
              </p>
              <pre className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-caption-small overflow-auto max-h-[400px]">
                {JSON.stringify(data.snapshot_json, null, 2)}
              </pre>
            </div>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
