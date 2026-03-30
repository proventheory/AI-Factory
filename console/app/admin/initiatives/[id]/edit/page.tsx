"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card, CardContent, Button, Input, Select } from "@/components/ui";
import { useInitiative, useUpdateInitiative } from "@/hooks/use-api";
import { getResource } from "@/lib/admin-registry";
import { INTENT_TYPES, isWpShopifyMigrationIntent } from "@/config/intent-types";

const resource = getResource("initiatives")!;

export default function AdminInitiativeEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading, error } = useInitiative(id);
  const updateMutation = useUpdateInitiative();
  const [intent_type, setIntentType] = useState("");
  const [intent_type_other, setIntentTypeOther] = useState("");
  const [title, setTitle] = useState("");
  const [risk_level, setRiskLevel] = useState<"low" | "med" | "high">("low");
  const [source_ref, setSourceRef] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [goal_metadata, setGoalMetadata] = useState<{ source_url?: string; target_url?: string; gsc_site_url?: string; ga4_property_id?: string }>({});

  const resolvedIntent = intent_type === "other" ? intent_type_other.trim() : intent_type;
  const isWpShopifyMigration = isWpShopifyMigrationIntent(resolvedIntent);

  useEffect(() => {
    if (data) {
      const it = data.intent_type ?? "";
      const known = INTENT_TYPES.some((t) => t.value === it);
      setIntentType(known ? it : "other");
      if (!known) setIntentTypeOther(it);
      setTitle((data as { title?: string | null }).title ?? "");
      setRiskLevel((data.risk_level as "low" | "med" | "high") || "low");
      setSourceRef((data as { source_ref?: string }).source_ref ?? "");
      const gm = (data as { goal_metadata?: Record<string, unknown> }).goal_metadata;
      if (gm && typeof gm === "object") {
        setGoalMetadata({
          source_url: typeof gm.source_url === "string" ? gm.source_url : "",
          target_url: typeof gm.target_url === "string" ? gm.target_url : "",
          gsc_site_url: typeof gm.gsc_site_url === "string" ? gm.gsc_site_url : "",
          ga4_property_id: typeof gm.ga4_property_id === "string" ? gm.ga4_property_id : "",
        });
      }
    }
  }, [data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    try {
      const body: Parameters<typeof updateMutation.mutateAsync>[0]["body"] = {
        intent_type: resolvedIntent,
        title: title || null,
        risk_level,
        source_ref: source_ref || undefined,
      };
      if (isWpShopifyMigration) {
        body.goal_metadata = {
          ...(goal_metadata.source_url && { source_url: goal_metadata.source_url }),
          ...(goal_metadata.target_url && { target_url: goal_metadata.target_url }),
          ...(goal_metadata.gsc_site_url && { gsc_site_url: goal_metadata.gsc_site_url }),
          ...(goal_metadata.ga4_property_id && { ga4_property_id: goal_metadata.ga4_property_id }),
        };
      }
      await updateMutation.mutateAsync({ id, body });
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
                  placeholder="Custom intent type"
                  className="mt-2 w-full"
                />
              )}
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
            {isWpShopifyMigration && (
              <>
                <div>
                  <label className="mb-1 block text-body-small font-medium text-text-primary">Source URL (SEO)</label>
                  <Input value={goal_metadata.source_url ?? ""} onChange={(e) => setGoalMetadata((m) => ({ ...m, source_url: e.target.value }))} placeholder="https://…" className="w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-body-small font-medium text-text-primary">Target URL (SEO)</label>
                  <Input value={goal_metadata.target_url ?? ""} onChange={(e) => setGoalMetadata((m) => ({ ...m, target_url: e.target.value }))} placeholder="https://…" className="w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-body-small font-medium text-text-primary">GSC site URL</label>
                  <Input value={goal_metadata.gsc_site_url ?? ""} onChange={(e) => setGoalMetadata((m) => ({ ...m, gsc_site_url: e.target.value }))} placeholder="sc-domain:example.com or https://example.com/" className="w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-body-small font-medium text-text-primary">GA4 property ID</label>
                  <Input value={goal_metadata.ga4_property_id ?? ""} onChange={(e) => setGoalMetadata((m) => ({ ...m, ga4_property_id: e.target.value }))} placeholder="123456789" className="w-full" />
                </div>
              </>
            )}
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
