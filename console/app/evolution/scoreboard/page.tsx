"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, EmptyState } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type ScoreboardRow = {
  experiment_run_id: string;
  mutation_proposal_id: string;
  domain: string;
  cohort_key: string | null;
  status: string;
  outcome: string | null;
  metric_count: number;
  weighted_score_proxy: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

export default function EvolutionScoreboardPage() {
  const [items, setItems] = useState<ScoreboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (domainFilter) params.set("domain", domainFilter);
    params.set("limit", "50");
    fetch(`${API}/v1/evolution/scoreboard?${params}`)
      .then((r) => r.json())
      .then((d: { scoreboard?: ScoreboardRow[] }) => setItems(d.scoreboard ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [domainFilter]);

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Evolution: Scoreboard" description="Experiment score summary (fitness metrics)." />
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
          title="Evolution: Scoreboard"
          description="Experiment run score summary: metric count and weighted score proxy per cohort."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/evolution/mutations" className="text-brand-600 hover:underline">Mutations</Link>
          {" · "}
          <Link href="/evolution/experiments" className="text-brand-600 hover:underline">Experiments</Link>
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">All domains</option>
            <option value="deploy_repair">deploy_repair</option>
          </select>
        </div>
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState
              title="No scoreboard entries"
              description="Complete experiment runs (replay) to see fitness metrics and weighted score proxy here."
            />
          ) : (
            <TableFrame>
              <table className="w-full text-body-small">
                <thead className="bg-slate-50 border-b border-border-subtle">
                  <tr>
                    <th className="text-left p-3 font-medium text-text-muted">Experiment</th>
                    <th className="text-left p-3 font-medium text-text-muted">Mutation</th>
                    <th className="text-left p-3 font-medium text-text-muted">Domain</th>
                    <th className="text-left p-3 font-medium text-text-muted">Cohort</th>
                    <th className="text-left p-3 font-medium text-text-muted">Status</th>
                    <th className="text-left p-3 font-medium text-text-muted">Outcome</th>
                    <th className="text-left p-3 font-medium text-text-muted">Metrics</th>
                    <th className="text-left p-3 font-medium text-text-muted">Weighted score</th>
                    <th className="text-left p-3 font-medium text-text-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.experiment_run_id} className="border-b border-border-subtle hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs">{row.experiment_run_id.slice(0, 8)}…</td>
                      <td className="p-3 font-mono text-xs">{row.mutation_proposal_id.slice(0, 8)}…</td>
                      <td className="p-3">{row.domain}</td>
                      <td className="p-3">{row.cohort_key ?? "—"}</td>
                      <td className="p-3">{row.status}</td>
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
                      <td className="p-3">{row.metric_count}</td>
                      <td className="p-3 font-mono">{Number(row.weighted_score_proxy).toFixed(2)}</td>
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
