"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, DataTable, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useGraphLineage } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function LineagePage() {
  const [artifactId, setArtifactId] = useState("");
  const [queryId, setQueryId] = useState("");
  const { data, isLoading, error } = useGraphLineage(queryId || null);
  const producers = data?.producers ?? [];
  const consumers = data?.consumers ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQueryId(artifactId.trim());
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Lineage viewer"
          description="Producer and consumers for an artifact."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/artifacts" className="text-brand-600 hover:underline">Artifacts</Link> · <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link>
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 mb-4">
          <label htmlFor="lineage-artifact" className="text-body-small text-text-muted">Artifact ID</label>
          <input
            id="lineage-artifact"
            type="text"
            value={artifactId}
            onChange={(e) => setArtifactId(e.target.value)}
            placeholder="e.g. artifact UUID"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm min-w-[240px] font-mono"
          />
          <button
            type="submit"
            disabled={!artifactId.trim() || isLoading}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-body-small text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Load lineage
          </button>
        </form>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger mb-4">{formatApiError(error)}</div>
        )}
        <CardSection title="Lineage">
          {!queryId ? (
            <EmptyState title="Enter an artifact ID" description="Type an artifact ID above and click Load lineage." />
          ) : isLoading ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : data ? (
            <div className="space-y-4">
              <p className="text-body-small text-text-muted">Artifact <span className="font-mono">{data.artifact_id}</span></p>
              <div>
                <p className="text-body-small font-medium mb-2">Producers ({producers.length})</p>
                {producers.length === 0 ? (
                  <p className="text-body-small text-text-muted">None</p>
                ) : (
                  <DataTable
                    columns={[{ key: "id", header: "ID" }, { key: "type", header: "Type" }]}
                    data={producers as Array<{ id?: string; type?: string }>}
                    keyExtractor={(r, i) => String((r as { id?: string }).id ?? i)}
                  />
                )}
              </div>
              <div>
                <p className="text-body-small font-medium mb-2">Consumers ({consumers.length})</p>
                {consumers.length === 0 ? (
                  <p className="text-body-small text-text-muted">None</p>
                ) : (
                  <DataTable
                    columns={[{ key: "id", header: "ID" }, { key: "type", header: "Type" }]}
                    data={consumers as Array<{ id?: string; type?: string }>}
                    keyExtractor={(r, i) => String((r as { id?: string }).id ?? i)}
                  />
                )}
              </div>
            </div>
          ) : null}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
