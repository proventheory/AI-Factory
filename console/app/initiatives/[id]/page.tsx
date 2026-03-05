"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type Initiative = {
  id: string;
  intent_type: string;
  title: string | null;
  risk_level: string;
  created_by: string | null;
  created_at: string;
  goal_state?: string | null;
  source_ref?: string | null;
};

type PlanItem = { id: string; plan_hash: string; created_at: string };

export default function InitiativeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [item, setItem] = useState<Initiative | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compileBusy, setCompileBusy] = useState(false);
  const [startBusy, setStartBusy] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!id) return;
    Promise.all([
      fetch(`${API}/v1/initiatives/${id}`).then((r) => r.json()),
      fetch(`${API}/v1/plans?initiative_id=${id}&limit=20`).then((r) => r.json()),
    ])
      .then(([init, pl]) => {
        setItem(init.error ? null : init);
        setPlans(pl.items ?? []);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function handleCompilePlan() {
    setCompileBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/v1/initiatives/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Compile failed");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compile failed");
    } finally {
      setCompileBusy(false);
    }
  }

  async function handleStartRun(planId: string) {
    setStartBusy(planId);
    setError(null);
    try {
      const r = await fetch(`${API}/v1/plans/${planId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: "sandbox" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Start run failed");
      if (j.id) router.push(`/runs/${j.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start run failed");
    } finally {
      setStartBusy(null);
    }
  }

  if (!item) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/initiatives" className="text-brand-600 hover:underline text-sm">← Initiatives</Link>
        <h1 className="text-2xl font-bold text-slate-900">{item.title || item.intent_type || item.id}</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-semibold text-slate-900 mb-2">Initiative</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">ID</dt><dd className="font-mono">{item.id}</dd>
          <dt className="text-slate-500">Intent type</dt><dd>{item.intent_type}</dd>
          <dt className="text-slate-500">Title</dt><dd>{item.title ?? "—"}</dd>
          <dt className="text-slate-500">Risk level</dt><dd>{item.risk_level}</dd>
          <dt className="text-slate-500">Created by</dt><dd>{item.created_by ?? "—"}</dd>
          <dt className="text-slate-500">Created at</dt><dd>{new Date(item.created_at).toLocaleString()}</dd>
          {item.goal_state != null && (<><dt className="text-slate-500">Goal state</dt><dd><span className="px-2 py-0.5 rounded bg-slate-100 text-xs">{item.goal_state}</span></dd></>)}
          {item.source_ref && (<><dt className="text-slate-500">Source ref</dt><dd><a href={item.source_ref} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline truncate block max-w-md">{item.source_ref}</a></dd></>)}
        </dl>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body-small text-red-800" role="alert">
          {error}
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold text-slate-900">Plans</h2>
          <Button variant="primary" onClick={handleCompilePlan} disabled={compileBusy}>
            {compileBusy ? "Compiling…" : "Compile plan"}
          </Button>
        </div>
        {plans.length === 0 ? (
          <p className="text-slate-500 text-sm">No plans yet. Click &quot;Compile plan&quot; to create one.</p>
        ) : (
          <ul className="space-y-2">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center gap-3 flex-wrap">
                <Link href={`/plans/${p.id}`} className="text-brand-600 hover:underline font-mono text-sm">
                  {p.id.slice(0, 8)}… — {String(p.plan_hash).slice(0, 12)}… — {new Date(p.created_at).toLocaleString()}
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => handleStartRun(p.id)}
                  disabled={startBusy !== null}
                >
                  {startBusy === p.id ? "Starting…" : "Start run"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
