"use client";

import Link from "next/link";
import { useState } from "react";
import {
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
  Button,
  Input,
  Select,
  LoadingSkeleton,
  DataTable,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import {
  useKlaviyoTemplates,
  useKlaviyoCampaigns,
  useKlaviyoFlows,
  useKlaviyoCampaignsPush,
  useKlaviyoFlowsCreate,
  useKlaviyoFlowSetStatus,
  useBrandProfiles,
} from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function KlaviyoPage() {
  const [brandFilter, setBrandFilter] = useState("");
  const [pushInitiativeId, setPushInitiativeId] = useState("");
  const [pushRunId, setPushRunId] = useState("");
  const [pushArtifactId, setPushArtifactId] = useState("");
  const [pushScheduleAt, setPushScheduleAt] = useState("");
  const [pushListIds, setPushListIds] = useState("");
  const [flowBrandId, setFlowBrandId] = useState("");
  const [flowType, setFlowType] = useState("welcome");
  const [flowName, setFlowName] = useState("");
  const [pushError, setPushError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);

  const { data: brandsData } = useBrandProfiles({ limit: 100 });
  const brands = brandsData?.items ?? [];
  const { data: templatesData, isLoading: templatesLoading } = useKlaviyoTemplates(brandFilter || undefined);
  const { data: campaignsData, isLoading: campaignsLoading } = useKlaviyoCampaigns(brandFilter || undefined);
  const { data: flowsData, isLoading: flowsLoading } = useKlaviyoFlows(brandFilter || undefined);
  const pushMutation = useKlaviyoCampaignsPush();
  const createFlowMutation = useKlaviyoFlowsCreate();
  const setStatusMutation = useKlaviyoFlowSetStatus();

  const templates = templatesData?.items ?? [];
  const campaigns = campaignsData?.items ?? [];
  const flows = flowsData?.items ?? [];

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    setPushError(null);
    if (!pushArtifactId.trim()) {
      setPushError("Artifact ID is required");
      return;
    }
    try {
      await pushMutation.mutateAsync({
        initiative_id: pushInitiativeId.trim() || undefined,
        run_id: pushRunId.trim() || undefined,
        artifact_id: pushArtifactId.trim(),
        schedule_at: pushScheduleAt.trim() || undefined,
        audience_list_ids: pushListIds.trim() ? pushListIds.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      });
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Push failed");
    }
  };

  const handleCreateFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlowError(null);
    if (!flowBrandId) {
      setFlowError("Brand is required");
      return;
    }
    try {
      await createFlowMutation.mutateAsync({
        brand_profile_id: flowBrandId,
        flow_type: flowType,
        flow_name: flowName.trim() || undefined,
      });
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : "Create flow failed");
    }
  };

  const handleSetFlowStatus = (flowId: string, status: "draft" | "manual" | "live") => {
    setStatusMutation.mutate({ flowId, body: { status } });
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Klaviyo"
          description="Push email templates and campaigns from the Email Design Generator, create flow drafts, and set flow status (draft / manual / live). Connect Klaviyo per brand in Brands → select a brand → Edit → Klaviyo."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/brands" className="text-brand-600 hover:underline">Brands</Link> · <Link href="/email-marketing" className="text-brand-600 hover:underline">Email Design Generator</Link> · <Link href="/initiatives" className="text-brand-600 hover:underline">Initiatives</Link>
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-body-small text-text-muted">Filter by brand</label>
          <Select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="w-64"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name ?? b.id.slice(0, 8)}</option>
            ))}
          </Select>
        </div>

        <CardSection title="Push to Klaviyo">
          <p className="text-body-small text-text-muted mb-3">
            Run the campaign pipeline: artifact → template → campaign in Klaviyo. Requires initiative or run + artifact from an email design. Brand must have Klaviyo connected.
          </p>
          {pushError && (
            <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-sm text-state-danger mb-3">{pushError}</div>
          )}
          <form onSubmit={handlePush} className="space-y-2 max-w-xl">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="UUID of email_design_generator initiative" value={pushInitiativeId} onChange={(e) => setPushInitiativeId(e.target.value)} className="font-mono text-sm" />
              <Input placeholder="Or pipeline run UUID" value={pushRunId} onChange={(e) => setPushRunId(e.target.value)} className="font-mono text-sm" />
            </div>
            <Input placeholder="Email template artifact UUID *" value={pushArtifactId} onChange={(e) => setPushArtifactId(e.target.value)} className="font-mono text-sm" required />
            <Input placeholder="e.g. 2025-04-01T14:00:00Z" value={pushScheduleAt} onChange={(e) => setPushScheduleAt(e.target.value)} className="text-sm" />
            <Input placeholder="Klaviyo list IDs, or leave blank to use brand default" value={pushListIds} onChange={(e) => setPushListIds(e.target.value)} className="text-sm" />
            <Button type="submit" variant="primary" disabled={pushMutation.isPending}>{pushMutation.isPending ? "Pushing…" : "Push to Klaviyo"}</Button>
          </form>
        </CardSection>

        <CardSection title="Create flow">
          <p className="text-body-small text-text-muted mb-3">Create a flow draft in Klaviyo from a predefined flow type. The brand must have Klaviyo connected.</p>
          {flowError && (
            <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-sm text-state-danger mb-3">{flowError}</div>
          )}
          <form onSubmit={handleCreateFlow} className="space-y-2 max-w-xl">
            <Select value={flowBrandId} onChange={(e) => setFlowBrandId(e.target.value)} className="w-full" required>
              <option value="">Select brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name ?? b.id.slice(0, 8)}</option>
              ))}
            </Select>
            <Select value={flowType} onChange={(e) => setFlowType(e.target.value)} className="w-full">
              <option value="welcome">Welcome</option>
              <option value="abandoned_cart">Abandoned cart</option>
              <option value="browse_abandonment">Browse abandonment</option>
              <option value="winback">Winback</option>
              <option value="post_purchase">Post purchase</option>
            </Select>
            <Input placeholder="e.g. Welcome series" value={flowName} onChange={(e) => setFlowName(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={createFlowMutation.isPending}>{createFlowMutation.isPending ? "Creating…" : "Create flow draft"}</Button>
          </form>
        </CardSection>

        <CardSection title="Templates synced">
          <p className="text-body-small text-text-muted mb-2">Templates pushed to Klaviyo from artifacts (one row per brand + artifact).</p>
          {templatesLoading ? <LoadingSkeleton className="h-32 rounded-lg" /> : (
            <DataTable
              columns={[
                { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
                { key: "sync_state", header: "State", render: (r) => r.sync_state },
                { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
              ]}
              data={templates}
              keyExtractor={(r) => r.id}
            />
          )}
        </CardSection>

        <CardSection title="Campaigns">
          <p className="text-body-small text-text-muted mb-2">Campaigns created via Push to Klaviyo (draft, scheduled, or sent).</p>
          {campaignsLoading ? <LoadingSkeleton className="h-32 rounded-lg" /> : (
            <DataTable
              columns={[
                { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
                { key: "sync_state", header: "State", render: (r) => r.sync_state },
                { key: "scheduled_at", header: "Scheduled", render: (r) => r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—" },
                { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
              ]}
              data={campaigns}
              keyExtractor={(r) => r.id}
            />
          )}
        </CardSection>

        <CardSection title="Flow status">
          <p className="text-body-small text-text-muted mb-2">Flows created here or via API. Set status to draft, manual, or live.</p>
          {flowsLoading ? <LoadingSkeleton className="h-32 rounded-lg" /> : (
            <DataTable
              columns={[
                { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
                { key: "flow_type", header: "Type", render: (r) => r.flow_type },
                { key: "sync_state", header: "Sync", render: (r) => r.sync_state },
                { key: "last_remote_status", header: "Remote", render: (r) => r.last_remote_status ?? "—" },
                {
                  key: "actions",
                  header: "Set status",
                  render: (r) => (
                    <span className="flex gap-1">
                      <Button variant="secondary" size="sm" onClick={() => handleSetFlowStatus(r.id, "draft")} disabled={setStatusMutation.isPending}>Draft</Button>
                      <Button variant="secondary" size="sm" onClick={() => handleSetFlowStatus(r.id, "manual")} disabled={setStatusMutation.isPending}>Manual</Button>
                      <Button variant="secondary" size="sm" onClick={() => handleSetFlowStatus(r.id, "live")} disabled={setStatusMutation.isPending}>Live</Button>
                    </span>
                  ),
                },
              ]}
              data={flows}
              keyExtractor={(r) => r.id}
            />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
