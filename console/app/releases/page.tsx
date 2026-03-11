"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, EmptyState } from "@/components/ui";
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

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Releases"
          description="Release rollouts: draft, canary, promoted, rolled back. Tracks control plane, workplane, runner, and policy versions."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/policies" className="text-brand-600 hover:underline">Policies</Link>
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
        )}
        <div className="mb-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border-default bg-surface-default px-3 py-1.5 text-body-small"
          >
            <option value="">All statuses</option>
            <option value="draft">draft</option>
            <option value="canary">canary</option>
            <option value="promoted">promoted</option>
            <option value="rolled_back">rolled_back</option>
          </select>
        </div>
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No releases" description="No release records yet." />
          ) : (
            <TableFrame>
              <table className="w-full text-body-small">
                <thead className="bg-slate-50 border-b border-border-subtle">
                  <tr>
                    <th className="text-left p-3 font-medium text-text-muted">Release ID</th>
                    <th className="text-left p-3 font-medium text-text-muted">Status</th>
                    <th className="text-left p-3 font-medium text-text-muted">% rollout</th>
                    <th className="text-left p-3 font-medium text-text-muted">Workplane</th>
                    <th className="text-left p-3 font-medium text-text-muted">Runner digest</th>
                    <th className="text-left p-3 font-medium text-text-muted">Policy</th>
                    <th className="text-left p-3 font-medium text-text-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle hover:bg-slate-50">
                      <td className="p-3 font-mono text-caption-small">{row.id.slice(0, 8)}…</td>
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
                  ))}
                </tbody>
              </table>
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
