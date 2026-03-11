"use client";

import Link from "next/link";
import { PageFrame, Stack, TableFrame, PageHeader, LoadingSkeleton, DataTable } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import type { McpServerRow } from "@/lib/api";
import { useMcpServers } from "@/hooks/use-api";

export default function McpServersPage() {
  const { data, isLoading, error } = useMcpServers({ limit: 50 });

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="MCP Servers" description="MCP server configurations." />
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
          title="MCP Servers"
          description="MCP server configurations. Manage in Admin for full CRUD."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/admin/mcp_servers" className="text-brand-600 hover:underline">Admin → MCP Servers</Link>
        </p>
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <>
            <TableFrame>
              <DataTable
                columns={([
                  { key: "name", header: "Name" },
                  { key: "server_type", header: "Type" },
                  { key: "url_or_cmd", header: "URL / Command", render: (r) => (r.url_or_cmd as string)?.slice(0, 40) + "…" },
                  { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
                  {
                    key: "id",
                    header: "Actions",
                    render: (r) => (
                      <Link href={`/admin/mcp_servers/${r.id}`} className="text-brand-600 hover:underline">
                        Edit
                      </Link>
                    ),
                  },
                ]) as Column<McpServerRow>[]}
                data={data?.items ?? []}
                keyExtractor={(r) => r.id}
              />
            </TableFrame>
            <Link href="/admin/mcp_servers" className="text-sm text-brand-600 hover:underline">
              Full MCP admin →
            </Link>
          </>
        )}
      </Stack>
    </PageFrame>
  );
}
