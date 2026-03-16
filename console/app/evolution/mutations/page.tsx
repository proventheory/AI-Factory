"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, EmptyState } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type MutationRow = {
  id: string;
  domain: string;
  target_type: string;
  target_id: string;
  mutation_kind: string;
  status: string;
  risk_level: string;
  proposed_by: string;
  created_at: string;
  updated_at: string;
};

export default function EvolutionMutationsPage() {
  const [items, setItems] = useState<MutationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (domainFilter) params.set("domain", domainFilter);
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", "50");
    fetch(`${API}/v1/evolution/mutations?${params}`)
      .then((r) => r.json())
      .then((d: { mutations?: MutationRow[] }) => setItems(d.mutations ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [domainFilter, statusFilter]);

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Evolution: Mutations" description="Mutation proposals for deploy_repair and other domains." />
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
          title="Evolution: Mutations"
          description="Mutation proposals (recipe order, thresholds, backoff). Create via API or console; experiments run via runner."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/evolution/experiments" className="text-brand-600 hover:underline">Experiments</Link>
          {" · "}
          <Link href="/evolution/scoreboard" className="text-brand-600 hover:underline">Scoreboard</Link>
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">All statuses</option>
            <option value="draft">draft</option>
            <option value="queued">queued</option>
            <option value="approved_for_test">approved_for_test</option>
            <option value="testing">testing</option>
            <option value="accepted">accepted</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState
              title="No mutation proposals"
              description="Create a mutation via POST /v1/evolution/mutations (domain deploy_repair, target_type e.g. repair_recipe_order)."
            />
          ) : (
            <TableFrame>
              <table className="w-full text-body-small">
                <thead className="bg-slate-50 border-b border-border-subtle">
                  <tr>
                    <th className="text-left p-3 font-medium text-text-muted">ID</th>
                    <th className="text-left p-3 font-medium text-text-muted">Domain</th>
                    <th className="text-left p-3 font-medium text-text-muted">Target</th>
                    <th className="text-left p-3 font-medium text-text-muted">Kind</th>
                    <th className="text-left p-3 font-medium text-text-muted">Status</th>
                    <th className="text-left p-3 font-medium text-text-muted">Risk</th>
                    <th className="text-left p-3 font-medium text-text-muted">Proposed by</th>
                    <th className="text-left p-3 font-medium text-text-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs"><Link href={`/evolution/mutations/${row.id}`} className="text-brand-600 hover:underline">{row.id.slice(0, 8)}…</Link></td>
                      <td className="p-3">{row.domain}</td>
                      <td className="p-3">{row.target_type} / {row.target_id}</td>
                      <td className="p-3">{row.mutation_kind}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          row.status === "accepted" ? "bg-green-100 text-green-800" :
                          row.status === "rejected" ? "bg-red-100 text-red-800" :
                          row.status === "testing" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3">{row.risk_level}</td>
                      <td className="p-3">{row.proposed_by}</td>
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
