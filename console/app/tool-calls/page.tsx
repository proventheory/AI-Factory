"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, Badge, LoadingSkeleton, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type ToolCallRow = {
  id: string;
  job_run_id: string;
  adapter_id: string;
  capability: string;
  operation_key: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
};

export default function ToolCallsPage() {
  const [items, setItems] = useState<ToolCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [jobRunFilter, setJobRunFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (jobRunFilter) params.set("job_run_id", jobRunFilter);
    params.set("limit", "50");
    fetch(`${API}/v1/tool_calls?${params}`)
      .then((r) => r.json())
      .then((d: { items?: ToolCallRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter, jobRunFilter]);

  const columns: Column<ToolCallRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-caption-small">{r.id.slice(0, 8)}…</span> },
    { key: "job_run_id", header: "Job run", render: (r) => <Link href="/jobs" className="font-mono text-caption-small text-brand-600 hover:underline">{r.job_run_id.slice(0, 8)}…</Link> },
    { key: "capability", header: "Capability" },
    { key: "operation_key", header: "Operation" },
    { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "succeeded" ? "success" : r.status === "failed" ? "error" : "neutral"}>{r.status}</Badge> },
    { key: "started_at", header: "Started", render: (r) => r.started_at ? new Date(r.started_at).toLocaleString() : "—" },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Tool Calls"
          description="Adapter tool invocations from job runs (e.g. third-party APIs)."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link> · <Link href="/jobs" className="text-brand-600 hover:underline">Jobs</Link> · <Link href="/adapters" className="text-brand-600 hover:underline">Adapters</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border-default bg-surface-default px-3 py-1.5 text-body-small"
          >
            <option value="">All statuses</option>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
          </select>
          <input
            type="text"
            placeholder="Job run ID"
            value={jobRunFilter}
            onChange={(e) => setJobRunFilter(e.target.value)}
            className="rounded-md border border-border-default bg-surface-default px-3 py-1.5 text-body-small w-48 font-mono"
          />
        </div>
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No tool calls" description="Tool calls are recorded when job runs use adapters. Run a pipeline that invokes external tools." />
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
