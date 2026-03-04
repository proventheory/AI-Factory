"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui";
import { Badge } from "@/components/ui";
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
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
    { key: "job_run_id", header: "Job run", render: (r) => <span className="font-mono text-xs">{r.job_run_id.slice(0, 8)}…</span> },
    { key: "capability", header: "Capability" },
    { key: "operation_key", header: "Operation" },
    { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "succeeded" ? "success" : r.status === "failed" ? "error" : "neutral"}>{r.status}</Badge> },
    { key: "started_at", header: "Started", render: (r) => r.started_at ? new Date(r.started_at).toLocaleString() : "—" },
  ];

  if (error) return <p className="text-red-600">Error: {error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Tool Calls</h1>
      <div className="flex gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
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
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-48"
        />
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <p className="p-6 text-slate-500">Loading...</p>
        ) : (
          <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
        )}
      </div>
    </div>
  );
}
