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
          <PageHeader title="Agent Memory" />
          <p className="text-red-600">Error: {String(error)}</p>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Agent Memory"
          description="Persistent key-value memory for agents. Full CRUD in Admin."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
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
