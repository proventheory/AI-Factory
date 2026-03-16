"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageFrame, Stack, CardSection, PageHeader, LoadingSkeleton } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type ExperimentDetail = {
  id: string;
  mutation_proposal_id: string;
  domain: string;
  baseline_ref: Record<string, unknown>;
  candidate_ref: Record<string, unknown>;
  traffic_strategy: string;
  traffic_percent: number | null;
  sample_size: number | null;
  cohort_key: string | null;
  cohort_filters: Record<string, unknown>;
  status: string;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
};

export default function EvolutionExperimentDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [item, setItem] = useState<ExperimentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/v1/evolution/experiments/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Experiment not found" : String(r.status));
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
          <PageHeader title="Experiment" description="Experiment run detail." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
          <Link href="/evolution/experiments" className="text-brand-600 hover:underline">← Back to Experiments</Link>
        </Stack>
      </PageFrame>
    );
  }

  if (loading || !item) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Experiment" description="Experiment run detail." />
          <LoadingSkeleton className="h-64 rounded-lg" />
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Experiment run" description={`${item.domain} / ${item.traffic_strategy}`} />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/evolution/mutations" className="text-brand-600 hover:underline">Mutations</Link>
          {" · "}
          <Link href={`/evolution/mutations/${item.mutation_proposal_id}`} className="text-brand-600 hover:underline">This mutation</Link>
          {" · "}
          <Link href="/evolution/experiments" className="text-brand-600 hover:underline">Experiments</Link>
          {" · "}
          <Link href="/evolution/scoreboard" className="text-brand-600 hover:underline">Scoreboard</Link>
        </p>
        <CardSection>
          <dl className="grid gap-3 text-body-small">
            <div><dt className="font-medium text-text-muted">ID</dt><dd className="font-mono text-xs">{item.id}</dd></div>
            <div><dt className="font-medium text-text-muted">Mutation proposal</dt><dd><Link href={`/evolution/mutations/${item.mutation_proposal_id}`} className="text-brand-600 hover:underline font-mono text-xs">{item.mutation_proposal_id}</Link></dd></div>
            <div><dt className="font-medium text-text-muted">Domain</dt><dd>{item.domain}</dd></div>
            <div><dt className="font-medium text-text-muted">Traffic strategy</dt><dd>{item.traffic_strategy}</dd></div>
            <div><dt className="font-medium text-text-muted">Status</dt><dd>{item.status}</dd></div>
            <div><dt className="font-medium text-text-muted">Outcome</dt><dd>{item.outcome ?? "—"}</dd></div>
            <div><dt className="font-medium text-text-muted">Cohort key</dt><dd>{item.cohort_key ?? "—"}</dd></div>
            <div><dt className="font-medium text-text-muted">Started</dt><dd>{item.started_at ? new Date(item.started_at).toLocaleString() : "—"}</dd></div>
            <div><dt className="font-medium text-text-muted">Ended</dt><dd>{item.ended_at ? new Date(item.ended_at).toLocaleString() : "—"}</dd></div>
            <div><dt className="font-medium text-text-muted">Created</dt><dd>{new Date(item.created_at).toLocaleString()}</dd></div>
            {item.notes && <div><dt className="font-medium text-text-muted">Notes</dt><dd><pre className="bg-slate-50 p-2 rounded text-xs overflow-auto max-h-24">{item.notes}</pre></dd></div>}
            <div><dt className="font-medium text-text-muted">Baseline ref</dt><dd><pre className="bg-slate-50 p-2 rounded text-xs overflow-auto max-h-32">{JSON.stringify(item.baseline_ref, null, 2)}</pre></dd></div>
            <div><dt className="font-medium text-text-muted">Candidate ref</dt><dd><pre className="bg-slate-50 p-2 rounded text-xs overflow-auto max-h-32">{JSON.stringify(item.candidate_ref, null, 2)}</pre></dd></div>
          </dl>
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
