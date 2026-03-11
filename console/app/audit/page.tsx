"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type AuditRow = { source: string; id: string; run_id: string | null; job_run_id: string | null; event_type: string; created_at: string };

export default function AuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runIdFilter, setRunIdFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (runIdFilter) params.set("run_id", runIdFilter);
    params.set("limit", "100");
    fetch(`${API}/v1/audit?${params}`)
      .then((r) => r.json())
      .then((d: { items?: AuditRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runIdFilter]);

  const columns: Column<AuditRow>[] = [
    { key: "source", header: "Source" },
    { key: "event_type", header: "Event" },
    { key: "run_id", header: "Run", render: (r) => r.run_id ? <Link href={`/runs/${r.run_id}`} className="text-brand-600 hover:underline font-mono text-caption-small">{String(r.run_id).slice(0, 8)}…</Link> : "—" },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Audit"
          description="Audit trail of run and job events. Filter by run ID."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
        )}
        <div className="mb-4">
          <input type="text" placeholder="Run ID filter" value={runIdFilter} onChange={(e) => setRunIdFilter(e.target.value)} className="rounded-md border border-border-default bg-surface-default px-3 py-1.5 text-body-small w-56 font-mono" />
        </div>
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No audit events" description="Run and job events will appear here." />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(r) => `${r.source}-${r.id}`} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
