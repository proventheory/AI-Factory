"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, TableFrame, LoadingSkeleton } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type Worker = { worker_id: string; last_heartbeat_at: string; runner_version: string | null };
type Lease = { job_run_id: string; worker_id: string; claimed_at: string; lease_expires_at: string; heartbeat_at: string };

export default function HealthPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [activeLeases, setActiveLeases] = useState<Lease[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/v1/health`)
      .then((r) => r.json())
      .then((d: { workers?: Worker[]; active_leases?: Lease[]; stale_leases_count?: number }) => {
        setWorkers(d.workers ?? []);
        setActiveLeases(d.active_leases ?? []);
        setStaleCount(d.stale_leases_count ?? 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Scheduler Health"
          description="Runner workers and active job leases. See Overview for queue depth and stale-lease counts."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/dashboard" className="text-brand-600 hover:underline">Overview</Link> shows stat cards and recent failed runs.
        </p>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
        )}
        {loading && <LoadingSkeleton className="h-48 rounded-lg" />}
        {!loading && !error && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <CardSection title="Workers">
              {workers.length === 0 ? (
                <p className="text-body-small text-text-muted">No workers registered. Runners must connect to the Control Plane to appear here.</p>
              ) : (
                <TableFrame>
                  <table className="w-full text-body-small">
                    <thead>
                      <tr className="text-left text-text-muted">
                        <th className="pb-2 pr-4">Worker ID</th>
                        <th className="pb-2 pr-4">Last heartbeat</th>
                        <th className="pb-2">Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map((w) => (
                        <tr key={w.worker_id} className="border-t border-border-subtle">
                          <td className="py-2 font-mono text-caption-small">{w.worker_id}</td>
                          <td className="py-2">{new Date(w.last_heartbeat_at).toLocaleString()}</td>
                          <td className="py-2">{w.runner_version ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableFrame>
              )}
            </CardSection>
            <CardSection title="Active leases">
              {staleCount > 0 && (
                <p className="text-body-small text-state-warning mb-2">Stale leases (heartbeat &gt; 2 min): {staleCount}</p>
              )}
              {activeLeases.length === 0 ? (
                <p className="text-body-small text-text-muted">No active leases.</p>
              ) : (
                <TableFrame>
                  <table className="w-full text-body-small">
                    <thead>
                      <tr className="text-left text-text-muted">
                        <th className="pb-2 pr-4">Job run</th>
                        <th className="pb-2 pr-4">Worker</th>
                        <th className="pb-2 pr-4">Heartbeat</th>
                        <th className="pb-2">Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeLeases.map((l) => (
                        <tr key={l.job_run_id} className="border-t border-border-subtle">
                          <td className="py-2 font-mono text-caption-small">
                            <Link href="/jobs" className="text-brand-600 hover:underline">{l.job_run_id.slice(0, 8)}…</Link>
                          </td>
                          <td className="py-2">{l.worker_id}</td>
                          <td className="py-2">{new Date(l.heartbeat_at).toLocaleString()}</td>
                          <td className="py-2">{new Date(l.lease_expires_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableFrame>
              )}
            </CardSection>
          </div>
        )}
      </Stack>
    </PageFrame>
  );
}
