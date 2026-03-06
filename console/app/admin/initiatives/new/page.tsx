"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card, CardContent, Button, Input, Select } from "@/components/ui";
import { useCreateInitiative, useBrandProfiles } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import { INTENT_TYPES } from "@/config/intent-types";

const resource = getResource("initiatives")!;

function NewInitiativeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [intent_type, setIntentType] = useState("");
  const [intent_type_other, setIntentTypeOther] = useState("");
  const [title, setTitle] = useState("");
  const [risk_level, setRiskLevel] = useState<"low" | "med" | "high">("low");
  const [source_ref, setSourceRef] = useState("");
  const [brand_profile_id, setBrandProfileId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const it = searchParams.get("intent_type");
    const brand = searchParams.get("brand_profile_id");
    if (it) setIntentType(it);
    if (brand) setBrandProfileId(brand);
  }, [searchParams]);

  const resolvedIntent = intent_type === "other" ? intent_type_other.trim() : intent_type;
  const createMutation = useCreateInitiative();
  const { data: brandsData } = useBrandProfiles({ limit: 200 });
  const brands = brandsData?.items ?? [];

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
        brand_profile_id: brand_profile_id.trim() || null,
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
              <label className="mb-1 block text-body-small font-medium text-text-primary">Brand (optional)</label>
              <Select
                value={brand_profile_id}
                onChange={(e) => setBrandProfileId(e.target.value)}
                className="w-full"
              >
                <option value="">No brand</option>
                {brands.map((b: { id: string; name: string }) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
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

export default function AdminInitiativesNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-muted">Loading…</div>}>
      <NewInitiativeForm />
    </Suspense>
  );
}
