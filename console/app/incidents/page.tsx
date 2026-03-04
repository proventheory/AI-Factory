"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui";
import { EmptyState } from "@/components/ui";
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

  if (error) return <p className="text-state-danger">Error: {error}</p>;

  return (
    <div>
      <h1 className="text-heading-2 font-bold text-text-primary mb-6">Incidents</h1>
      <div className="flex gap-4 mb-4">
        <select value={envFilter} onChange={(e) => setEnvFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-body-small">
          <option value="">All environments</option>
          <option value="sandbox">sandbox</option>
          <option value="staging">staging</option>
          <option value="prod">prod</option>
        </select>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? <p className="p-6 text-text-muted">Loading...</p> : items.length === 0 ? (
          <EmptyState title="No incidents" description="No failed job runs with error signatures yet." />
        ) : (
          <DataTable columns={columns} data={items} keyExtractor={(r) => r.error_signature} />
        )}
      </div>
    </div>
  );
}
