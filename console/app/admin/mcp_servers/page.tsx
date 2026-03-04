"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge, Button } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useMcpServers } from "@/hooks/use-api";
import type { McpServerRow } from "@/lib/api";

export default function AdminMcpServersPage() {
  const { data, isLoading, error } = useMcpServers({ limit: 50 });

  const columns: Column<McpServerRow>[] = [
    { key: "name", header: "Name", render: (row) => <Link href={`/admin/mcp_servers/${row.id}`} className="font-medium text-brand-600 hover:underline">{row.name}</Link> },
    { key: "server_type", header: "Type", render: (row) => <Badge variant={row.server_type === "http" ? "success" : "neutral"}>{row.server_type}</Badge> },
    { key: "url_or_cmd", header: "URL / Command", render: (row) => <span className="font-mono text-caption-small">{row.url_or_cmd}</span> },
    { key: "capabilities", header: "Capabilities", render: (row) => row.capabilities?.join(", ") ?? "—" },
    { key: "active", header: "Active", render: (row) => <Badge variant={row.active ? "success" : "error"}>{row.active ? "Yes" : "No"}</Badge> },
    { key: "created_at", header: "Created", render: (row) => new Date(row.created_at).toLocaleString() },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="MCP Servers"
          description="Model Context Protocol server connections. Runners use these to invoke external tools (GitHub, filesystem, browser, etc.)."
          actions={<Link href="/admin/mcp_servers/new"><Button variant="primary">New MCP Server</Button></Link>}
        />
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
            <EmptyState title="No MCP servers configured" description="Add MCP server config in the database (mcp_server_config table) or via POST /v1/mcp_servers." />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
