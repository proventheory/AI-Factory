"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, Tabs, TabsList, TabsTrigger, TabsContent, DataTable, Badge, Button, EmptyState, LoadingSkeleton, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui";

const RunFlowViewer = dynamic(
  () => import("@/components/flow/RunFlowViewer").then((m) => ({ default: m.RunFlowViewer })),
  { ssr: false, loading: () => <LoadingSkeleton className="h-[500px] w-full rounded-lg" /> },
);
import type { Column } from "@/components/ui/DataTable";
import { controlPlaneApiBase, formatApiError } from "@/lib/api";

type PinnedContext = {
  runner_image_digest: string | null;
  workplane_bundle_version: string | null;
  release_policy_version: string | null;
} | null;

type RunDetail = {
  run: Record<string, unknown>;
  pinned_context?: PinnedContext;
  plan_nodes: Record<string, unknown>[];
  plan_edges: Record<string, unknown>[];
  node_progress: Record<string, unknown>[];
  job_runs: Record<string, unknown>[];
  artifacts?: ArtifactRow[];
  run_events: Record<string, unknown>[];
  job_events?: Record<string, unknown>[];
};

function pipelineRunStatusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "succeeded") return "success";
  if (status === "failed") return "error";
  if (status === "partial") return "warning";
  return "neutral";
}

type ToolCallRow = { id: string; job_run_id: string; capability: string; operation_key: string; status: string; started_at: string | null };
type ArtifactRow = { id: string; artifact_type: string; artifact_class: string; uri: string; created_at: string };
type ValidationRow = { id: string; validator_type: string; status: string; job_run_id: string | null; created_at: string };
type LogEntryRow = { id: string; run_id: string; job_run_id: string | null; source: string; level: string | null; message: string; logged_at: string };
type LlmCallRow = { id: string; job_run_id: string | null; model_tier: string; model_id: string; tokens_in: number | null; tokens_out: number | null; latency_ms: number | null; created_at: string };
type AuditRow = { source: string; id: string; run_id: string; job_run_id: string | null; event_type: string; created_at: string; payload_json: unknown };

const RUN_DETAIL_FETCH_MS = 25_000;

async function loadRunDetail(runId: string): Promise<RunDetail> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RUN_DETAIL_FETCH_MS);
  try {
    const r = await fetch(`${controlPlaneApiBase()}/v1/runs/${runId}`, { signal: ctrl.signal });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? "Failed to load run");
    }
    const d = (await r.json()) as RunDetail;
    if (!d?.run) throw new Error("Invalid run response");
    return d;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Timed out after ${RUN_DETAIL_FETCH_MS / 1000}s loading run. Check NEXT_PUBLIC_CONTROL_PLANE_API matches the API that owns this run.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function RepairPreviewPanel({
  runId,
  jobRuns,
}: {
  runId: string;
  jobRuns: { plan_node_id: string; status: string; error_signature?: string }[];
}) {
  const router = useRouter();
  const failed = [...new Map(jobRuns.filter((j) => j.status === "failed").map((j) => [j.plan_node_id, j])).values()];
  const [replayBusy, setReplayBusy] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  async function replaySubgraph(planNodeId: string) {
    setReplayError(null);
    setReplayBusy(planNodeId);
    try {
      const r = await fetch(`${controlPlaneApiBase()}/v1/graph/subgraph_replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, root_node_id: planNodeId }),
      });
      const text = await r.text();
      let j: { error?: string; run_id?: string | null; message?: string };
      try {
        j = text ? (JSON.parse(text) as typeof j) : {};
      } catch {
        throw new Error(text.slice(0, 300) || `HTTP ${r.status}`);
      }
      if (!r.ok) throw new Error(j.error ?? `Replay failed (${r.status})`);
      const newRunId = j.run_id;
      if (newRunId) router.push(`/runs/${newRunId}`);
      else throw new Error("API did not return a new run_id");
    } catch (e) {
      setReplayError(e instanceof Error ? formatApiError(e) : String(e));
    } finally {
      setReplayBusy(null);
    }
  }

  if (failed.length === 0) {
    return (
      <CardSection title="Repair">
        <EmptyState title="No failed nodes" description="Use this tab when a run has failed job runs. You can replay the subgraph from a failed node." />
      </CardSection>
    );
  }
  return (
    <CardSection title="Repair">
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
        <strong>Replay subgraph</strong> asks the control plane to create a <em>new run</em> using the same plan so jobs can execute again (today this is a full-plan replay; the failed node id is kept for context). You are redirected to the new run when it succeeds.
      </p>
      {replayError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200 mb-3">
          {replayError}
        </div>
      )}
      <ul className="space-y-3">
        {failed.map((j) => (
          <li key={j.plan_node_id} className="rounded border border-slate-200 dark:border-slate-700 p-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{String(j.plan_node_id).slice(0, 8)}…</span>
            <span className="text-slate-500 text-sm truncate max-w-[280px]" title={j.error_signature}>{j.error_signature ?? "—"}</span>
            <Link href={`/graph/repair-preview?run_id=${encodeURIComponent(runId)}&node_id=${encodeURIComponent(j.plan_node_id)}`} className="text-brand-600 hover:underline text-sm">
              Repair Preview
            </Link>
            <Button size="sm" onClick={() => replaySubgraph(j.plan_node_id)} disabled={replayBusy !== null}>
              {replayBusy === j.plan_node_id ? "Replaying…" : "Replay subgraph"}
            </Button>
          </li>
        ))}
      </ul>
    </CardSection>
  );
}

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const noEmailArtifact = searchParams.get("no_email_artifact") === "1";
  const [data, setData] = useState<RunDetail | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallRow[]>([]);
  const [validations, setValidations] = useState<ValidationRow[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntryRow[]>([]);
  const [logEntriesTotal, setLogEntriesTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [llmCalls, setLlmCalls] = useState<LlmCallRow[]>([]);
  const [auditItems, setAuditItems] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(noEmailArtifact ? "artifacts" : "overview");
  const [confirmAction, setConfirmAction] = useState<"cancel" | "rollback" | null>(null);

  const refetch = useCallback(() => {
    if (!id) return;
    setError(null);
    loadRunDetail(id)
      .then((d) => setData(d))
      .catch((e) => setError(formatApiError(e)));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setError(null);
    loadRunDetail(id)
      .then((d) => setData(d))
      .catch((e) => setError(formatApiError(e)));
  }, [id]);

  // Poll run while status is running/queued so UI updates when reaper or cancel changes status
  useEffect(() => {
    if (!id || !data?.run) return;
    const status = (data.run as { status?: string }).status;
    if (status !== "running" && status !== "queued") return;
    const interval = setInterval(refetch, 10_000);
    return () => clearInterval(interval);
  }, [id, data?.run, refetch]);

  useEffect(() => {
    if (!id || activeTab !== "tool_calls") return;
    fetch(`${controlPlaneApiBase()}/v1/tool_calls?run_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((d: { items?: ToolCallRow[] }) => setToolCalls(d.items ?? []))
      .catch(() => setToolCalls([]));
  }, [id, activeTab]);

  useEffect(() => {
    if (!id || activeTab !== "validations") return;
    fetch(`${controlPlaneApiBase()}/v1/validations?run_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((d: { items?: ValidationRow[] }) => setValidations(d.items ?? []))
      .catch(() => setValidations([]));
  }, [id, activeTab]);

  const fetchLogEntries = useCallback((opts?: { silent?: boolean }) => {
    if (!id) return;
    const silent = opts?.silent === true;
    if (!silent) setLogsLoading(true);
    fetch(`${controlPlaneApiBase()}/v1/runs/${id}/log_entries?limit=200&order=desc`)
      .then((r) => {
        if (r.status === 503) return r.json().then((j: { error?: string }) => { throw new Error(j.error ?? "Log mirror not enabled"); });
        if (!r.ok) return r.json().then((j: { error?: string }) => { throw new Error(j.error ?? "Failed to load logs"); });
        return r.json();
      })
      .then((d: { items?: LogEntryRow[]; total?: number }) => {
        setLogEntries(d.items ?? []);
        setLogEntriesTotal(typeof d.total === "number" ? d.total : (d.items ?? []).length);
      })
      .catch(() => {
        if (!silent) {
          setLogEntries([]);
          setLogEntriesTotal(0);
        }
      })
      .finally(() => {
        if (!silent) setLogsLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== "logs") return;
    fetchLogEntries();
  }, [id, activeTab, fetchLogEntries]);

  /** Live tail: poll DB-backed log entries; while run is active, periodically pull from Render into DB. */
  useEffect(() => {
    if (!id || activeTab !== "logs") return;
    const status = String((data?.run as { status?: string } | undefined)?.status ?? "");
    const runStillGoing = status === "running" || status === "queued";

    const pollDb = setInterval(() => fetchLogEntries({ silent: true }), 5_000);

    const pullRender = () => {
      fetch(`${controlPlaneApiBase()}/v1/runs/${id}/ingest_logs`, { method: "POST" })
        .then((r) => r.json().catch(() => ({})))
        .then(() => fetchLogEntries({ silent: true }))
        .catch(() => {});
    };

    let ingestIv: ReturnType<typeof setInterval> | undefined;
    if (runStillGoing) {
      pullRender();
      ingestIv = setInterval(pullRender, 45_000);
    }

    return () => {
      clearInterval(pollDb);
      if (ingestIv) clearInterval(ingestIv);
    };
  }, [id, activeTab, data?.run, fetchLogEntries]);

  async function handleIngestLogs() {
    if (!id) return;
    setIngestBusy(true);
    setIngestMessage(null);
    try {
      const r = await fetch(`${controlPlaneApiBase()}/v1/runs/${id}/ingest_logs`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
      if (r.status === 503) throw new Error(j.error ?? "Log mirror not enabled");
      if (!r.ok) throw new Error(j.error ?? "Ingest failed");
      if (typeof j.message === "string") setIngestMessage(j.message);
      fetchLogEntries();
    } catch (e) {
      setIngestMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIngestBusy(false);
    }
  }

  useEffect(() => {
    if (!id || activeTab !== "ai_calls") return;
    fetch(`${controlPlaneApiBase()}/v1/llm_calls?run_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((d: { items?: LlmCallRow[] }) => setLlmCalls(d.items ?? []))
      .catch(() => setLlmCalls([]));
  }, [id, activeTab]);

  useEffect(() => {
    if (!id || activeTab !== "secrets") return;
    fetch(`${controlPlaneApiBase()}/v1/audit?run_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((d: { items?: AuditRow[] }) => setAuditItems(d.items ?? []))
      .catch(() => setAuditItems([]));
  }, [id, activeTab]);

  async function handleRerun() {
    setActionBusy("rerun");
    try {
      const r = await fetch(`${controlPlaneApiBase()}/v1/runs/${id}/rerun`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Rerun failed");
      router.push(`/runs/${j.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rerun failed");
    } finally {
      setActionBusy(null);
    }
  }

  function openCancelConfirm() {
    setConfirmAction("cancel");
  }

  function openRollbackConfirm() {
    setConfirmAction("rollback");
  }

  async function doCancel() {
    setConfirmAction(null);
    setActionBusy("cancel");
    try {
      const r = await fetch(`${controlPlaneApiBase()}/v1/runs/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Cancel failed");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function doRollback() {
    setConfirmAction(null);
    setActionBusy("rollback");
    try {
      const r = await fetch(`${controlPlaneApiBase()}/v1/runs/${id}/rollback`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Rollback failed");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setActionBusy(null);
    }
  }

  function onConfirmDialogAction() {
    if (confirmAction === "cancel") void doCancel();
    else if (confirmAction === "rollback") void doRollback();
  }

  async function handleApprove(action: "approve" | "reject") {
    setActionBusy(action);
    try {
      const r = await fetch(`${controlPlaneApiBase()}/v1/approvals`, {
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

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title={`Run ${id?.slice(0, 8) ?? "…"}…`} description="Run detail" />
          <p className="text-red-600">Error: {error}</p>
          {error.toLowerCase().includes("not found") && (
            <p className="text-slate-600 text-sm">The run may not exist in this environment, or the API may be pointing at a different database. Check Pipeline Runs for this run, or try again from the wizard.</p>
          )}
          <Link href="/runs" className="text-brand-600 hover:underline text-sm">← Back to Pipeline Runs</Link>
        </Stack>
      </PageFrame>
    );
  }
  if (!data) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title={`Run ${id?.slice(0, 8) ?? "…"}…`} description="Run detail" />
          <p className="text-slate-500">Loading run…</p>
          <p className="text-slate-400 text-sm">If this stays loading, the Control Plane may be slow or unreachable. Check that <code className="bg-surface-sunken px-1 rounded text-xs">NEXT_PUBLIC_CONTROL_PLANE_API</code> points to the same API that created the run.</p>
          <Link href="/runs" className="text-brand-600 hover:underline text-sm">← Pipeline Runs</Link>
        </Stack>
      </PageFrame>
    );
  }

  const run = data.run as Record<string, unknown>;

  const toolCallColumns: Column<ToolCallRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{String(r.id).slice(0, 8)}…</span> },
    { key: "capability", header: "Capability" },
    { key: "operation_key", header: "Operation" },
    { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "succeeded" ? "success" : r.status === "failed" ? "error" : "neutral"}>{r.status}</Badge> },
    { key: "started_at", header: "Started", render: (r) => r.started_at ? new Date(r.started_at).toLocaleString() : "—" },
  ];

  const artifacts = data?.artifacts ?? [];
  const landingPageArtifacts = artifacts.filter((a) => a.artifact_type === "landing_page");
  const artifactColumns: Column<ArtifactRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{String(r.id).slice(0, 8)}…</span> },
    { key: "artifact_class", header: "Class" },
    { key: "artifact_type", header: "Type" },
    { key: "uri", header: "URI", render: (r) => <span className="truncate max-w-[200px] block" title={r.uri}>{r.uri}</span> },
    {
      key: "view",
      header: "Preview",
      render: (r) => {
        if (r.artifact_type === "landing_page") {
          return (
            <a href={`${controlPlaneApiBase()}/v1/artifacts/${r.id}/content`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline text-sm font-medium">
              Open preview
            </a>
          );
        }
        if (r.artifact_type === "email_template") {
          return (
            <Link href={`/email-design-generator/artifacts/${r.id}/edit`} className="text-brand-600 hover:underline text-sm font-medium">
              Edit / preview
            </Link>
          );
        }
        return null;
      },
    },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  const VALIDATOR_DESCRIPTIONS: Record<string, string> = {
    "image_assignment:V001": "Hero missing (template requires hero, none resolved)",
    "image_assignment:V002": "Hero used disallowed source (e.g. product image in hero)",
    "image_assignment:V003": "Logo used as hero fallback but template doesn’t allow it (often: no campaign images selected)",
    "image_assignment:V004": "Unresolved image placeholder in output",
    "image_assignment:V005": "Empty required hero module",
    "image_assignment:V006": "Optional/collapse (not evaluated)",
    "image_assignment:V007": "Content slot filled with duplicate of hero image",
    "image_assignment:V008": "Product section binding (not evaluated here)",
    "image_assignment:V009": "Too many assets rejected",
    "image_assignment:V010": "Hero aspect (not validated here)",
    "image_assignment:V011": "Remote image reachability (not checked)",
    "image_assignment:V012": "Placeholder over-allocation (too many content/product slots)",
    "runner_log_check:logo_missing": "Runner logged: logo URL missing",
    "runner_log_check:campaign_copy_missing": "Runner logged: campaign copy not found",
    "runner_log_check:pre_write_failed": "Runner logged: pre-write check failed",
    "runner_log_check:placeholder_mismatch": "Runner logged: placeholder mismatch",
  };
  const validationColumns: Column<ValidationRow>[] = [
    { key: "validator_type", header: "Validator" },
    { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "pass" ? "success" : "error"}>{r.status}</Badge> },
    {
      key: "description",
      header: "What it means",
      render: (r) => (
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {VALIDATOR_DESCRIPTIONS[r.validator_type] ?? (r.status === "fail" ? "Rule failed; see Logs for details." : "—")}
        </span>
      ),
    },
    { key: "job_run_id", header: "Job run", render: (r) => r.job_run_id ? <span className="font-mono text-xs">{String(r.job_run_id).slice(0, 8)}…</span> : "—" },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  const isTemplateProofRun = searchParams.get("source") === "template_proof";

  return (
    <PageFrame>
      <Stack>
        {isTemplateProofRun && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">Template proof run</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              This run was created by Template proofing. It does not auto-fix — it records pass/fail and ingests logs. To see why it failed or what the runner did, open the <button type="button" onClick={() => setActiveTab("logs")} className="font-medium underline hover:no-underline">Logs</button> and <button type="button" onClick={() => setActiveTab("validations")} className="font-medium underline hover:no-underline">Validations</button> tabs below. Fix the brand or template (e.g. add campaign images, social links) then re-run from Template proofing.
            </p>
          </div>
        )}
        {/* Pinned context header (Plan 12B.4 C4.5) */}
        {(data.pinned_context || run.repo_commit_base != null || run.routing_reason != null) && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-3 mb-4">
            <p className="text-caption font-medium text-text-muted mb-2">Pinned context</p>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-body-small">
              {data.pinned_context?.runner_image_digest != null && <><dt className="text-text-muted">Runner digest</dt><dd className="font-mono truncate" title={data.pinned_context.runner_image_digest ?? ""}>{String(data.pinned_context.runner_image_digest).slice(0, 16)}…</dd></>}
              {data.pinned_context?.workplane_bundle_version != null && <><dt className="text-text-muted">Workplane bundle</dt><dd>{String(data.pinned_context.workplane_bundle_version)}</dd></>}
              {(data.pinned_context?.release_policy_version ?? run.policy_version) != null && <><dt className="text-text-muted">Policy version</dt><dd>{String(data.pinned_context?.release_policy_version ?? run.policy_version)}</dd></>}
              {run.cohort != null && <><dt className="text-text-muted">Cohort</dt><dd>{String(run.cohort)}</dd></>}
              {run.routing_reason != null && <><dt className="text-text-muted">Routing reason</dt><dd>{String(run.routing_reason)}</dd></>}
              {run.repo_commit_base != null && <><dt className="text-text-muted">Repo commit</dt><dd className="font-mono truncate" title={String(run.repo_commit_base)}>{String(run.repo_commit_base).slice(0, 12)}…</dd></>}
            </dl>
          </div>
        )}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-heading-2 font-bold text-text-primary">Run</h1>
            <p className="mt-1 font-mono text-xs text-text-muted break-all" title={String(run.id)}>{String(run.id)}</p>
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            <Link href="/runs" className="text-brand-600 hover:underline text-sm shrink-0">← Runs</Link>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={handleRerun} disabled={!!actionBusy}>{actionBusy === "rerun" ? "…" : "Re-run"}</Button>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={openCancelConfirm} disabled={!!actionBusy || (run.status !== "running" && run.status !== "queued")}>{actionBusy === "cancel" ? "…" : "Cancel run"}</Button>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={openRollbackConfirm} disabled={!!actionBusy}>{actionBusy === "rollback" ? "…" : "Rollback"}</Button>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => handleApprove("approve")} disabled={!!actionBusy}>{actionBusy === "approve" ? "…" : "Approve"}</Button>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => handleApprove("reject")} disabled={!!actionBusy}>{actionBusy === "reject" ? "…" : "Reject"}</Button>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={handleExportMdd}>Export .mdd</Button>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="flow">Flow</TabsTrigger>
            <TabsTrigger value="tool_calls">Tool Calls</TabsTrigger>
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
            <TabsTrigger value="validations">Validations</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="ai_calls">AI Calls</TabsTrigger>
            <TabsTrigger value="secrets">Secrets Access</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="explainability">Explainability</TabsTrigger>
            <TabsTrigger value="repair">Repair</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CardSection title="Run context">
                <dl className="text-sm space-y-1">
                  <dt className="text-slate-500">Environment</dt><dd>{String(run.environment)}</dd>
                  <dt className="text-slate-500">Cohort</dt><dd>{String(run.cohort ?? "—")}</dd>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="space-y-1">
                    <Badge variant={pipelineRunStatusVariant(String(run.status))}>{String(run.status)}</Badge>
                    {String(run.status) === "partial" && (
                      <p className="text-xs text-slate-500">Some plan nodes succeeded and others failed (e.g. parallel migration branches). Check job runs and artifacts for what completed.</p>
                    )}
                  </dd>
                  <dt className="text-slate-500">Started</dt><dd>{run.started_at ? new Date(String(run.started_at)).toLocaleString() : "—"}</dd>
                  <dt className="text-slate-500">Ended</dt><dd>{run.ended_at ? new Date(String(run.ended_at)).toLocaleString() : "—"}</dd>
                </dl>
              </CardSection>
              <CardSection title="Node progress (eligible_at, status)">
                <ul className="text-sm space-y-1">
                  {(data.node_progress ?? []).map((np: Record<string, unknown>, i: number) => (
                    <li key={i}>
                      Node {String(np.plan_node_id).slice(0, 8)}… — <strong>{String(np.status)}</strong>
                      {np.eligible_at != null && ` (eligible ${new Date(String(np.eligible_at)).toISOString()})`}
                    </li>
                  ))}
                  {(data.node_progress ?? []).length === 0 && <li className="text-slate-500">None</li>}
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
              {landingPageArtifacts.length > 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  <strong>Preview URL:</strong> For landing pages, use the <strong>Open preview</strong> link in the table (or open{" "}
                  <code className="bg-surface-sunken px-1 rounded text-xs">{controlPlaneApiBase()}/v1/artifacts/&lt;artifact_id&gt;/content</code> in a new tab).
                </p>
              )}
              {artifacts.length === 0 ? (
                <EmptyState
                  title="No artifacts"
                  description={
                    noEmailArtifact
                      ? "The run completed but no email artifact was found (we checked several times). This can happen if the runner writes to a different database than the Control Plane, or the job failed to write before reporting success. Use Re-run to try again, or check that your worker uses the same DATABASE_URL as the Control Plane."
                      : (data?.run?.status as string) === "succeeded"
                        ? "Run completed but no artifacts were produced. If this was an email campaign: ensure a runner is connected to the same database as the Control Plane, then Re-run. For other job types, check that the runner executed the job and wrote artifacts."
                        : "Jobs haven't produced artifacts yet. A runner must be running and connected to the same database to claim and execute jobs. If you expect artifacts: start a runner locally (npm run dev:runner with DATABASE_URL, CONTROL_PLANE_URL, LLM_GATEWAY_URL in .env) or ensure the Render worker service is running with those env vars. Then Re-run this run or start a new run."
                  }
                />
              ) : (
                <TableFrame>
                  <DataTable columns={artifactColumns} data={artifacts} keyExtractor={(r) => r.id} />
                </TableFrame>
              )}
            </CardSection>
          </TabsContent>

          <TabsContent value="validations" className="pt-4">
            <CardSection title="Validations">
              <p className="text-sm text-slate-500 mb-3">
                These checks ran after the run completed. <strong>Fail</strong> means the run finished but didn’t meet that rule (e.g. V003: no campaign images → logo was used as hero on a template that doesn’t allow it). For runner output and more context, use the <button type="button" onClick={() => setActiveTab("logs")} className="font-medium text-brand-600 hover:underline">Logs</button> tab.
              </p>
              {validations.length === 0 ? (
                <EmptyState title="No validations" description="No validations recorded for this run." />
              ) : (
                <TableFrame>
                  <DataTable columns={validationColumns} data={validations} keyExtractor={(r) => r.id} />
                </TableFrame>
              )}
            </CardSection>
          </TabsContent>

          <TabsContent value="logs" className="pt-4">
            <CardSection title="Run logs">
              <p className="text-sm text-slate-500 mb-2">
                Runner log lines mirrored into the database for this run (lines must include this run&apos;s id for Render ingest).{" "}
                <strong>Live:</strong> this tab refetches entries every 5s. While status is <strong>running</strong> or <strong>queued</strong>, we also call Render ingest about every 45s (requires{" "}
                <code className="bg-surface-sunken px-1 rounded text-xs">RENDER_API_KEY</code> on the Control Plane). For background ingest on all recent runs, set{" "}
                <code className="bg-surface-sunken px-1 rounded text-xs">ENABLE_RENDER_LOG_INGEST=true</code> on the Control Plane.
              </p>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleIngestLogs} disabled={ingestBusy || logsLoading}>
                  {ingestBusy ? "Ingesting…" : "Refresh logs"}
                </Button>
                {logEntriesTotal > 0 && <span className="text-sm text-slate-500">{logEntriesTotal} line(s)</span>}
              </div>
              {ingestMessage && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2" role="status">
                  {ingestMessage}
                </p>
              )}
              {logsLoading ? (
                <LoadingSkeleton className="h-[300px] w-full rounded-lg" />
              ) : logEntries.length === 0 ? (
                <EmptyState
                  title="No log entries"
                  description="No log lines have been ingested for this run. Enable ENABLE_RENDER_LOG_INGEST on the Control Plane for automatic ingest, or use Refresh logs to pull logs from Render now."
                />
              ) : (
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 max-h-[500px] overflow-y-auto">
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700 text-sm font-mono p-0">
                    {logEntries.map((entry) => (
                      <li key={entry.id} className="px-3 py-1.5 flex gap-2 items-start">
                        <span className="shrink-0 text-slate-500 whitespace-nowrap" title={entry.logged_at}>
                          {new Date(entry.logged_at).toLocaleTimeString()}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300 break-all">{entry.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardSection>
          </TabsContent>

          <TabsContent value="ai_calls" className="pt-4">
            <CardSection title="AI calls">
              {llmCalls.length === 0 ? (
                <EmptyState title="No AI calls" description="No LLM calls recorded for this run. Email/copy jobs that use a template without the LLM fallback do not create entries." />
              ) : (
                <TableFrame>
                  <DataTable
                    columns={([
                      { key: "id", header: "ID", render: (r: LlmCallRow) => <span className="font-mono text-xs">{String(r.id).slice(0, 8)}…</span> },
                      { key: "job_run_id", header: "Job run", render: (r: LlmCallRow) => r.job_run_id ? <span className="font-mono text-xs">{String(r.job_run_id).slice(0, 8)}…</span> : "—" },
                      { key: "model_id", header: "Model" },
                      { key: "tokens_in", header: "Tokens in", render: (r: LlmCallRow) => r.tokens_in ?? "—" },
                      { key: "tokens_out", header: "Tokens out", render: (r: LlmCallRow) => r.tokens_out ?? "—" },
                      { key: "latency_ms", header: "Latency (ms)", render: (r: LlmCallRow) => r.latency_ms ?? "—" },
                      { key: "created_at", header: "Created", render: (r: LlmCallRow) => new Date(r.created_at).toLocaleString() },
                    ]) as Column<LlmCallRow>[]}
                    data={llmCalls}
                    keyExtractor={(r) => r.id}
                  />
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
                {(data.run_events ?? []).map((ev: Record<string, unknown>, i: number) => (
                  <li key={i}>{String(ev.event_type)} at {ev.created_at ? new Date(String(ev.created_at)).toISOString() : ""}</li>
                ))}
                {(data.run_events ?? []).length === 0 && <li className="text-slate-500">None</li>}
              </ul>
            </CardSection>
          </TabsContent>

          <TabsContent value="explainability" className="pt-4">
            <CardSection title="Explainability (failure: error_signature cluster + last job_events + tool_calls)">
              {(() => {
                const failedJobs = (data.job_runs ?? []).filter((j: Record<string, unknown>) => j.status === "failed") as { id: string; plan_node_id: string; error_signature?: string }[];
                const jobEvents = (data.job_events ?? []).slice(0, 20) as { job_run_id: string; event_type: string; payload_json: unknown; created_at: string }[];
                const errorSignatures = [...new Set(failedJobs.map((j) => j.error_signature).filter(Boolean))];
                if (failedJobs.length === 0) {
                  return <p className="text-body-small text-text-muted">No failed job runs. This drawer shows error signatures, last 20 job_events, and tool_calls when the run has failures.</p>;
                }
                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-caption text-text-muted mb-1">Error signature cluster</p>
                      <ul className="text-body-small font-mono">
                        {errorSignatures.map((sig, i) => <li key={i}>{String(sig)}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="text-caption text-text-muted mb-1">Last 20 job_events</p>
                      <ul className="text-body-small space-y-0.5 max-h-48 overflow-y-auto">
                        {jobEvents.map((ev, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-text-muted shrink-0">{new Date(ev.created_at).toISOString()}</span>
                            <span>{ev.event_type}</span>
                            {ev.payload_json != null && <span className="truncate text-text-muted">{JSON.stringify(ev.payload_json).slice(0, 80)}…</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-body-small text-text-muted">Tool calls for this run are in the <button type="button" onClick={() => setActiveTab("tool_calls")} className="font-medium text-brand-600 hover:underline">Tool Calls</button> tab.</p>
                  </div>
                );
              })()}
            </CardSection>
          </TabsContent>

          <TabsContent value="repair" className="pt-4">
            <RepairPreviewPanel runId={id} jobRuns={(data.job_runs ?? []) as { plan_node_id: string; status: string; error_signature?: string }[]} />
          </TabsContent>

          <TabsContent value="notes" className="pt-4 pb-16">
            <CardSection title="Notes">
              <textarea
                className="w-full min-h-[200px] rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                placeholder="Add notes about this run… (TipTap rich editor coming soon)"
              />
            </CardSection>
          </TabsContent>
        </Tabs>
      </Stack>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "cancel" ? "Cancel run?" : confirmAction === "rollback" ? "Trigger rollback?" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "cancel" && "This run will be marked failed. This action cannot be undone."}
              {confirmAction === "rollback" && "Roll back this run’s release in this environment. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDialogAction}
              className={confirmAction === "cancel" ? "bg-red-600 hover:bg-red-700 !text-white opacity-100 focus-visible:ring-red-500" : undefined}
            >
              {confirmAction === "cancel" ? "Cancel run" : confirmAction === "rollback" ? "Rollback" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
