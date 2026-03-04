"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type SecretRefRow = { id: string; name: string; vault_path: string; scope: string; capabilities_allowed: string[] | null; rotated_at: string | null };

export default function SecretsPage() {
  const [items, setItems] = useState<SecretRefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (scopeFilter) params.set("scope", scopeFilter);
    params.set("limit", "100");
    fetch(`${API}/v1/secret_refs?${params}`)
      .then((r) => r.json())
      .then((d: { items?: SecretRefRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [scopeFilter]);

  const columns: Column<SecretRefRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-caption-small">{r.id.slice(0, 8)}…</span> },
    { key: "name", header: "Name" },
    { key: "vault_path", header: "Vault path", render: (r) => <span className="font-mono text-caption-small">{r.vault_path}</span> },
    { key: "scope", header: "Scope" },
    { key: "capabilities_allowed", header: "Capabilities", render: (r) => (r.capabilities_allowed ?? []).join(", ") || "—" },
    { key: "rotated_at", header: "Rotated", render: (r) => r.rotated_at ? new Date(r.rotated_at).toLocaleString() : "—" },
  ];

  if (error) return <p className="text-state-danger">Error: {error}</p>;

  return (
    <div>
      <h1 className="text-heading-2 font-bold text-text-primary mb-6">Secrets (refs only)</h1>
      <p className="text-body-small text-text-muted mb-4">Reference metadata only; values are never displayed.</p>
      <div className="flex gap-4 mb-4">
        <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-body-small">
          <option value="">All scopes</option>
          <option value="sandbox">sandbox</option>
          <option value="staging">staging</option>
          <option value="prod">prod</option>
        </select>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? <p className="p-6 text-text-muted">Loading...</p> : items.length === 0 ? (
          <EmptyState title="No secret refs" description="No secret references configured." />
        ) : (
          <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
        )}
      </div>
    </div>
  );
}
