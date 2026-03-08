"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  PageFrame,
  Stack,
  CardSection,
  TableFrame,
  PageHeader,
  DataTable,
  Badge,
  Button,
  EmptyState,
  LoadingSkeleton,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useBrandProfiles, useEmailTemplates } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type ProofRunRow = {
  id: string;
  batch_id: string;
  template_id: string;
  run_id: string | null;
  brand_profile_id: string;
  status: string;
  artifact_count: number;
  created_at: string;
  completed_at: string | null;
};

type TemplateRow = { id: string; name?: string };

function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "timed_out") return "error";
  if (status === "running" || status === "queued") return "warning";
  return "neutral";
}

export default function TemplateProofingPage() {
  const [proofItems, setProofItems] = useState<ProofRunRow[]>([]);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [brandProfileId, setBrandProfileId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  const { data: brandsData } = useBrandProfiles({ limit: 100 });
  const { data: templatesData, isLoading: templatesLoading } = useEmailTemplates({ limit: 100 });

  const fetchProofRuns = useCallback(() => {
    setProofLoading(true);
    setProofError(null);
    fetch(`${API}/v1/template_proof?latest_per_template=1`)
      .then((r) => {
        if (r.status === 503) return r.json().then((j: { error?: string }) => { throw new Error(j.error ?? "Template proof not available"); });
        if (!r.ok) return r.json().then((j: { error?: string }) => { throw new Error(j.error ?? "Failed to load proof runs"); });
        return r.json();
      })
      .then((d: { items?: ProofRunRow[] }) => setProofItems(d.items ?? []))
      .catch((e) => { setProofError(e instanceof Error ? e.message : String(e)); setProofItems([]); })
      .finally(() => setProofLoading(false));
  }, []);

  useEffect(() => { fetchProofRuns(); }, [fetchProofRuns]);

  const templates = (templatesData?.items ?? []) as TemplateRow[];
  const brands = brandsData?.items ?? [];
  const proofByTemplate = new Map<string, ProofRunRow>();
  for (const p of proofItems) proofByTemplate.set(p.template_id, p);

  const tableData = templates.map((t) => {
    const proof = proofByTemplate.get(t.id);
    return {
      template_id: t.id,
      template_name: t.name ?? t.id.slice(0, 8),
      last_proof_run_id: proof?.run_id ?? null,
      last_status: proof?.status ?? null,
      last_run_at: proof?.created_at ?? null,
      artifact_count: proof?.artifact_count ?? 0,
    };
  });

  async function handleStartProof() {
    if (!brandProfileId.trim()) { setStartError("Select a brand"); return; }
    setStartBusy(true);
    setStartError(null);
    try {
      const r = await fetch(`${API}/v1/template_proof/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_profile_id: brandProfileId.trim(), duration_minutes: durationMinutes }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503) throw new Error((j as { error?: string }).error ?? "Template proof not available");
      if (!r.ok) throw new Error((j as { error?: string }).error ?? "Start failed");
      const batchId = (j as { batch_id?: string }).batch_id;
      setLastBatchId(batchId ?? null);
      fetchProofRuns();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : formatApiError(e));
    } finally {
      setStartBusy(false);
    }
  }

  const columns: Column<typeof tableData[0]>[] = [
    { key: "template_name", header: "Template" },
    {
      key: "last_status",
      header: "Last status",
      render: (r) =>
        r.last_status ? (
          <Badge variant={statusVariant(r.last_status)}>{r.last_status}</Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "last_proof_run_id",
      header: "Last run",
      render: (r) =>
        r.last_proof_run_id ? (
          <Link href={`/runs/${r.last_proof_run_id}`} className="text-brand-600 hover:underline font-mono text-xs">
            {String(r.last_proof_run_id).slice(0, 8)}…
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "last_run_at",
      header: "Last run at",
      render: (r) => (r.last_run_at ? new Date(r.last_run_at).toLocaleString() : "—"),
    },
    { key: "artifact_count", header: "Artifacts", render: (r) => r.artifact_count },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Template proofing"
          description="Run every email template with a canonical brand (e.g. Sticky Green) to verify pass/fail. Start a proof run to run for up to 30 minutes; review the table and open runs for Logs/Validations."
        />
        <CardSection title="Start proof run">
          <p className="text-sm text-slate-500 mb-3">
            Select a brand profile and duration. The Control Plane will create a campaign per template, start a run (sandbox), and record pass/fail. Runs may take a few minutes each.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Brand</label>
              <select
                className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-600 text-sm w-64"
                value={brandProfileId}
                onChange={(e) => setBrandProfileId(e.target.value)}
              >
                <option value="">Select brand…</option>
                {brands.map((b: { id: string; name?: string }) => (
                  <option key={b.id} value={b.id}>{b.name ?? b.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Duration (min)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
                className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-600 text-sm w-20 px-2 py-1"
              />
            </div>
            <Button onClick={handleStartProof} disabled={startBusy}>
              {startBusy ? "Starting…" : "Start proof run"}
            </Button>
          </div>
          {startError && <p className="text-red-600 text-sm mt-2">{startError}</p>}
          {lastBatchId && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Batch started: <span className="font-mono">{lastBatchId.slice(0, 8)}…</span> — runs are created in the background. Refresh the table below to see progress.
            </p>
          )}
        </CardSection>
        <CardSection title="Templates and latest proof result">
          <div className="mb-2">
            <Button variant="secondary" size="sm" onClick={fetchProofRuns} disabled={proofLoading}>
              {proofLoading ? "Loading…" : "Refresh"}
            </Button>
          </div>
          {proofError && <p className="text-red-600 text-sm mb-2">{proofError}</p>}
          {templatesLoading ? (
            <LoadingSkeleton className="h-48 w-full rounded-md" />
          ) : tableData.length === 0 ? (
            <EmptyState
              title="No templates"
              description="Create email templates under Document Templates (email type) or add via the Control Plane. Then start a proof run with a brand selected."
            />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={tableData} keyExtractor={(r) => r.template_id} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
