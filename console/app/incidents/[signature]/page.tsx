"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type JobRunRow = { id: string; run_id: string; started_at: string | null; ended_at: string | null; error_message: string | null; environment: string };

export default function IncidentDetailPage() {
  const params = useParams();
  const signature = params.signature as string;
  const [items, setItems] = useState<JobRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signature) return;
    fetch(`${API}/v1/incidents/${encodeURIComponent(signature)}?limit=50`)
      .then((r) => r.json())
      .then((d: { items?: JobRunRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [signature]);

  const columns: Column<JobRunRow>[] = [
    {
      key: "run_id",
      header: "Run",
      render: (r) => (
        <Link href={`/runs/${r.run_id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
          {r.run_id.slice(0, 8)}…
        </Link>
      ),
    },
    { key: "id", header: "Job run ID", render: (r) => <span className="font-mono text-caption-small">{r.id.slice(0, 8)}…</span> },
    { key: "environment", header: "Env" },
    { key: "started_at", header: "Started", render: (r) => (r.started_at ? new Date(r.started_at).toLocaleString() : "—") },
    { key: "error_message", header: "Error", render: (r) => <span className="max-w-[320px] truncate block text-caption-small" title={r.error_message ?? ""}>{r.error_message ?? "—"}</span> },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Incident detail" />
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
          title="Incident: error signature"
          description={decodeURIComponent(signature)}
        />
        <div className="mb-4">
          <Link href="/incidents" className="text-body-small text-brand-600 hover:underline">← Back to Incidents</Link>
        </div>
        <CardSection>
          {loading ? (
            <p className="p-6 text-text-muted">Loading...</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-text-muted">No job runs found for this signature.</p>
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
