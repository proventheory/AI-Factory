"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card, CardContent, Button, Input, Select } from "@/components/ui";
import { useCreateInitiative } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import { INTENT_TYPES } from "@/config/intent-types";

const resource = getResource("initiatives")!;

export default function AdminInitiativesNewPage() {
  const router = useRouter();
  const [intent_type, setIntentType] = useState("");
  const [intent_type_other, setIntentTypeOther] = useState("");
  const [title, setTitle] = useState("");
  const [risk_level, setRiskLevel] = useState<"low" | "med" | "high">("low");
  const [source_ref, setSourceRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resolvedIntent = intent_type === "other" ? intent_type_other.trim() : intent_type;
  const createMutation = useCreateInitiative();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!resolvedIntent) {
      setError("Intent type is required.");
      return;
    }
    createMutation.mutate(
      {
        intent_type: resolvedIntent,
        title: title.trim() || null,
        risk_level,
        source_ref: source_ref.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          router.push(`/admin/initiatives/${data.id}`);
        },
        onError: (err) => {
          setError((err as Error).message);
        },
      }
    );
  };

  return (
    <div>
      <PageHeader
        title={`New ${resource.label}`}
        description="Create a new initiative. Internal use only."
      />
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            {error && (
              <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
                {error}
              </div>
            )}
            <div>
              <label className="mb-1 block text-body-small font-medium text-text-primary">Intent type *</label>
              <Select
                value={intent_type}
                onChange={(e) => setIntentType(e.target.value)}
                className="w-full"
              >
                <option value="">Select pipeline type…</option>
                {INTENT_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
                <option value="other">Other (custom)</option>
              </Select>
              {intent_type === "other" && (
                <Input
                  value={intent_type_other}
                  onChange={(e) => setIntentTypeOther(e.target.value)}
                  placeholder="e.g. custom_pipeline"
                  className="mt-2 w-full"
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-body-small font-medium text-text-primary">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional title"
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-body-small font-medium text-text-primary">Risk level</label>
              <Select
                value={risk_level}
                onChange={(e) => setRiskLevel(e.target.value as "low" | "med" | "high")}
              >
                <option value="low">Low</option>
                <option value="med">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-body-small font-medium text-text-primary">Source ref</label>
              <Input
                value={source_ref}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder="Optional source reference"
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
              <Link href="/admin/initiatives">
                <Button type="button" variant="secondary">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
