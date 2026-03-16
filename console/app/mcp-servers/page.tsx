"use client";

import Link from "next/link";
import { PageFrame, Stack, TableFrame, PageHeader, LoadingSkeleton, DataTable, CardSection, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import type { McpServerRow } from "@/lib/api";
import { useMcpServers } from "@/hooks/use-api";

const MCP_TOP_COMMANDS = [
  { method: "GET", path: "/v1/mcp_servers", purpose: "List MCP server configs" },
  { method: "GET", path: "/v1/mcp_servers/:id", purpose: "Get one server" },
  { method: "POST", path: "/v1/mcp_servers", purpose: "Create server (name, server_type, url_or_cmd, …)" },
  { method: "PATCH", path: "/v1/mcp_servers/:id", purpose: "Update server" },
  { method: "DELETE", path: "/v1/mcp_servers/:id", purpose: "Delete server (x-role: admin)" },
  { method: "POST", path: "/v1/mcp_servers/:id/test", purpose: "Test connection" },
];

export default function McpServersPage() {
  const { data, isLoading, error } = useMcpServers({ limit: 50 });
  const items = data?.items ?? [];

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
          description="MCP server configurations. Manage in Admin for full CRUD. Runners use these to call MCP tools during jobs."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/admin/mcp_servers" className="text-brand-600 hover:underline">Admin → MCP Servers</Link>
        </p>
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : items.length === 0 ? (
          <CardSection>
            <EmptyState
              title="No MCP servers configured"
              description="Add servers in Admin → MCP Servers (or POST /v1/mcp_servers). Use the commands below to list, create, or test."
            />
          </CardSection>
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
                data={items}
                keyExtractor={(r) => r.id}
              />
            </TableFrame>
            <Link href="/admin/mcp_servers" className="text-sm text-brand-600 hover:underline">
              Full MCP admin →
            </Link>
          </>
        )}
        <CardSection title="Top commands (API)">
          <p className="text-body-small text-text-muted mb-3">
            Control Plane API for MCP server config. Full list: <code className="bg-surface-sunken px-1 rounded">docs/reference/cli-commands.md</code> § MCP servers.
          </p>
          <ul className="space-y-2 text-body-small font-mono">
            {MCP_TOP_COMMANDS.map((c) => (
              <li key={c.path} className="flex flex-wrap gap-x-2 gap-y-1">
                <span className="text-brand-600 font-semibold">{c.method}</span>
                <span className="text-text-secondary">{c.path}</span>
                <span className="text-text-muted">— {c.purpose}</span>
              </li>
            ))}
          </ul>
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
