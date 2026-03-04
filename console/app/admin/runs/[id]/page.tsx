"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge, Card, CardContent, Button } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useRun, useJobRuns, useArtifacts, useLlmCalls, useRerunRun } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import type { JobRunRow, ArtifactRow, LlmCallRow } from "@/lib/api";

const resource = getResource("runs")!;

function duration(start: string | null, end: string | null | undefined): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export default function AdminRunShowPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error } = useRun(id);
  const { data: jobRunsData } = useJobRuns({ run_id: id, limit: 100 });
  const { data: artifactsData } = useArtifacts({ run_id: id, limit: 100 });
  const { data: llmCallsData } = useLlmCalls({ run_id: id, limit: 200 });
  const rerun = useRerunRun();

  const llmByJobRun = new Map<string, { calls: number; tokens_in: number; tokens_out: number }>();
  for (const c of llmCallsData?.items ?? []) {
    const jr = c.job_run_id;
    const prev = llmByJobRun.get(jr) ?? { calls: 0, tokens_in: 0, tokens_out: 0 };
    llmByJobRun.set(jr, { calls: prev.calls + 1, tokens_in: prev.tokens_in + (c.tokens_in ?? 0), tokens_out: prev.tokens_out + (c.tokens_out ?? 0) });
  }

  if (error) {
    return (
      <PageFrame>
        <PageHeader title={`${resource.label} — ${id.slice(0, 8)}…`} />
        <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
          Error: {(error as Error).message}
        </div>
      </PageFrame>
    );
  }

  if (isLoading || !data) {
    return (
      <PageFrame>
        <PageHeader title={`${resource.label} — ${id.slice(0, 8)}…`} />
        <LoadingSkeleton className="h-64 w-full rounded-md" />
      </PageFrame>
    );
  }

  const statusVariant = data.status === "succeeded" ? "success" : data.status === "failed" ? "error" : "neutral";

  const jobRunColumns: Column<JobRunRow>[] = [
    { key: "plan_node_id", header: "Node", render: (row) => <span className="font-mono text-caption-small">{(row as Record<string, unknown>).node_key as string ?? row.plan_node_id?.slice(0, 8)}</span> },
    { key: "status", header: "Status", render: (row) => <Badge variant={row.status === "succeeded" ? "success" : row.status === "failed" ? "error" : "neutral"}>{row.status}</Badge> },
    { key: "started_at", header: "Duration", render: (row) => duration(row.started_at, row.finished_at) },
    { key: "id", header: "LLM Usage", render: (row) => {
      const stats = llmByJobRun.get(row.id);
      return stats ? <span className="text-caption-small text-text-secondary">{stats.calls} calls · {stats.tokens_in.toLocaleString()} in · {stats.tokens_out.toLocaleString()} out</span> : <span className="text-caption-small text-text-muted">—</span>;
    }},
  ];

  const artifactColumns: Column<ArtifactRow>[] = [
    { key: "artifact_type", header: "Type" },
    { key: "uri", header: "URI", render: (row) => <span className="font-mono text-caption-small truncate max-w-[300px] inline-block">{row.uri}</span> },
    { key: "producer_plan_node_id", header: "Producer", render: (row) => row.producer_plan_node_id ? <span className="font-mono text-caption-small">{row.producer_plan_node_id.slice(0, 8)}…</span> : "—" },
  ];

  const llmTotals = llmCallsData?.items?.reduce((acc, c) => ({
    calls: acc.calls + 1,
    tokens_in: acc.tokens_in + (c.tokens_in ?? 0),
    tokens_out: acc.tokens_out + (c.tokens_out ?? 0),
  }), { calls: 0, tokens_in: 0, tokens_out: 0 }) ?? { calls: 0, tokens_in: 0, tokens_out: 0 };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title={`Run ${data.id.slice(0, 8)}…`}
          description="Run detail with timeline, per-node LLM usage, and artifacts."
        />

        <Card>
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-caption-small text-text-muted">Status</div>
              <Badge variant={statusVariant}>{data.status}</Badge>
            </div>
            <div>
              <div className="text-caption-small text-text-muted">Environment</div>
              <div className="text-body-small">{data.environment}</div>
            </div>
            <div>
              <div className="text-caption-small text-text-muted">Duration</div>
              <div className="text-body-small">{duration(data.started_at, data.finished_at)}</div>
            </div>
            <div>
              <div className="text-caption-small text-text-muted">LLM Usage</div>
              <div className="text-body-small">{llmTotals.calls} calls · {llmTotals.tokens_in.toLocaleString()} in · {llmTotals.tokens_out.toLocaleString()} out</div>
            </div>
          </CardContent>
        </Card>

        <CardSection title={`Job Runs (${jobRunsData?.items?.length ?? 0})`}>
          {jobRunsData?.items && jobRunsData.items.length > 0 ? (
            <TableFrame>
              <DataTable columns={jobRunColumns} data={jobRunsData.items} keyExtractor={(row) => row.id} />
            </TableFrame>
          ) : (
            <EmptyState title="No job runs" />
          )}
        </CardSection>

        <CardSection title={`Artifacts (${artifactsData?.items?.length ?? 0})`}>
          {artifactsData?.items && artifactsData.items.length > 0 ? (
            <TableFrame>
              <DataTable columns={artifactColumns} data={artifactsData.items} keyExtractor={(row) => row.id} />
            </TableFrame>
          ) : (
            <EmptyState title="No artifacts" />
          )}
        </CardSection>

        <CardSection title={`LLM Calls (${llmCallsData?.items?.length ?? 0})`}>
          {llmCallsData?.items && llmCallsData.items.length > 0 ? (
            <TableFrame>
              <DataTable
                columns={[
                  { key: "model_tier", header: "Tier", render: (row: LlmCallRow) => <Badge variant="neutral">{row.model_tier}</Badge> },
                  { key: "model_id", header: "Model" },
                  { key: "tokens_in", header: "In", render: (row: LlmCallRow) => row.tokens_in ?? "—" },
                  { key: "tokens_out", header: "Out", render: (row: LlmCallRow) => row.tokens_out ?? "—" },
                  { key: "latency_ms", header: "Latency", render: (row: LlmCallRow) => row.latency_ms ? `${row.latency_ms}ms` : "—" },
                ]}
                data={llmCallsData.items}
                keyExtractor={(row: LlmCallRow) => row.id}
              />
            </TableFrame>
          ) : (
            <EmptyState title="No LLM calls recorded" />
          )}
        </CardSection>

        <div className="flex items-center gap-4">
          <Link href="/admin/runs" className="text-body-small text-brand-600 hover:underline">← Back to list</Link>
          <Button variant="secondary" disabled={rerun.isPending} onClick={() => { rerun.mutate(id); }}>
            {rerun.isPending ? "Rerunning…" : "Rerun"}
          </Button>
          {rerun.isSuccess && <span className="text-body-small text-state-success">New run created</span>}
        </div>
      </Stack>
    </PageFrame>
  );
}
