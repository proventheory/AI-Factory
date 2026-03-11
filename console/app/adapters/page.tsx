"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton } from "@/components/ui";
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
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-caption-small">{String(r.id).slice(0, 8)}…</span> },
    { key: "name", header: "Name" },
    { key: "version", header: "Version" },
    { key: "capabilities", header: "Capabilities", render: (r) => <span className="text-body-small">{(r.capabilities ?? []).join(", ") || "—"}</span> },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Adapters"
          description="Registered adapters (third-party integrations) used by job runs for tool calls."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/tool-calls" className="text-brand-600 hover:underline">Tool Calls</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
        )}
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No adapters" description="No adapters registered yet." />
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
