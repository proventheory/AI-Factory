"use client";

import { useEffect, useState } from "react";
import { formatApiError } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type ReleaseRow = {
  id: string;
  status: string;
  percent_rollout: number | null;
  control_plane_version: string | null;
  workplane_bundle_version: string | null;
  runner_image_digest: string | null;
  policy_version: string | null;
  created_at: string;
};

export default function ReleasesPage() {
  const [items, setItems] = useState<ReleaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", "50");
    fetch(`${API}/v1/releases?${params}`)
      .then((r) => r.json())
      .then((d: { items?: ReleaseRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  if (error) return <p className="text-red-600">Error: {error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Releases</h1>
      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">draft</option>
          <option value="canary">canary</option>
          <option value="promoted">promoted</option>
          <option value="rolled_back">rolled_back</option>
        </select>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <p className="p-6 text-slate-500">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium">Release ID</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">% rollout</th>
                <th className="text-left p-3 font-medium">Workplane</th>
                <th className="text-left p-3 font-medium">Runner digest</th>
                <th className="text-left p-3 font-medium">Policy</th>
                <th className="text-left p-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-slate-500 text-center">
                    No releases.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs">{row.id.slice(0, 8)}…</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        row.status === "promoted" ? "bg-green-100 text-green-800" :
                        row.status === "rolled_back" ? "bg-red-100 text-red-800" :
                        row.status === "canary" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3">{row.percent_rollout ?? "—"}</td>
                    <td className="p-3 truncate max-w-[120px]" title={row.workplane_bundle_version ?? ""}>{row.workplane_bundle_version ?? "—"}</td>
                    <td className="p-3 truncate max-w-[120px]" title={row.runner_image_digest ?? ""}>{row.runner_image_digest ? `${String(row.runner_image_digest).slice(0, 12)}…` : "—"}</td>
                    <td className="p-3">{row.policy_version ?? "—"}</td>
                    <td className="p-3">{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
