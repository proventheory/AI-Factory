"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, EmptyState } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type ExperimentRow = {
  id: string;
  mutation_proposal_id: string;
  domain: string;
  traffic_strategy: string;
  status: string;
  outcome: string | null;
  cohort_key: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export default function EvolutionExperimentsPage() {
  const [items, setItems] = useState<ExperimentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", "50");
    fetch(`${API}/v1/evolution/experiments?${params}`)
      .then((r) => r.json())
      .then((d: { experiments?: ExperimentRow[] }) => setItems(d.experiments ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Evolution: Experiments" description="Experiment runs (replay/shadow) for mutation proposals." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Evolution: Experiments"
          description="Experiment runs: replay cohort evaluation. Runner polls queued experiments and writes fitness_scores."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/evolution/mutations" className="text-brand-600 hover:underline">Mutations</Link>
          {" · "}
          <Link href="/evolution/scoreboard" className="text-brand-600 hover:underline">Scoreboard</Link>
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">All statuses</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
            <option value="aborted">aborted</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState
              title="No experiment runs"
              description="Create an experiment via POST /v1/evolution/experiments (mutation_proposal_id, domain, baseline_ref, candidate_ref, traffic_strategy=replay). Runner will pick up queued runs."
            />
          ) : (
            <TableFrame>
              <table className="w-full text-body-small">
                <thead className="bg-slate-50 border-b border-border-subtle">
                  <tr>
                    <th className="text-left p-3 font-medium text-text-muted">Experiment ID</th>
                    <th className="text-left p-3 font-medium text-text-muted">Mutation</th>
                    <th className="text-left p-3 font-medium text-text-muted">Domain</th>
                    <th className="text-left p-3 font-medium text-text-muted">Strategy</th>
                    <th className="text-left p-3 font-medium text-text-muted">Status</th>
                    <th className="text-left p-3 font-medium text-text-muted">Outcome</th>
                    <th className="text-left p-3 font-medium text-text-muted">Cohort</th>
                    <th className="text-left p-3 font-medium text-text-muted">Started</th>
                    <th className="text-left p-3 font-medium text-text-muted">Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs"><Link href={`/evolution/experiments/${row.id}`} className="text-brand-600 hover:underline">{row.id.slice(0, 8)}…</Link></td>
                      <td className="p-3 font-mono text-xs">{row.mutation_proposal_id.slice(0, 8)}…</td>
                      <td className="p-3">{row.domain}</td>
                      <td className="p-3">{row.traffic_strategy}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          row.status === "completed" ? "bg-green-100 text-green-800" :
                          row.status === "failed" ? "bg-red-100 text-red-800" :
                          row.status === "running" ? "bg-blue-100 text-blue-800" :
                          row.status === "queued" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {row.outcome ? (
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            row.outcome === "win" ? "bg-green-100 text-green-800" :
                            row.outcome === "loss" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"
                          }`}>
                            {row.outcome}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3">{row.cohort_key ?? "—"}</td>
                      <td className="p-3">{row.started_at ? new Date(row.started_at).toLocaleString() : "—"}</td>
                      <td className="p-3">{row.ended_at ? new Date(row.ended_at).toLocaleString() : "—"}</td>
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
