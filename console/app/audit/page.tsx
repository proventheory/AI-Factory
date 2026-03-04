"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui";
import { EmptyState } from "@/components/ui";
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

  if (error) return <p className="text-state-danger">Error: {error}</p>;

  return (
    <div>
      <h1 className="text-heading-2 font-bold text-text-primary mb-6">Audit & events</h1>
      <div className="flex gap-4 mb-4">
        <input type="text" placeholder="Run ID filter" value={runIdFilter} onChange={(e) => setRunIdFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-body-small w-56" />
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? <p className="p-6 text-text-muted">Loading...</p> : items.length === 0 ? (
          <EmptyState title="No audit events" description="Run and job events will appear here." />
        ) : (
          <DataTable columns={columns} data={items} keyExtractor={(r) => `${r.source}-${r.id}`} />
        )}
      </div>
    </div>
  );
}
