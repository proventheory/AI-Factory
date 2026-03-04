"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui";
import { usePlan } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";

const resource = getResource("plans")!;

export default function AdminPlanShowPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error } = usePlan(id);

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
            <p><span className="text-text-muted">Initiative ID:</span> <span className="font-mono text-body-small">{data.initiative_id}</span></p>
            <p><span className="text-text-muted">Version:</span> {data.version}</p>
            <p><span className="text-text-muted">Status:</span> {(data as { status?: string }).status ?? "—"}</p>
            <p><span className="text-text-muted">Created:</span> {new Date(data.created_at).toLocaleString()}</p>
          </CardContent>
        </Card>
        <p>
          <Link href="/admin/plans" className="text-body-small text-brand-600 hover:underline">← Back to list</Link>
          {" · "}
          <Link href={`/plans/${data.id}`} className="text-body-small text-brand-600 hover:underline">View in Ops UI</Link>
        </p>
      </div>
    </div>
  );
}
