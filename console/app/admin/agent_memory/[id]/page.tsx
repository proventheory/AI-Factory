"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageFrame, Stack, CardSection, PageHeader, LoadingSkeleton, Badge, Card, CardContent } from "@/components/ui";
import { useAgentMemoryById } from "@/hooks/use-api";

export default function AdminAgentMemoryShowPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error } = useAgentMemoryById(id);

  if (error) {
    return (
      <PageFrame><PageHeader title={`Agent Memory — ${id.slice(0, 8)}…`} />
        <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{(error as Error).message}</div>
      </PageFrame>
    );
  }

  if (isLoading || !data) {
    return <PageFrame><PageHeader title={`Agent Memory — ${id.slice(0, 8)}…`} /><LoadingSkeleton className="h-64 w-full rounded-md" /></PageFrame>;
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader title={`Agent Memory — ${data.key}`} description={`Scope: ${data.scope}`} />
        <Card>
          <CardContent className="p-4 space-y-3">
            <p><span className="text-text-muted">ID:</span> <span className="font-mono text-body-small">{data.id}</span></p>
            <p><span className="text-text-muted">Scope:</span> <Badge variant="neutral">{data.scope}</Badge></p>
            <p><span className="text-text-muted">Key:</span> {data.key}</p>
            <p><span className="text-text-muted">Initiative:</span> {data.initiative_id ? <span className="font-mono text-body-small">{data.initiative_id}</span> : "—"}</p>
            <p><span className="text-text-muted">Run:</span> {data.run_id ? <span className="font-mono text-body-small">{data.run_id}</span> : "—"}</p>
            <p><span className="text-text-muted">Created:</span> {new Date(data.created_at).toLocaleString()}</p>
            <div>
              <span className="text-text-muted">Value:</span>
              <pre className="mt-1 max-h-96 overflow-auto rounded-md bg-surface-sunken p-3 text-body-small font-mono whitespace-pre-wrap">{data.value}</pre>
            </div>
          </CardContent>
        </Card>
        <p><Link href="/admin/agent_memory" className="text-body-small text-brand-600 hover:underline">← Back to list</Link></p>
      </Stack>
    </PageFrame>
  );
}
