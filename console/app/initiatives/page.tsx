"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Modal, Input, Select, PageFrame, Stack, CardSection, TableFrame, PageHeader, EmptyState, Badge, LoadingSkeleton, DataTable } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useInitiatives, useCreateInitiative } from "@/hooks/use-api";
import type { InitiativeRow } from "@/lib/api";

function riskVariant(risk: string): "success" | "warning" | "error" | "neutral" {
  if (risk === "high") return "error";
  if (risk === "med") return "warning";
  return "success";
}

export default function InitiativesPage() {
  const [intentType, setIntentType] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createIntent, setCreateIntent] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createRisk, setCreateRisk] = useState<"low" | "med" | "high">("low");
  const [createSourceRef, setCreateSourceRef] = useState("");

  const { data, isLoading, error } = useInitiatives({
    intent_type: intentType || undefined,
    risk_level: riskLevel || undefined,
    limit: 50,
  });
  const createMutation = useCreateInitiative();
  const items = data?.items ?? [];

  const handleCreate = () => {
    if (!createIntent.trim() || !createRisk) return;
    createMutation.mutate(
      {
        intent_type: createIntent.trim(),
        title: createTitle.trim() || null,
        risk_level: createRisk,
        source_ref: createSourceRef.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setCreateIntent("");
          setCreateTitle("");
          setCreateRisk("low");
          setCreateSourceRef("");
        },
      }
    );
  };

  const columns: Column<InitiativeRow>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/initiatives/${row.id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
          {row.id.slice(0, 8)}…
        </Link>
      ),
    },
    { key: "intent_type", header: "Intent type" },
    { key: "title", header: "Title", render: (row) => row.title ?? "—" },
    { key: "risk_level", header: "Risk", render: (row) => <Badge variant={riskVariant(row.risk_level)}>{row.risk_level}</Badge> },
    { key: "created_by", header: "Created by", render: (row) => row.created_by ?? "—" },
    { key: "created_at", header: "Created at", render: (row) => new Date(row.created_at).toLocaleString() },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Initiatives" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {(error as Error).message}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Initiatives"
          description="Create and manage initiatives by intent type and risk level."
          actions={<Button variant="primary" onClick={() => setCreateOpen(true)}>Create initiative</Button>}
        />
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create initiative">
        <div className="space-y-4">
          <label className="block text-body-small text-text-secondary">
            Intent type <span className="text-state-danger">*</span>
            <Input className="mt-1" value={createIntent} onChange={(e) => setCreateIntent(e.target.value)} placeholder="e.g. vercel_deploy" />
          </label>
          <label className="block text-body-small text-text-secondary">
            Title
            <Input className="mt-1" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="Optional" />
          </label>
          <label className="block text-body-small text-text-secondary">
            Source ref (e.g. issue URL)
            <Input className="mt-1" value={createSourceRef} onChange={(e) => setCreateSourceRef(e.target.value)} placeholder="https://github.com/org/repo/issues/1" />
          </label>
          <label className="block text-body-small text-text-secondary">
            Risk level <span className="text-state-danger">*</span>
            <Select className="mt-1" value={createRisk} onChange={(e) => setCreateRisk(e.target.value as "low" | "med" | "high")}>
              <option value="low">low</option>
              <option value="med">med</option>
              <option value="high">high</option>
            </Select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!createIntent.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="text"
            placeholder="Filter by intent type"
            value={intentType}
            onChange={(e) => setIntentType(e.target.value)}
            className="max-w-xs"
          />
          <Select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="w-40">
            <option value="">All risk levels</option>
            <option value="low">low</option>
            <option value="med">med</option>
            <option value="high">high</option>
          </Select>
        </div>
        <CardSection>
          {isLoading ? (
            <div className="space-y-3">
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-4/5" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No initiatives yet"
              description="Create an initiative to get started."
              action={<Button variant="primary" onClick={() => setCreateOpen(true)}>Create initiative</Button>}
            />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(row) => row.id} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
