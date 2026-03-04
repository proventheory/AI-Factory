"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, Card, CardContent, Button, Input, Select } from "@/components/ui";
import { useMcpServer } from "@/hooks/use-api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

export default function AdminMcpServerEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading } = useMcpServer(id);
  const [name, setName] = useState("");
  const [serverType, setServerType] = useState("http");
  const [urlOrCmd, setUrlOrCmd] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setServerType(data.server_type);
      setUrlOrCmd(data.url_or_cmd);
      setCapabilities(data.capabilities?.join(", ") ?? "");
    }
  }, [data]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const caps = capabilities.split(",").map(s => s.trim()).filter(Boolean);
      const res = await fetch(`${API}/v1/mcp_servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": "admin" },
        body: JSON.stringify({ name, server_type: serverType, url_or_cmd: urlOrCmd, capabilities: caps.length ? caps : null }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/admin/mcp_servers/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <PageFrame><PageHeader title="Edit MCP Server" /><div className="h-32 animate-pulse rounded-md bg-surface-sunken" /></PageFrame>;

  return (
    <PageFrame>
      <Stack>
        <PageHeader title={`Edit — ${name || id.slice(0, 8)}`} />
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              {error && <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{error}</div>}
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
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
                <Input value={urlOrCmd} onChange={e => setUrlOrCmd(e.target.value)} required />
              </div>
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">Capabilities</label>
                <Input value={capabilities} onChange={e => setCapabilities(e.target.value)} placeholder="github, filesystem" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
                <Button type="button" variant="secondary" onClick={() => router.push(`/admin/mcp_servers/${id}`)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </Stack>
    </PageFrame>
  );
}
