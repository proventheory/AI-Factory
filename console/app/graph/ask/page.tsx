"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, LoadingSkeleton } from "@/components/ui";
import { formatApiError } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type GraphSummary = {
  graphs: { graph: string; node_count: number; edge_count: number }[];
  total_nodes: number;
  total_edges: number;
};

type AskPayload = {
  intent_type: string;
  confidence: number;
  requires_approval: boolean;
  resolved_endpoint: string | null;
  resolved_params: Record<string, unknown> | null;
  resolution_type?: string;
  intent_document_id?: string;
  answer?: unknown;
  answer_text?: string;
  graph_result?: {
    graph: string;
    summary?: { node_count: number; edge_count: number };
    nodes?: unknown[];
    edges?: unknown[];
    answer?: string;
  };
};

function formatAnswer(answer: unknown): string {
  if (answer == null) return "";
  if (typeof answer === "string") return answer;
  if (typeof answer === "object" && "error" in (answer as Record<string, unknown>)) return String((answer as Record<string, unknown>).error);
  if (typeof answer === "object" && "graph" in (answer as Record<string, unknown>)) {
    const a = answer as Record<string, unknown>;
    const n = (a.nodes as number) ?? (a.summary as { node_count?: number })?.node_count ?? 0;
    const e = (a.edges as number) ?? (a.summary as { edge_count?: number })?.edge_count ?? 0;
    return `${n} nodes, ${e} edges`;
  }
  return JSON.stringify(answer);
}

export default function GraphAskPage() {
  const [summary, setSummary] = useState<GraphSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<AskPayload | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<string | null>(null);
  const [runIdForExecute, setRunIdForExecute] = useState("");

  useEffect(() => {
    fetch(`${API}/v1/graphs/summary`)
      .then((r) => r.json())
      .then(setSummary)
      .catch((e) => setSummaryError(formatApiError(e)));
  }, []);

  async function handleAsk() {
    if (!query.trim()) return;
    setLoading(true);
    setAskError(null);
    setPayload(null);
    setExecuteResult(null);
    try {
      const res = await fetch(`${API}/v1/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: query.trim(), execute: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setPayload(data);
    } catch (e) {
      setAskError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!payload?.intent_document_id || payload.resolution_type === "graph_query") return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      const res = await fetch(`${API}/v1/ask/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent_document_id: payload.intent_document_id,
          run_id: runIdForExecute.trim() || undefined,
          ...payload.resolved_params,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setExecuteResult(typeof data === "object" ? JSON.stringify(data, null, 2) : String(data));
    } catch (e) {
      setExecuteResult(`Error: ${formatApiError(e)}`);
    } finally {
      setExecuting(false);
    }
  }

  const isAction = payload?.resolved_endpoint != null && payload?.intent_type === "action";

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Ask anything"
          description="Query the platform graph in natural language. Try: blocked tasks, blast radius, topology, governance, catalog, active runs."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/graph/explorer" className="text-brand-600 hover:underline">Graph Explorer</Link>
          {" · "}
          <Link href="/graph/diagnostics" className="text-brand-600 hover:underline">Graph health</Link>
        </p>

        {/* Banner: 5 graphs, X nodes, Y edges */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-6">
          {summaryError && <p className="text-body-small text-red-600">{summaryError}</p>}
          {!summary && !summaryError && <LoadingSkeleton className="h-6 w-64" />}
          {summary && (
            <p className="text-body font-medium text-slate-800">
              {summary.graphs.length} graphs, {summary.total_nodes.toLocaleString()} nodes, {summary.total_edges.toLocaleString()} edges — your platform is now traversable.
            </p>
          )}
        </div>

        {/* Ask input */}
        <CardSection title="Ask">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              placeholder='e.g. blocked tasks, blast radius, topology, governance, catalog'
              className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-body text-slate-900 placeholder:text-slate-400 shadow-sm"
            />
            <button
              type="button"
              onClick={handleAsk}
              disabled={loading}
              className="rounded-md bg-brand-600 px-4 py-2 text-body font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Asking…" : "Ask"}
            </button>
          </div>
          {askError && <p className="mt-2 text-body-small text-red-600">{askError}</p>}
        </CardSection>

        {/* Response */}
        {payload && (
          <CardSection title="Result">
            <div className="space-y-2">
              {(payload.answer_text ?? payload.graph_result?.answer) && (
                <p className="text-body text-slate-800">{payload.answer_text ?? payload.graph_result?.answer}</p>
              )}
              {!payload.answer_text && !payload.graph_result?.answer && payload.answer != null && (
                <p className="text-body text-slate-800">{formatAnswer(payload.answer)}</p>
              )}
              {payload.graph_result?.summary && (
                <p className="text-body-small text-slate-600">
                  Graph: {payload.graph_result.graph} — {payload.graph_result.summary.node_count ?? 0} nodes, {payload.graph_result.summary.edge_count ?? 0} edges
                </p>
              )}
              {isAction && payload.resolved_endpoint && (
                <div className="pt-2 space-y-2">
                  <p className="text-body-small text-slate-600">
                    Action: {payload.resolved_endpoint}
                    {payload.requires_approval && " (requires approval)"}
                  </p>
                  {payload.resolved_endpoint.includes("rerun") && (
                    <input
                      type="text"
                      value={runIdForExecute}
                      onChange={(e) => setRunIdForExecute(e.target.value)}
                      placeholder="Run ID (required for rerun)"
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-body-small text-slate-900 placeholder:text-slate-400 w-full max-w-md"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={executing}
                    className="rounded-md border border-brand-600 bg-white px-3 py-1.5 text-body-small font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                  >
                    {executing ? "Executing…" : "Execute"}
                  </button>
                </div>
              )}
              {executeResult && (
                <pre className="mt-2 rounded bg-slate-100 p-2 text-body-small text-slate-800 overflow-auto max-h-40">
                  {executeResult}
                </pre>
              )}
            </div>
          </CardSection>
        )}
      </Stack>
    </PageFrame>
  );
}
