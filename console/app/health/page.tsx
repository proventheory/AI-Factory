"use client";

import { useEffect, useState } from "react";

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

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Health</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 mb-2">Workers</h2>
          {workers.length === 0 ? (
            <p className="text-slate-500 text-sm">No workers registered.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Worker ID</th>
                  <th className="pb-2">Last heartbeat</th>
                  <th className="pb-2">Version</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.worker_id} className="border-t border-slate-100">
                    <td className="py-2 font-mono text-xs">{w.worker_id}</td>
                    <td className="py-2">{new Date(w.last_heartbeat_at).toLocaleString()}</td>
                    <td className="py-2">{w.runner_version ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 mb-2">Active leases</h2>
          {staleCount > 0 && (
            <p className="text-amber-600 text-sm mb-2">Stale leases (heartbeat &gt; 2 min): {staleCount}</p>
          )}
          {activeLeases.length === 0 ? (
            <p className="text-slate-500 text-sm">No active leases.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Job run</th>
                  <th className="pb-2">Worker</th>
                  <th className="pb-2">Heartbeat</th>
                  <th className="pb-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {activeLeases.map((l) => (
                  <tr key={l.job_run_id} className="border-t border-slate-100">
                    <td className="py-2 font-mono text-xs">{l.job_run_id.slice(0, 8)}…</td>
                    <td className="py-2">{l.worker_id}</td>
                    <td className="py-2">{new Date(l.heartbeat_at).toLocaleString()}</td>
                    <td className="py-2">{new Date(l.lease_expires_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
