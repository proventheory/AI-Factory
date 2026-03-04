"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, Card, CardContent, Button, Input, Select } from "@/components/ui";
import { createMcpServer } from "@/lib/api";

export default function AdminMcpServerNewPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [serverType, setServerType] = useState("http");
  const [urlOrCmd, setUrlOrCmd] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !urlOrCmd) { setError("Name and URL/Command are required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const caps = capabilities.split(",").map(s => s.trim()).filter(Boolean);
      await createMcpServer({ name, server_type: serverType, url_or_cmd: urlOrCmd, capabilities: caps.length ? caps : undefined });
      router.push("/admin/mcp_servers");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="New MCP Server" description="Register a new MCP server connection." />
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              {error && <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{error}</div>}
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. github" required />
              </div>
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">Type</label>
                <Select value={serverType} onChange={e => setServerType(e.target.value)}>
                  <option value="http">HTTP</option>
                  <option value="stdio">Stdio</option>
                </Select>
              </div>
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">{serverType === "http" ? "URL" : "Command"}</label>
                <Input value={urlOrCmd} onChange={e => setUrlOrCmd(e.target.value)} placeholder={serverType === "http" ? "https://mcp-server.example.com" : "npx -y @modelcontextprotocol/server-filesystem /workspace"} required />
              </div>
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">Capabilities (comma-separated)</label>
                <Input value={capabilities} onChange={e => setCapabilities(e.target.value)} placeholder="github, filesystem, browser" />
              </div>
              <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create MCP Server"}</Button>
            </form>
          </CardContent>
        </Card>
      </Stack>
    </PageFrame>
  );
}
