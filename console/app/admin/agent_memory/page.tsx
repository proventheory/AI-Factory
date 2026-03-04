"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useAgentMemory } from "@/hooks/use-api";
import type { AgentMemoryRow } from "@/lib/api";
import { getResource } from "@/lib/admin-registry";

const resource = getResource("agent_memory")!;

export default function AdminAgentMemoryListPage() {
  const { data, isLoading, error } = useAgentMemory({ limit: 100 });

  const columns: Column<AgentMemoryRow>[] = [
    { key: "id", header: "ID", render: (row) => (
      <Link href={`/admin/agent_memory/${row.id}`} className="font-mono text-caption-small text-brand-600 hover:underline">
        {row.id.slice(0, 8)}…
      </Link>
    )},
    { key: "initiative_id", header: "Initiative", render: (row) => row.initiative_id ? <span className="font-mono text-caption-small">{row.initiative_id.slice(0, 8)}…</span> : "—" },
    { key: "scope", header: "Scope", render: (row) => <Badge variant="neutral">{row.scope}</Badge> },
    { key: "key", header: "Key" },
    { key: "value", header: "Value", render: (row) => <span className="text-body-small text-text-secondary truncate max-w-[200px] inline-block">{row.value?.slice(0, 80)}{(row.value?.length ?? 0) > 80 ? "…" : ""}</span> },
    { key: "created_at", header: "Created", render: (row) => new Date(row.created_at).toLocaleString() },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader title={resource.label} description="Agent memory entries — knowledge persisted across runs by initiative/scope." />
        <CardSection>
          {isLoading ? (
            <LoadingSkeleton className="h-64 w-full rounded-md" />
          ) : error ? (
            <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
              {(error as Error).message}
            </div>
          ) : data?.items && data.items.length > 0 ? (
            <TableFrame>
              <DataTable columns={columns} data={data.items} keyExtractor={(row) => row.id} />
            </TableFrame>
          ) : (
            <EmptyState title="No agent memory entries" description="Memory entries are created when Runners write to agent_memory during job execution." />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
