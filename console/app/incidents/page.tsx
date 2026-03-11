"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type IncidentRow = { error_signature: string; environment: string; run_count: number; last_seen: string | null };

export default function IncidentsPage() {
  const [items, setItems] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [envFilter, setEnvFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (envFilter) params.set("environment", envFilter);
    params.set("limit", "100");
    fetch(`${API}/v1/incidents?${params}`)
      .then((r) => r.json())
      .then((d: { items?: IncidentRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [envFilter]);

  const columns: Column<IncidentRow>[] = [
    { key: "error_signature", header: "Error signature", render: (r) => (
      <Link href={`/incidents/${encodeURIComponent(r.error_signature)}`} className="text-brand-600 hover:underline font-mono text-caption-small truncate max-w-[240px] block" title={r.error_signature}>{r.error_signature}</Link>
    )},
    { key: "environment", header: "Environment" },
    { key: "run_count", header: "Runs" },
    { key: "last_seen", header: "Last seen", render: (r) => r.last_seen ? new Date(r.last_seen).toLocaleString() : "—" },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Incidents" description="Error signatures from failed job runs." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {error}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Incidents"
          description="Clustered by error signature. Click a signature to see affected runs."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link> · <Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link> · <Link href="/graph/failure-clusters" className="text-brand-600 hover:underline">Failure clusters</Link>
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <label htmlFor="incidents-env" className="text-body-small text-text-muted">Environment</label>
          <select
            id="incidents-env"
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm"
          >
            <option value="">All</option>
            <option value="sandbox">sandbox</option>
            <option value="staging">staging</option>
            <option value="prod">prod</option>
          </select>
        </div>
        <CardSection>
          {loading ? (
            <p className="p-6 text-text-muted">Loading...</p>
          ) : items.length === 0 ? (
            <EmptyState title="No incidents" description="No failed job runs with error signatures yet." />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(r) => `${r.error_signature}:${r.environment}`} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
