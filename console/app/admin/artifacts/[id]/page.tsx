"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader, Card, CardContent, CardSection } from "@/components/ui";
import { useArtifact } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";
const resource = getResource("artifacts")!;

type LineageRow = { job_run_id: string; plan_node_id: string };

export default function AdminArtifactShowPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error } = useArtifact(id);
  const [lineage, setLineage] = useState<{ producer_run_id?: string; producer_plan_node_id?: string; consumers: LineageRow[] } | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/v1/graph/lineage/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => j && setLineage({ producer_run_id: j.run_id, producer_plan_node_id: j.producer_plan_node_id, consumers: j.consumers ?? [] }))
      .catch(() => setLineage(null));
  }, [id]);

  if (error) {
    return (
      <div>
        <PageHeader title={`${resource.label} — ${id.slice(0, 8)}…`} />
        <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
          Error: {(error as Error).message}
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader title={`${resource.label} — ${id.slice(0, 8)}…`} />
        <Card>
          <CardContent className="p-4">
            <div className="h-32 animate-pulse rounded-md bg-surface-sunken" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`${resource.label} — ${String(data.id).slice(0, 8)}…`} description="Admin show — internal use only." />
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <p><span className="text-text-muted">ID:</span> <span className="font-mono text-body-small">{data.id}</span></p>
            <p><span className="text-text-muted">Type:</span> {data.artifact_type}</p>
            <p><span className="text-text-muted">Class:</span> {data.artifact_class ?? "—"}</p>
            <p><span className="text-text-muted">URI:</span> <span className="break-all font-mono text-body-small">{data.uri}</span></p>
            <p><span className="text-text-muted">Producer plan node:</span> {data.producer_plan_node_id ?? "—"}</p>
            <p><span className="text-text-muted">Created:</span> {new Date(data.created_at).toLocaleString()}</p>
          </CardContent>
        </Card>
        <CardSection title="Lineage (graph)">
          <p className="text-body-small text-text-muted mb-2">Produced by plan node; consumed by job runs (from artifact_consumption).</p>
          {lineage ? (
            <dl className="space-y-1 text-body-small">
              <dt className="text-text-muted">Producer node</dt>
              <dd className="font-mono">{lineage.producer_plan_node_id ?? "—"}</dd>
              <dt className="text-text-muted">Consumed by</dt>
              <dd>
                {lineage.consumers.length === 0 ? "—" : (
                  <ul className="list-disc list-inside">
                    {lineage.consumers.map((c) => (
                      <li key={c.job_run_id}>job_run <span className="font-mono">{c.job_run_id.slice(0, 8)}…</span> (node <span className="font-mono">{c.plan_node_id.slice(0, 8)}…</span>)</li>
                    ))}
                  </ul>
                )}
              </dd>
            </dl>
          ) : (
            <p className="text-text-muted">Loading lineage…</p>
          )}
        </CardSection>
        <p>
          <Link href="/admin/artifacts" className="text-body-small text-brand-600 hover:underline">← Back to list</Link>
          {" · "}
          <Link href={`/artifacts/${data.id}`} className="text-body-small text-brand-600 hover:underline">View in Ops UI</Link>
        </p>
      </div>
    </div>
  );
}
