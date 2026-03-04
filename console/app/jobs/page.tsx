"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type JobRunRow = {
  id: string;
  run_id: string;
  plan_node_id: string;
  attempt: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  error_signature: string | null;
  environment: string;
  node_key: string;
  job_type: string;
  active_worker_id: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
};

export default function JobsPage() {
  const [items, setItems] = useState<JobRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [envFilter, setEnvFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (envFilter) params.set("environment", envFilter);
    params.set("limit", "50");
    fetch(`${API}/v1/job_runs?${params}`)
      .then((r) => r.json())
      .then((d: { items?: JobRunRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter, envFilter]);

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Jobs" />
          <p className="text-red-600">Error: {error}</p>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Jobs"
          description="Job run history and status."
        />
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">All environments</option>
            <option value="sandbox">sandbox</option>
            <option value="staging">staging</option>
            <option value="prod">prod</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">All statuses</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <CardSection>
          {loading ? (
            <p className="text-slate-500">Loading...</p>
          ) : (
            <TableFrame>
              <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium">Job run ID</th>
                <th className="text-left p-3 font-medium">Run</th>
                <th className="text-left p-3 font-medium">Node / type</th>
                <th className="text-left p-3 font-medium">Attempt</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Worker</th>
                <th className="text-left p-3 font-medium">Started</th>
                <th className="text-left p-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-slate-500 text-center">
                    No job runs.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs">{row.id.slice(0, 8)}…</td>
                    <td className="p-3">
                      <Link href={`/runs/${row.run_id}`} className="text-brand-600 hover:underline font-mono text-xs">
                        {row.run_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="p-3">{row.node_key} / {row.job_type}</td>
                    <td className="p-3">{row.attempt}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        row.status === "succeeded" ? "bg-green-100 text-green-800" :
                        row.status === "failed" ? "bg-red-100 text-red-800" :
                        row.status === "running" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3">{row.active_worker_id ?? "—"}</td>
                    <td className="p-3">{row.started_at ? new Date(row.started_at).toLocaleString() : "—"}</td>
                    <td className="p-3 max-w-[180px] truncate" title={row.error_signature ?? ""}>{row.error_signature ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
              </table>
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
