"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, LoadingSkeleton, EmptyState } from "@/components/ui";
import { formatApiError } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type FlowRow = {
  id: string;
  key: string;
  name: string | null;
  description: string | null;
  status: string;
  invocation_mode: string | null;
};

export default function FlowsPage() {
  const [items, setItems] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [runForm, setRunForm] = useState({ flowId: "", initiativeId: "", environment: "sandbox", idempotencyKey: "" });
  const [createForm, setCreateForm] = useState({ key: "", name: "", description: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`${API}/v1/flows`)
      .then((r) => r.json())
      .then((d: { items?: FlowRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleRun() {
    if (!runForm.flowId || !runForm.initiativeId.trim() || !runForm.idempotencyKey.trim()) {
      setRunResult("initiative_id and idempotency_key are required.");
      return;
    }
    setRunningId(runForm.flowId);
    setRunResult(null);
    try {
      const res = await fetch(`${API}/v1/flows/${runForm.flowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiative_id: runForm.initiativeId.trim(),
          environment: runForm.environment,
          idempotency_key: runForm.idempotencyKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setRunResult(JSON.stringify(data, null, 2));
      setRunForm((f) => ({ ...f, idempotencyKey: "" }));
    } catch (e) {
      setRunResult(`Error: ${formatApiError(e)}`);
    } finally {
      setRunningId(null);
    }
  }

  async function handleCreate() {
    if (!createForm.key.trim()) {
      setRunResult("Key is required.");
      return;
    }
    setCreating(true);
    setRunResult(null);
    try {
      const res = await fetch(`${API}/v1/flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: createForm.key.trim(),
          name: createForm.name.trim() || null,
          description: createForm.description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setItems((prev) => [...prev, { ...data, name: data.name ?? null, description: data.description ?? null, status: data.status ?? "active", invocation_mode: data.invocation_mode ?? null }]);
      setCreateForm({ key: "", name: "", description: "" });
      setRunResult("Flow created.");
    } catch (e) {
      setRunResult(`Error: ${formatApiError(e)}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Saved flows"
          description="Named reusable flows (forever operators). Run by name from Ask or here."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/graph/ask" className="text-brand-600 hover:underline">Ask anything</Link>
          {" · "}
          <Link href="/graph/explorer" className="text-brand-600 hover:underline">Graph Explorer</Link>
        </p>

        {error && <p className="text-body-small text-red-600 mb-4">{error}</p>}

        {/* Create flow */}
        <CardSection title="New flow">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-caption text-text-muted mb-0.5">Key (required)</label>
              <input
                type="text"
                value={createForm.key}
                onChange={(e) => setCreateForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="e.g. seo-cluster"
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-body-small min-w-[140px]"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-0.5">Name</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Display name"
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-body-small min-w-[140px]"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-0.5">Description</label>
              <input
                type="text"
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-body-small min-w-[180px]"
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-body-small font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create flow"}
            </button>
          </div>
        </CardSection>

        {/* List + run */}
        <CardSection title="Flows">
          {loading && <LoadingSkeleton className="h-24 rounded-lg" />}
          {!loading && items.length === 0 && (
            <EmptyState
              title="No saved flows"
              description="Create a flow above or register one via the API. Then run it with an initiative and idempotency key."
            />
          )}
          {!loading && items.length > 0 && (
            <div className="space-y-4">
              {items.map((flow) => (
                <div key={flow.id} className="rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{flow.name ?? flow.key}</p>
                    <p className="text-body-small text-slate-600">{flow.key} · {flow.status}</p>
                    {flow.description && <p className="text-body-small text-slate-500 mt-0.5">{flow.description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRunForm((f) => ({ ...f, flowId: flow.id }))}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-body-small font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Run
                  </button>
                </div>
              ))}
            </div>
          )}

          {runForm.flowId && (
            <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
              <p className="text-body-small font-medium text-slate-700">Run flow</p>
              <input
                type="text"
                value={runForm.initiativeId}
                onChange={(e) => setRunForm((f) => ({ ...f, initiativeId: e.target.value }))}
                placeholder="Initiative ID (required)"
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-body-small w-full max-w-md"
              />
              <input
                type="text"
                value={runForm.idempotencyKey}
                onChange={(e) => setRunForm((f) => ({ ...f, idempotencyKey: e.target.value }))}
                placeholder="Idempotency key (required)"
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-body-small w-full max-w-md"
              />
              <select
                value={runForm.environment}
                onChange={(e) => setRunForm((f) => ({ ...f, environment: e.target.value }))}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-body-small"
              >
                <option value="sandbox">sandbox</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={runningId !== null}
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-body-small font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {runningId ? "Running…" : "Start run"}
                </button>
                <button
                  type="button"
                  onClick={() => setRunForm({ flowId: "", initiativeId: "", environment: "sandbox", idempotencyKey: "" })}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {runResult && (
            <pre className="mt-2 rounded bg-slate-100 p-2 text-body-small text-slate-800 overflow-auto max-h-32">
              {runResult}
            </pre>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
