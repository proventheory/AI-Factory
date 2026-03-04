"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, Card, CardContent, Button, Input } from "@/components/ui";
import { useAgentMemoryById } from "@/hooks/use-api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

export default function AdminAgentMemoryEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading } = useAgentMemoryById(id);
  const [scope, setScope] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) { setScope(data.scope); setKey(data.key); setValue(data.value); }
  }, [data]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/v1/agent_memory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": "operator" },
        body: JSON.stringify({ scope, key, value }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/admin/agent_memory/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <PageFrame><PageHeader title="Edit Agent Memory" /><div className="h-32 animate-pulse rounded-md bg-surface-sunken" /></PageFrame>;

  return (
    <PageFrame>
      <Stack>
        <PageHeader title={`Edit — ${key || id.slice(0, 8)}`} />
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              {error && <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{error}</div>}
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">Scope</label>
                <Input value={scope} onChange={e => setScope(e.target.value)} required />
              </div>
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">Key</label>
                <Input value={key} onChange={e => setKey(e.target.value)} required />
              </div>
              <div>
                <label className="block text-body-small font-medium text-text-primary mb-1">Value</label>
                <textarea value={value} onChange={e => setValue(e.target.value)} rows={8} className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2 text-body-small font-mono" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
                <Button type="button" variant="secondary" onClick={() => router.push(`/admin/agent_memory/${id}`)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </Stack>
    </PageFrame>
  );
}
