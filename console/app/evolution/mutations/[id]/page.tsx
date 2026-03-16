"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageFrame, Stack, CardSection, PageHeader, LoadingSkeleton } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type MutationDetail = {
  id: string;
  domain: string;
  target_type: string;
  target_id: string;
  mutation_kind: string;
  patch: Record<string, unknown>;
  baseline_snapshot: Record<string, unknown>;
  hypothesis: string | null;
  proposed_by: string;
  risk_level: string;
  status: string;
  rationale: Record<string, unknown>;
  tags: unknown[];
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  retired_at: string | null;
};

export default function EvolutionMutationDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [item, setItem] = useState<MutationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/v1/evolution/mutations/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Mutation not found" : String(r.status));
        return r.json();
      })
      .then(setItem)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Mutation" description="Mutation proposal detail." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
          <Link href="/evolution/mutations" className="text-brand-600 hover:underline">← Back to Mutations</Link>
        </Stack>
      </PageFrame>
    );
  }

  if (loading || !item) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Mutation" description="Mutation proposal detail." />
          <LoadingSkeleton className="h-64 rounded-lg" />
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Mutation proposal" description={`${item.domain} / ${item.target_type} / ${item.target_id}`} />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/evolution/mutations" className="text-brand-600 hover:underline">Mutations</Link>
          {" · "}
          <Link href="/evolution/experiments" className="text-brand-600 hover:underline">Experiments</Link>
          {" · "}
          <Link href="/evolution/scoreboard" className="text-brand-600 hover:underline">Scoreboard</Link>
        </p>
        <CardSection>
          <dl className="grid gap-3 text-body-small">
            <div><dt className="font-medium text-text-muted">ID</dt><dd className="font-mono text-xs">{item.id}</dd></div>
            <div><dt className="font-medium text-text-muted">Domain</dt><dd>{item.domain}</dd></div>
            <div><dt className="font-medium text-text-muted">Target</dt><dd>{item.target_type} / {item.target_id}</dd></div>
            <div><dt className="font-medium text-text-muted">Kind</dt><dd>{item.mutation_kind}</dd></div>
            <div><dt className="font-medium text-text-muted">Status</dt><dd>{item.status}</dd></div>
            <div><dt className="font-medium text-text-muted">Risk</dt><dd>{item.risk_level}</dd></div>
            <div><dt className="font-medium text-text-muted">Proposed by</dt><dd>{item.proposed_by}</dd></div>
            <div><dt className="font-medium text-text-muted">Created</dt><dd>{new Date(item.created_at).toLocaleString()}</dd></div>
            <div><dt className="font-medium text-text-muted">Updated</dt><dd>{new Date(item.updated_at).toLocaleString()}</dd></div>
            {item.hypothesis && <div><dt className="font-medium text-text-muted">Hypothesis</dt><dd>{item.hypothesis}</dd></div>}
            <div><dt className="font-medium text-text-muted">Patch</dt><dd><pre className="bg-slate-50 p-2 rounded text-xs overflow-auto max-h-40">{JSON.stringify(item.patch, null, 2)}</pre></dd></div>
            <div><dt className="font-medium text-text-muted">Rationale</dt><dd><pre className="bg-slate-50 p-2 rounded text-xs overflow-auto max-h-24">{JSON.stringify(item.rationale, null, 2)}</pre></dd></div>
          </dl>
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
