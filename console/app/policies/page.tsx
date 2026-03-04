"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type PolicyRow = { version: string; created_at: string; rules_json?: unknown };

export default function PoliciesPage() {
  const [items, setItems] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/v1/policies?limit=100`)
      .then((r) => r.json())
      .then((d: { items?: PolicyRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<PolicyRow>[] = [
    { key: "version", header: "Version", render: (r) => <span className="font-mono font-medium">{r.version}</span> },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
    { key: "rules_json", header: "Rules", render: (r) => <span className="text-slate-500 text-xs">{r.rules_json ? "JSON" : "—"}</span> },
  ];

  if (error) return <p className="text-red-600">Error: {error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Policies</h1>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <p className="p-6 text-slate-500">Loading...</p>
        ) : items.length === 0 ? (
          <EmptyState title="No policies" description="No policy versions defined yet." />
        ) : (
          <DataTable columns={columns} data={items} keyExtractor={(r) => r.version} />
        )}
      </div>
    </div>
  );
}
