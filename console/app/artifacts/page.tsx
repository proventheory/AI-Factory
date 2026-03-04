"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Input, Select } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useArtifacts } from "@/hooks/use-api";
import type { ArtifactRow } from "@/lib/api";

export default function ArtifactsPage() {
  const [classFilter, setClassFilter] = useState("");
  const [runFilter, setRunFilter] = useState("");
  const { data, isLoading, error } = useArtifacts({
    limit: 50,
    artifact_class: classFilter || undefined,
    run_id: runFilter || undefined,
  });
  const items = data?.items ?? [];

  const columns: Column<ArtifactRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-caption-small">{r.id.slice(0, 8)}…</span> },
    {
      key: "run_id",
      header: "Run",
      render: (r) => (r.run_id ? <Link href={`/runs/${r.run_id}`} className="font-mono text-caption-small text-brand-600 hover:underline">{r.run_id.slice(0, 8)}…</Link> : "—"),
    },
    { key: "artifact_class", header: "Class", render: (r) => (r as ArtifactRow & { artifact_class?: string }).artifact_class ?? "—" },
    { key: "artifact_type", header: "Type" },
    { key: "uri", header: "URI", render: (r) => <span className="truncate max-w-[200px] block" title={r.uri}>{r.uri}</span> },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Artifacts" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {(error as Error).message}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Artifacts"
          description="Outputs produced by pipeline runs."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-48"
          >
            <option value="">All classes</option>
            <option value="logs">logs</option>
            <option value="docs">docs</option>
            <option value="external_object_refs">external_object_refs</option>
            <option value="schema_bundles">schema_bundles</option>
            <option value="build_outputs">build_outputs</option>
          </Select>
          <Input
            type="text"
            placeholder="Run ID"
            value={runFilter}
            onChange={(e) => setRunFilter(e.target.value)}
            className="w-48"
          />
        </div>
        <CardSection>
          {isLoading ? (
            <LoadingSkeleton className="h-64 w-full rounded-md" />
          ) : items.length === 0 ? (
            <EmptyState title="No artifacts yet" description="Run a plan to produce artifacts." />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
