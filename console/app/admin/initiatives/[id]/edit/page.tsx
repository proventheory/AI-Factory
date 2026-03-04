"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card, CardContent, Button, Input, Select } from "@/components/ui";
import { useInitiative, useUpdateInitiative } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";

const resource = getResource("initiatives")!;

export default function AdminInitiativeEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading, error } = useInitiative(id);
  const updateMutation = useUpdateInitiative();
  const [intent_type, setIntentType] = useState("");
  const [title, setTitle] = useState("");
  const [risk_level, setRiskLevel] = useState<"low" | "med" | "high">("low");
  const [source_ref, setSourceRef] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setIntentType(data.intent_type ?? "");
      setTitle((data as { title?: string | null }).title ?? "");
      setRiskLevel((data.risk_level as "low" | "med" | "high") || "low");
      setSourceRef((data as { source_ref?: string }).source_ref ?? "");
    }
  }, [data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        id,
        body: { intent_type, title: title || null, risk_level, source_ref: source_ref || undefined },
      });
      router.push(`/admin/initiatives/${id}`);
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  };

  if (error) {
    return (
      <div>
        <PageHeader title={`Edit ${resource.label}`} />
        <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
          Error: {(error as Error).message}
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader title={`Edit ${resource.label}`} />
        <Card>
          <CardContent className="p-4">
            <div className="h-32 animate-pulse rounded-md bg-surface-sunken" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${resource.label} — ${String(data.id).slice(0, 8)}…`}
        description="Internal use only."
      />
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            {submitError && (
              <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
                {submitError}
              </div>
            )}
            <div>
              <label className="mb-1 block text-body-small font-medium text-text-primary">Intent type *</label>
              <Input
                value={intent_type}
                onChange={(e) => setIntentType(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-body-small font-medium text-text-primary">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-body-small font-medium text-text-primary">Risk level</label>
              <Select value={risk_level} onChange={(e) => setRiskLevel(e.target.value as "low" | "med" | "high")}>
                <option value="low">Low</option>
                <option value="med">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-body-small font-medium text-text-primary">Source ref</label>
              <Input value={source_ref} onChange={(e) => setSourceRef(e.target.value)} className="w-full" />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              <Link href={`/admin/initiatives/${id}`}>
                <Button type="button" variant="secondary">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
