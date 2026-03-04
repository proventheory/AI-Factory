"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageFrame, Stack, CardSection, PageHeader, LoadingSkeleton, Badge, Card, CardContent, Button } from "@/components/ui";
import { useMcpServer } from "@/hooks/use-api";
import { testMcpServer, deleteMcpServer } from "@/lib/api";

export default function AdminMcpServerShowPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading, error } = useMcpServer(id);
  const [testResult, setTestResult] = useState<{ reachable?: boolean; message?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      const result = await testMcpServer(id);
      setTestResult(result);
    } catch (e) {
      setTestResult({ reachable: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  if (error) {
    return (
      <PageFrame><PageHeader title={`MCP Server — ${id.slice(0, 8)}…`} />
        <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{(error as Error).message}</div>
      </PageFrame>
    );
  }

  if (isLoading || !data) {
    return <PageFrame><PageHeader title={`MCP Server — ${id.slice(0, 8)}…`} /><LoadingSkeleton className="h-64 w-full rounded-md" /></PageFrame>;
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader title={data.name} description={`${data.server_type} MCP server`} actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleTest} disabled={testing}>{testing ? "Testing…" : "Test Connection"}</Button>
            <Link href={`/admin/mcp_servers/${id}/edit`}><Button variant="secondary">Edit</Button></Link>
            <Button variant="danger" disabled={deleting} onClick={async () => {
              if (!confirm(`Delete MCP server "${data.name}"?`)) return;
              setDeleting(true);
              try { await deleteMcpServer(id); router.push("/admin/mcp_servers"); } catch { setDeleting(false); }
            }}>{deleting ? "Deleting…" : "Delete"}</Button>
          </div>
        } />
        {testResult && (
          <div className={`rounded-lg border px-4 py-3 text-body-small ${testResult.reachable ? "border-state-successMuted bg-state-successMuted/30 text-state-success" : "border-state-dangerMuted bg-state-dangerMuted/30 text-state-danger"}`}>
            {testResult.reachable ? "Connection successful" : `Connection failed${testResult.message ? `: ${testResult.message}` : ""}`}
          </div>
        )}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p><span className="text-text-muted">ID:</span> <span className="font-mono text-body-small">{data.id}</span></p>
            <p><span className="text-text-muted">Name:</span> {data.name}</p>
            <p><span className="text-text-muted">Type:</span> <Badge variant={data.server_type === "http" ? "success" : "neutral"}>{data.server_type}</Badge></p>
            <p><span className="text-text-muted">URL / Command:</span> <span className="font-mono text-body-small">{data.url_or_cmd}</span></p>
            <p><span className="text-text-muted">Active:</span> <Badge variant={data.active ? "success" : "error"}>{data.active ? "Yes" : "No"}</Badge></p>
            <p><span className="text-text-muted">Capabilities:</span> {data.capabilities?.join(", ") ?? "—"}</p>
            <p><span className="text-text-muted">Auth Header:</span> {data.auth_header ? "Set (hidden)" : "—"}</p>
            <p><span className="text-text-muted">Created:</span> {new Date(data.created_at).toLocaleString()}</p>
            {data.args_json != null && <div><span className="text-text-muted">Args:</span><pre className="mt-1 rounded-md bg-surface-sunken p-2 text-caption-small font-mono">{String(JSON.stringify(data.args_json, null, 2))}</pre></div>}
          </CardContent>
        </Card>
        <p><Link href="/admin/mcp_servers" className="text-body-small text-brand-600 hover:underline">← Back to list</Link></p>
      </Stack>
    </PageFrame>
  );
}
