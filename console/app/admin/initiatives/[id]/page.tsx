"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader, Card, CardContent, Badge } from "@/components/ui";
import { useInitiative } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";

const resource = getResource("initiatives")!;

function riskVariant(risk: string): "success" | "warning" | "error" | "neutral" {
  if (risk === "high") return "error";
  if (risk === "med") return "warning";
  return "success";
}

export default function AdminInitiativeShowPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error } = useInitiative(id);

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
      <PageHeader
        title={data.title || `${resource.label} — ${String(data.id).slice(0, 8)}…`}
        description="Admin show — internal use only."
        actions={
          <Link href={`/admin/initiatives/${data.id}/edit`} className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-body-small font-medium text-slate-700 hover:bg-slate-50">
            Edit
          </Link>
        }
      />
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <p><span className="text-text-muted">ID:</span> <span className="font-mono text-body-small">{data.id}</span></p>
            <p><span className="text-text-muted">Intent type:</span> {data.intent_type}</p>
            <p><span className="text-text-muted">Title:</span> {data.title ?? "—"}</p>
            <p><span className="text-text-muted">Risk:</span> <Badge variant={riskVariant(data.risk_level)}>{data.risk_level}</Badge></p>
            <p><span className="text-text-muted">Created:</span> {new Date(data.created_at).toLocaleString()}</p>
          </CardContent>
        </Card>
        <p>
          <Link href="/admin/initiatives" className="text-body-small text-brand-600 hover:underline">← Back to list</Link>
          {" · "}
          <Link href={`/initiatives/${data.id}`} className="text-body-small text-brand-600 hover:underline">View in Ops UI</Link>
        </p>
      </div>
    </div>
  );
}
