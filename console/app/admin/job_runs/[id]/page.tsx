"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader, Card, CardContent, Badge } from "@/components/ui";
import { useJobRun } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";

const resource = getResource("job_runs")!;

export default function AdminJobRunShowPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error } = useJobRun(id);

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
            <p><span className="text-text-muted">Run ID:</span> <Link href={`/runs/${data.run_id}`} className="font-mono text-caption-small text-brand-600 hover:underline">{data.run_id}</Link></p>
            <p><span className="text-text-muted">Plan node ID:</span> <span className="font-mono text-body-small">{data.plan_node_id}</span></p>
            <p><span className="text-text-muted">Status:</span> <Badge variant={data.status === "succeeded" ? "success" : data.status === "failed" ? "error" : "neutral"}>{data.status}</Badge></p>
            <p><span className="text-text-muted">Started:</span> {data.started_at ? new Date(data.started_at).toLocaleString() : "—"}</p>
            <p><span className="text-text-muted">Finished:</span> {data.finished_at ? new Date(data.finished_at).toLocaleString() : "—"}</p>
          </CardContent>
        </Card>
        <p>
          <Link href="/admin/job_runs" className="text-body-small text-brand-600 hover:underline">← Back to list</Link>
          {" · "}
          <Link href={`/runs/${data.run_id}`} className="text-body-small text-brand-600 hover:underline">View run in Ops UI</Link>
        </p>
      </div>
    </div>
  );
}
