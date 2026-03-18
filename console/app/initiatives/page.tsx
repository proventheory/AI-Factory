"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Button,
  Modal,
  Input,
  Select,
  EmptyState,
  Badge,
  LoadingSkeleton,
  DataTable,
  Pagination,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { ListView, VisibleFieldsOptions } from "@/components/crm";
import { useInitiatives, useCreateInitiative, useBrandProfiles } from "@/hooks/use-api";
import { formatApiError, type InitiativeRow } from "@/lib/api";
import { INTENT_TYPES } from "@/config/intent-types";

const ALL_COLUMN_KEYS = ["id", "intent_type", "title", "risk_level", "created_by", "created_at"];
const DEFAULT_VISIBLE_KEYS = ALL_COLUMN_KEYS;
const PER_PAGE = 10;

function riskVariant(risk: string): "success" | "warning" | "error" | "neutral" {
  if (risk === "high") return "error";
  if (risk === "med") return "warning";
  return "success";
}

const FIELD_OPTIONS = [
  { key: "id", label: "ID" },
  { key: "intent_type", label: "Intent type" },
  { key: "title", label: "Title" },
  { key: "risk_level", label: "Risk" },
  { key: "created_by", label: "Created by" },
  { key: "created_at", label: "Created at" },
];

export default function InitiativesPage() {
  const [intentType, setIntentType] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createIntent, setCreateIntent] = useState("");
  const [createIntentOther, setCreateIntentOther] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createRisk, setCreateRisk] = useState<"low" | "med" | "high">("low");
  const [createSourceRef, setCreateSourceRef] = useState("");
  const [createBrandId, setCreateBrandId] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(DEFAULT_VISIBLE_KEYS);

  const { data: brandsData } = useBrandProfiles({ limit: 100 });
  const brands = brandsData?.items ?? [];
  const { data, isLoading, error } = useInitiatives({
    intent_type: intentType || undefined,
    risk_level: riskLevel || undefined,
    limit: 200,
  });
  const createMutation = useCreateInitiative();
  const allItems = (data?.items ?? []) as InitiativeRow[];

  const pageCount = Math.max(1, Math.ceil(allItems.length / PER_PAGE));
  const start = (page - 1) * PER_PAGE;
  const items = allItems.slice(start, start + PER_PAGE);

  const resolvedIntent = createIntent === "other" ? createIntentOther.trim() : createIntent;
  const handleCreate = () => {
    if (!resolvedIntent || !createRisk) return;
    createMutation.mutate(
      {
        intent_type: resolvedIntent,
        title: createTitle.trim() || null,
        risk_level: createRisk,
        source_ref: createSourceRef.trim() || undefined,
        brand_profile_id: createBrandId.trim() || null,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setCreateIntent("");
          setCreateIntentOther("");
          setCreateTitle("");
          setCreateRisk("low");
          setCreateSourceRef("");
          setCreateBrandId("");
        },
      }
    );
  };

  const allColumns: Column<InitiativeRow>[] = [
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
    {
      key: "risk_level",
      header: "Risk",
      render: (row) => <Badge variant={riskVariant(row.risk_level)}>{row.risk_level}</Badge>,
    },
    { key: "created_by", header: "Created by", render: (row) => row.created_by ?? "—" },
    {
      key: "created_at",
      header: "Created at",
      render: (row) => new Date(row.created_at).toLocaleString(),
    },
  ];

  const columns = useMemo(
    () => allColumns.filter((c) => visibleKeys.includes(c.key)),
    [visibleKeys]
  );

  if (error) {
    return (
      <ListView
        title="Initiatives"
        description="Create and filter initiatives; compile plans to run pipelines."
        empty
        emptyTitle="Error"
        emptyDescription={formatApiError(error)}
      >
        {null}
      </ListView>
    );
  }

  return (
    <>
      <ListView
        title="Initiatives"
        description="Create and manage initiatives by intent type and risk level. Compile a plan from an initiative to run pipelines."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/email-design-generator/new">
              <Button variant="secondary">New email design (wizard)</Button>
            </Link>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Create initiative
            </Button>
          </div>
        }
        filters={
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
            <VisibleFieldsOptions
              columns={FIELD_OPTIONS}
              visibleKeys={visibleKeys}
              onVisibleKeysChange={setVisibleKeys}
              triggerLabel="Fields"
            />
            <p className="text-body-small text-text-muted">
              <Link href="/plans" className="text-brand-600 hover:underline">
                Plans
              </Link>{" "}
              ·{" "}
              <Link href="/runs" className="text-brand-600 hover:underline">
                Pipeline Runs
              </Link>{" "}
              ·{" "}
              <Link href="/graph/explorer" className="text-brand-600 hover:underline">
                Graph Explorer
              </Link>
            </p>
          </div>
        }
        bulkActions={
          selectedRowKeys.length > 0 ? (
            <>
              <span className="text-body-small text-text-muted">
                {selectedRowKeys.length} selected
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedRowKeys([])}
              >
                Clear selection
              </Button>
            </>
          ) : undefined
        }
        empty={!isLoading && items.length === 0}
        emptyTitle="No initiatives yet"
        emptyDescription="Create an initiative to get started."
        emptyAction={<Button variant="primary" onClick={() => setCreateOpen(true)}>Create initiative</Button>}
        pagination={
          pageCount > 1
            ? {
                page,
                pageCount,
                onPageChange: setPage,
              }
            : null
        }
        wrapTable={!isLoading && items.length > 0}
      >
        {isLoading ? (
          <div className="space-y-3">
            <LoadingSkeleton className="h-10 w-full" />
            <LoadingSkeleton className="h-10 w-full" />
            <LoadingSkeleton className="h-10 w-full" />
            <LoadingSkeleton className="h-4/5 w-full" />
          </div>
        ) : items.length === 0 ? null : (
          <DataTable<InitiativeRow>
            columns={columns}
            data={items}
            keyExtractor={(row) => row.id}
            selectionMode="multiple"
            selectedRowKeys={selectedRowKeys}
            onSelectionChange={setSelectedRowKeys}
          />
        )}
      </ListView>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create initiative">
        <div className="space-y-4">
          <label className="block text-body-small text-text-secondary">
            Intent type <span className="text-state-danger">*</span>
            <Select
              className="mt-1"
              value={createIntent}
              onChange={(e) => setCreateIntent(e.target.value)}
            >
              <option value="">Select pipeline type…</option>
              {INTENT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              <option value="other">Other (custom)</option>
            </Select>
            {createIntent === "other" && (
              <Input
                className="mt-2"
                value={createIntentOther}
                onChange={(e) => setCreateIntentOther(e.target.value)}
                placeholder="e.g. vercel_deploy"
              />
            )}
          </label>
          <label className="block text-body-small text-text-secondary">
            Brand (for SEO: connect Google on the brand page)
            <Select className="mt-1" value={createBrandId} onChange={(e) => setCreateBrandId(e.target.value)}>
              <option value="">None</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name ?? b.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-body-small text-text-secondary">
            Title
            <Input
              className="mt-1"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="block text-body-small text-text-secondary">
            Source ref (e.g. issue URL)
            <Input
              className="mt-1"
              value={createSourceRef}
              onChange={(e) => setCreateSourceRef(e.target.value)}
              placeholder="https://github.com/org/repo/issues/1"
            />
          </label>
          <label className="block text-body-small text-text-secondary">
            Risk level <span className="text-state-danger">*</span>
            <Select
              className="mt-1"
              value={createRisk}
              onChange={(e) => setCreateRisk(e.target.value as "low" | "med" | "high")}
            >
              <option value="low">low</option>
              <option value="med">med</option>
              <option value="high">high</option>
            </Select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!resolvedIntent || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
