"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, Tabs, TabsList, TabsTrigger, TabsContent, DataTable, Badge, Button, EmptyState, LoadingSkeleton } from "@/components/ui";

const RunFlowViewer = dynamic(
  () => import("@/components/flow/RunFlowViewer").then((m) => ({ default: m.RunFlowViewer })),
  { ssr: false, loading: () => <LoadingSkeleton className="h-[500px] w-full rounded-lg" /> },
);
import type { Column } from "@/components/ui/DataTable";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type RunDetail = {
  run: Record<string, unknown>;
  plan_nodes: Record<string, unknown>[];
  plan_edges: Record<string, unknown>[];
  node_progress: Record<string, unknown>[];
  job_runs: Record<string, unknown>[];
  run_events: Record<string, unknown>[];
};

type ToolCallRow = { id: string; job_run_id: string; capability: string; operation_key: string; status: string; started_at: string | null };
type ArtifactRow = { id: string; artifact_type: string; artifact_class: string; uri: string; created_at: string };
type ValidationRow = { id: string; validator_type: string; status: string; job_run_id: string | null; created_at: string };
type AuditRow = { source: string; id: string; run_id: string; job_run_id: string | null; event_type: string; created_at: string; payload_json: unknown };

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<RunDetail | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallRow[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [validations, setValidations] = useState<ValidationRow[]>([]);
  const [auditItems, setAuditItems] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const refetch = useCallback(() => {
    if (!id) return;
    fetch(`${API}/v1/runs/${id}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/v1/runs/${id}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== "tool_calls") return;
    fetch(`${API}/v1/tool_calls?run_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((d: { items?: ToolCallRow[] }) => setToolCalls(d.items ?? []))
      .catch(() => setToolCalls([]));
  }, [id, activeTab]);

  useEffect(() => {
    if (!id || activeTab !== "artifacts") return;
    fetch(`${API}/v1/artifacts?run_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((d: { items?: ArtifactRow[] }) => setArtifacts(d.items ?? []))
      .catch(() => setArtifacts([]));
  }, [id, activeTab]);

  useEffect(() => {
    if (!id || activeTab !== "validations") return;
    fetch(`${API}/v1/validations?run_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((d: { items?: ValidationRow[] }) => setValidations(d.items ?? []))
      .catch(() => setValidations([]));
  }, [id, activeTab]);

  useEffect(() => {
    if (!id || activeTab !== "secrets") return;
    fetch(`${API}/v1/audit?run_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((d: { items?: AuditRow[] }) => setAuditItems(d.items ?? []))
      .catch(() => setAuditItems([]));
  }, [id, activeTab]);

  async function handleRerun() {
    setActionBusy("rerun");
    try {
      const r = await fetch(`${API}/v1/runs/${id}/rerun`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Rerun failed");
      router.push(`/runs/${j.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rerun failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this run? It will be marked failed.")) return;
    setActionBusy("cancel");
    try {
      const r = await fetch(`${API}/v1/runs/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Cancel failed");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRollback() {
    if (!confirm("Trigger rollback for this run’s release in this environment?")) return;
    setActionBusy("rollback");
    try {
      const r = await fetch(`${API}/v1/runs/${id}/rollback`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Rollback failed");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleApprove(action: "approve" | "reject") {
    setActionBusy(action);
    try {
      const r = await fetch(`${API}/v1/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: id, action }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Approval failed");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setActionBusy(null);
    }
  }

  function handleExportMdd() {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ run: data.run, plan_nodes: data.plan_nodes, plan_edges: data.plan_edges, node_progress: data.node_progress, job_runs: data.job_runs, run_events: data.run_events }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `run-${String(data.run.id).slice(0, 8)}.mdd.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (error) return <PageFrame><p className="text-red-600">Error: {error}</p></PageFrame>;
  if (!data) return <PageFrame><p className="text-slate-500">Loading...</p></PageFrame>;

  const run = data.run as Record<string, unknown>;

  const toolCallColumns: Column<ToolCallRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{String(r.id).slice(0, 8)}…</span> },
    { key: "capability", header: "Capability" },
    { key: "operation_key", header: "Operation" },
    { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "succeeded" ? "success" : r.status === "failed" ? "error" : "neutral"}>{r.status}</Badge> },
    { key: "started_at", header: "Started", render: (r) => r.started_at ? new Date(r.started_at).toLocaleString() : "—" },
  ];

  const artifactColumns: Column<ArtifactRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{String(r.id).slice(0, 8)}…</span> },
    { key: "artifact_class", header: "Class" },
    { key: "artifact_type", header: "Type" },
    { key: "uri", header: "URI", render: (r) => <span className="truncate max-w-[200px] block" title={r.uri}>{r.uri}</span> },
    {
      key: "view",
      header: "",
      render: (r) =>
        r.artifact_type === "landing_page" ? (
          <a href={`${API}/v1/artifacts/${r.id}/content`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline text-sm">
            View page
          </a>
        ) : null,
    },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  const validationColumns: Column<ValidationRow>[] = [
    { key: "validator_type", header: "Validator" },
    { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "pass" ? "success" : "error"}>{r.status}</Badge> },
    { key: "job_run_id", header: "Job run", render: (r) => r.job_run_id ? <span className="font-mono text-xs">{String(r.job_run_id).slice(0, 8)}…</span> : "—" },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title={`Run ${String(run.id).slice(0, 8)}…`}
          description={undefined}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/runs" className="text-brand-600 hover:underline text-sm shrink-0">← Runs</Link>
              <Button variant="secondary" onClick={handleRerun} disabled={!!actionBusy}>{actionBusy === "rerun" ? "…" : "Re-run"}</Button>
              <Button variant="secondary" onClick={handleCancel} disabled={!!actionBusy || (run.status !== "running" && run.status !== "queued")}>{actionBusy === "cancel" ? "…" : "Cancel run"}</Button>
              <Button variant="secondary" onClick={handleRollback} disabled={!!actionBusy}>{actionBusy === "rollback" ? "…" : "Rollback"}</Button>
              <Button variant="secondary" onClick={() => handleApprove("approve")} disabled={!!actionBusy}>{actionBusy === "approve" ? "…" : "Approve"}</Button>
              <Button variant="secondary" onClick={() => handleApprove("reject")} disabled={!!actionBusy}>{actionBusy === "reject" ? "…" : "Reject"}</Button>
              <Button variant="ghost" onClick={handleExportMdd}>Export .mdd</Button>
            </div>
          }
        />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="flow">Flow</TabsTrigger>
            <TabsTrigger value="tool_calls">Tool Calls</TabsTrigger>
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
            <TabsTrigger value="validations">Validations</TabsTrigger>
            <TabsTrigger value="secrets">Secrets Access</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CardSection title="Run context">
                <dl className="text-sm space-y-1">
                  <dt className="text-slate-500">Environment</dt><dd>{String(run.environment)}</dd>
                  <dt className="text-slate-500">Cohort</dt><dd>{String(run.cohort ?? "—")}</dd>
                  <dt className="text-slate-500">Status</dt><dd><Badge variant={String(run.status) === "succeeded" ? "success" : String(run.status) === "failed" ? "error" : "neutral"}>{String(run.status)}</Badge></dd>
                  <dt className="text-slate-500">Started</dt><dd>{run.started_at ? new Date(String(run.started_at)).toLocaleString() : "—"}</dd>
                  <dt className="text-slate-500">Ended</dt><dd>{run.ended_at ? new Date(String(run.ended_at)).toLocaleString() : "—"}</dd>
                </dl>
              </CardSection>
              <CardSection title="Node progress">
                <ul className="text-sm space-y-1">
                  {data.node_progress.map((np: Record<string, unknown>, i: number) => (
                    <li key={i}>Node {String(np.plan_node_id).slice(0, 8)}… — {String(np.status)}</li>
                  ))}
                  {data.node_progress.length === 0 && <li className="text-slate-500">None</li>}
                </ul>
              </CardSection>
            </div>
          </TabsContent>

          <TabsContent value="flow" className="pt-4">
            <CardSection title="Execution flow">
              <RunFlowViewer runId={id} />
            </CardSection>
          </TabsContent>

          <TabsContent value="tool_calls" className="pt-4">
            <CardSection title="Tool calls">
              {toolCalls.length === 0 ? (
                <EmptyState title="No tool calls" description="No tool calls recorded for this run." />
              ) : (
                <TableFrame>
                  <DataTable columns={toolCallColumns} data={toolCalls} keyExtractor={(r) => r.id} />
                </TableFrame>
              )}
            </CardSection>
          </TabsContent>

          <TabsContent value="artifacts" className="pt-4">
            <CardSection title="Artifacts">
              {artifacts.length === 0 ? (
                <EmptyState title="No artifacts" description="No artifacts recorded for this run." />
              ) : (
                <TableFrame>
                  <DataTable columns={artifactColumns} data={artifacts} keyExtractor={(r) => r.id} />
                </TableFrame>
              )}
            </CardSection>
          </TabsContent>

          <TabsContent value="validations" className="pt-4">
            <CardSection title="Validations">
              {validations.length === 0 ? (
                <EmptyState title="No validations" description="No validations recorded for this run." />
              ) : (
                <TableFrame>
                  <DataTable columns={validationColumns} data={validations} keyExtractor={(r) => r.id} />
                </TableFrame>
              )}
            </CardSection>
          </TabsContent>

          <TabsContent value="secrets" className="pt-4">
            <CardSection title="Secrets access">
              <p className="text-sm text-slate-500 mb-2">Audit ledger for this run (secret access is logged here when applicable). Admin-only in production.</p>
              {auditItems.length === 0 ? (
                <EmptyState title="No audit entries" description="No audit entries for this run." />
              ) : (
                <ul className="text-sm space-y-1">
                  {auditItems.map((ev, i) => (
                    <li key={i}>{ev.source} {ev.event_type} at {new Date(ev.created_at).toISOString()}</li>
                  ))}
                </ul>
              )}
            </CardSection>
          </TabsContent>

          <TabsContent value="events" className="pt-4">
            <CardSection title="Run events">
              <ul className="text-sm space-y-1">
                {data.run_events.map((ev: Record<string, unknown>, i: number) => (
                  <li key={i}>{String(ev.event_type)} at {ev.created_at ? new Date(String(ev.created_at)).toISOString() : ""}</li>
                ))}
                {data.run_events.length === 0 && <li className="text-slate-500">None</li>}
              </ul>
            </CardSection>
          </TabsContent>

          <TabsContent value="notes" className="pt-4">
            <CardSection title="Notes">
              <textarea
                className="w-full min-h-[200px] rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                placeholder="Add notes about this run… (TipTap rich editor coming soon)"
              />
            </CardSection>
          </TabsContent>
        </Tabs>
      </Stack>
    </PageFrame>
  );
}
