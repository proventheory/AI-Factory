"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PageFrame, Stack, CardSection, PageHeader, Tabs, TabsList, TabsTrigger, TabsContent, LoadingSkeleton, Button } from "@/components/ui";

const PlanDagViewer = dynamic(
  () => import("@/components/flow/PlanDagViewer").then((m) => ({ default: m.PlanDagViewer })),
  { ssr: false, loading: () => <LoadingSkeleton className="h-[500px] w-full rounded-lg" /> },
);

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type PlanNode = { id: string; node_key: string; job_type: string; node_type: string; risk_level: string | null; agent_role?: string | null };
type PlanEdge = { from_node_id: string; to_node_id: string; condition: string };

export default function PlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [nodes, setNodes] = useState<PlanNode[]>([]);
  const [edges, setEdges] = useState<PlanEdge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [startBusy, setStartBusy] = useState(false);
  const [llmSource, setLlmSource] = useState<"gateway" | "openai_direct">("gateway");

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/v1/plans/${id}`)
      .then((r) => r.json())
      .then((d: { plan?: Record<string, unknown>; nodes?: PlanNode[]; edges?: PlanEdge[] }) => {
        setPlan(d.plan ?? null);
        setNodes(d.nodes ?? []);
        setEdges(d.edges ?? []);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function handleStartRun() {
    setStartBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/v1/plans/${id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: "sandbox", llm_source: llmSource }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Start run failed");
      if (j.id) router.push(`/runs/${j.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start run failed");
    } finally {
      setStartBusy(false);
    }
  }

  if (error) return <PageFrame><p className="text-red-600">Error: {error}</p></PageFrame>;
  if (!plan) return <PageFrame><LoadingSkeleton className="h-64 w-full rounded-lg" /></PageFrame>;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title={`Plan ${String(plan.id).slice(0, 8)}…`}
          description={`Initiative: ${String(plan.initiative_title ?? plan.initiative_id)} · Hash: ${String(plan.plan_hash).slice(0, 16)}…`}
          actions={
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span>LLM:</span>
                <select
                  value={llmSource}
                  onChange={(e) => setLlmSource(e.target.value as "gateway" | "openai_direct")}
                  className="rounded border border-slate-300 px-2 py-1 bg-white text-slate-900"
                >
                  <option value="gateway">Gateway (recommended)</option>
                  <option value="openai_direct">Direct OpenAI</option>
                </select>
              </label>
              <Button variant="primary" onClick={handleStartRun} disabled={startBusy}>
                {startBusy ? "Starting…" : "Start run"}
              </Button>
              <Link href="/plans" className="text-brand-600 hover:underline text-sm">← Plans</Link>
            </div>
          }
        />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="graph">Graph</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CardSection title={`Nodes (${nodes.length})`}>
                <ul className="space-y-1 text-sm">
                  {nodes.map((n) => (
                    <li key={n.id} className="flex gap-2 items-center">
                      <span className="font-mono">{n.node_key}</span>
                      <span className="text-slate-500">— {n.job_type} ({n.node_type})</span>
                      {n.agent_role && <span className="px-1.5 py-0.5 rounded bg-brand-100 text-brand-800 text-xs">{n.agent_role}</span>}
                      {n.risk_level && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-xs">{n.risk_level}</span>}
                    </li>
                  ))}
                  {nodes.length === 0 && <li className="text-slate-500">No nodes</li>}
                </ul>
              </CardSection>
              <CardSection title={`Edges (${edges.length})`}>
                <ul className="space-y-1 text-sm font-mono">
                  {edges.map((e, i) => (
                    <li key={i}>{e.from_node_id.slice(0, 8)}… → {e.to_node_id.slice(0, 8)}… ({e.condition})</li>
                  ))}
                  {edges.length === 0 && <li className="text-slate-500">No edges</li>}
                </ul>
              </CardSection>
            </div>
          </TabsContent>

          <TabsContent value="graph" className="pt-4">
            <CardSection title="Plan DAG">
              <PlanDagViewer planId={id} />
            </CardSection>
          </TabsContent>
        </Tabs>
      </Stack>
    </PageFrame>
  );
}
