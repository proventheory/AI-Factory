"use client";

import { useEffect, useState } from "react";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton } from "@/components/ui";
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

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Secrets"
          description="Secret reference metadata only; values are never displayed. Filter by scope."
        />
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
        )}
        <div className="mb-4">
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="rounded-md border border-border-default bg-surface-default px-3 py-1.5 text-body-small">
            <option value="">All scopes</option>
            <option value="sandbox">sandbox</option>
            <option value="staging">staging</option>
            <option value="prod">prod</option>
          </select>
        </div>
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No secret refs" description="No secret references configured." />
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
