"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type AdapterRow = { id: string; name: string; version: string; capabilities: string[]; created_at: string };

export default function AdaptersPage() {
  const [items, setItems] = useState<AdapterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/v1/adapters?limit=100`)
      .then((r) => r.json())
      .then((d: { items?: AdapterRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<AdapterRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{String(r.id).slice(0, 8)}…</span> },
    { key: "name", header: "Name" },
    { key: "version", header: "Version" },
    { key: "capabilities", header: "Capabilities", render: (r) => <span className="text-sm">{(r.capabilities ?? []).join(", ") || "—"}</span> },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  if (error) return <p className="text-red-600">Error: {error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Adapters</h1>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <p className="p-6 text-slate-500">Loading...</p>
        ) : items.length === 0 ? (
          <EmptyState title="No adapters" description="No adapters registered yet." />
        ) : (
          <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
        )}
      </div>
    </div>
  );
}
