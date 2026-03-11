"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton } from "@/components/ui";
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
    { key: "rules_json", header: "Rules", render: (r) => <span className="text-text-muted text-caption-small">{r.rules_json ? "JSON" : "—"}</span> },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Policies"
          description="Policy versions and rules (used by releases and graph execution)."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/releases" className="text-brand-600 hover:underline">Releases</Link> · <Link href="/graph/decision-loop" className="text-brand-600 hover:underline">Decision loop</Link>
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
            <EmptyState title="No policies" description="No policy versions defined yet." />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(r) => r.version} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
