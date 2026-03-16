"use client";

import Link from "next/link";
import { PageFrame, Stack, TableFrame, PageHeader, LoadingSkeleton, DataTable } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useAgentMemory } from "@/hooks/use-api";

export default function AgentMemoryPage() {
  const { data, isLoading, error } = useAgentMemory({ limit: 50 });

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Agent Memory" description="Persistent key-value memory for agents." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {String(error)}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Agent Memory"
          description="Persistent key-value memory for agents. Configured and ready: Runners write here during jobs; you can create or edit entries in Admin."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/admin/agent_memory" className="text-brand-600 hover:underline">Admin → Agent Memory</Link> · <Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link>
        </p>
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (data?.items ?? []).length === 0 ? (
          <TableFrame>
            <div className="rounded-lg border border-border-default bg-surface-sunken/50 px-4 py-8 text-center text-body-small text-text-muted">
              <p className="font-medium text-text-secondary mb-1">No agent memory entries yet</p>
              <p>Entries are created when Runners write to agent_memory during job execution. You can also create or edit entries in <Link href="/admin/agent_memory" className="text-brand-600 hover:underline">Admin → Agent Memory</Link>.</p>
            </div>
          </TableFrame>
        ) : (
          <>
            <TableFrame>
              <DataTable
                columns={([
                  { key: "scope", header: "Scope" },
                  { key: "key", header: "Key" },
                  { key: "value", header: "Value", render: (r) => (r.value as string)?.slice(0, 60) + "…" },
                  {
                    key: "id",
                    header: "Actions",
                    render: (r) => (
                      <Link href={`/admin/agent_memory/${r.id}`} className="text-brand-600 hover:underline">
                        View
                      </Link>
                    ),
                  },
                ]) as Column<{ scope: string; key: string; value: string; id: string }>[]}
                data={data?.items ?? []}
                keyExtractor={(r) => r.id}
              />
            </TableFrame>
            <Link href="/admin/agent_memory" className="text-sm text-brand-600 hover:underline">
              Full agent memory admin →
            </Link>
          </>
        )}
      </Stack>
    </PageFrame>
  );
}
