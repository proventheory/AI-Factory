"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, Button, EmptyState, LoadingSkeleton } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { OperatorActionBar, MetricCard } from "@/components/crm";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type PendingRow = {
  id: string;
  run_id: string;
  plan_node_id: string;
  requested_at: string;
  requested_reason: string | null;
  context_ref: string | null;
  node_key: string;
  job_type: string;
};

export default function ApprovalsPage() {
  const [items, setItems] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchPending = useCallback(() => {
    setLoading(true);
    fetch(`${API}/v1/approvals/pending`)
      .then((r) => r.json())
      .then((d: { items?: PendingRow[] }) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleApprove = async (runId: string, planNodeId: string) => {
    const key = `${runId}:${planNodeId}`;
    setSubmitting(key);
    try {
      const r = await fetch(`${API}/v1/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, plan_node_id: planNodeId, action: "approve" }),
      });
      if (!r.ok) throw new Error(await r.text());
      await fetchPending();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async (runId: string, planNodeId: string) => {
    const key = `${runId}:${planNodeId}`;
    setSubmitting(key);
    try {
      const r = await fetch(`${API}/v1/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, plan_node_id: planNodeId, action: "reject" }),
      });
      if (!r.ok) throw new Error(await r.text());
      await fetchPending();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(null);
    }
  };

  const columns: Column<PendingRow>[] = [
    { key: "run_id", header: "Run", render: (r) => <Link href={`/runs/${r.run_id}`} className="text-brand-600 hover:underline font-mono text-caption-small">{r.run_id.slice(0, 8)}…</Link> },
    { key: "node_key", header: "Node" },
    { key: "job_type", header: "Job type" },
    { key: "requested_at", header: "Requested", render: (r) => new Date(r.requested_at).toLocaleString() },
    {
      key: "id",
      header: "Actions",
      render: (r) => (
        <span className="flex gap-2">
          <Button size="sm" variant="primary" disabled={submitting !== null} onClick={() => handleApprove(r.run_id, r.plan_node_id)}>
            {submitting === `${r.run_id}:${r.plan_node_id}` ? "…" : "Approve"}
          </Button>
          <Button size="sm" variant="secondary" disabled={submitting !== null} onClick={() => handleReject(r.run_id, r.plan_node_id)}>
            Reject
          </Button>
        </span>
      ),
    },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Pending Approvals" description="When a run hits an approval node, it will appear here." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {error}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Pending Approvals"
          description="When a run hits an approval node, it will appear here. Use Approve or Reject to continue."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link> · <Link href="/planner" className="text-brand-600 hover:underline">Planner</Link>
        </p>
        <OperatorActionBar
          metrics={
            <>
              <MetricCard label="Pending" value={items.length} sublabel="awaiting action" />
            </>
          }
        />
        <CardSection>
          {loading ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState title="No pending approvals" description="When a run hits an approval node, it will appear here. Use Approve or Reject to continue." />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
