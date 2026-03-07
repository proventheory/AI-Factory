"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageFrame, Stack, PageHeader, Button } from "@/components/ui";
import { useCreateEmailCampaign } from "@/hooks/use-api";
import { getRunStatus, getRunArtifacts, type ArtifactRow } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";
const WIZARD_KEY = "email_marketing_wizard";

function getWizardState(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const s = sessionStorage.getItem(WIZARD_KEY);
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function setWizardState(updates: Record<string, unknown>) {
  try {
    const next = { ...getWizardState(), ...updates };
    sessionStorage.setItem(WIZARD_KEY, JSON.stringify(next));
  } catch (_e) {}
}

function clearWizardState() {
  try {
    sessionStorage.removeItem(WIZARD_KEY);
  } catch (_e) {}
}

function GeneratePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [campaignPrompt, setCampaignPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");
  // Wizard state is in sessionStorage; sync after mount (and from URL fallback) so we don't show "Select a template" when user came from Content
  const [wizardTemplateId, setWizardTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const s = getWizardState();
    let tid = (s.template_id as string) ?? null;
    const urlTid = searchParams.get("template_id");
    const urlBid = searchParams.get("brand_profile_id");
    if (urlTid && !tid) {
      tid = urlTid;
      setWizardState({ template_id: urlTid });
    }
    if (urlBid && !(s.brand_profile_id as string)) setWizardState({ brand_profile_id: urlBid });
    setWizardTemplateId(tid);
  }, [searchParams]);

  const hasTemplate = Boolean(wizardTemplateId);

  const createCampaign = useCreateEmailCampaign();

  const handleGenerate = async () => {
    const state = getWizardState();
    const brandProfileId = state.brand_profile_id as string | undefined;
    const templateId = (wizardTemplateId ?? state.template_id) as string | undefined;
    const products = (state.products as Array<{ src?: string; title?: string; product_url?: string }>) ?? [];
    const selectedImages = (state.selected_images as string[]) ?? [];

    if (!templateId?.trim()) {
      setError("Please select a template first (go back to the Template step).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setStep("Creating campaign…");
      const campaign = await createCampaign.mutateAsync({
        title: "New email campaign",
        brand_profile_id: brandProfileId,
        template_id: templateId,
        metadata_json: {
          products,
          images: selectedImages,
          campaign_prompt: campaignPrompt || "newsletter",
          sitemap_url: state.sitemap_url,
          sitemap_type: state.sitemap_type,
        },
      });
      const initiativeId = campaign.id;

      setStep("Compiling plan…");
      const planRes = await fetch(`${API}/v1/initiatives/${initiativeId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const planJson = await planRes.json();
      if (!planRes.ok) throw new Error(planJson.error ?? "Compile plan failed");
      const planId = planJson.id as string;

      setStep("Starting run…");
      const startRes = await fetch(`${API}/v1/plans/${planId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: "sandbox", llm_source: "gateway" }),
      });
      const startJson = await startRes.json();
      if (!startRes.ok) throw new Error(startJson.error ?? "Start run failed");
      const runId = startJson.id as string;

      setStep("Waiting for run…");
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await getRunStatus(runId);
        if (status.status === "succeeded") {
          setStep("Loading email preview…");
          // Give runner time to commit; then poll artifacts (handles replication lag / eventual consistency)
          await new Promise((r) => setTimeout(r, 2500));
          for (let attempt = 0; attempt < 8; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
            const res = await getRunArtifacts(runId);
            const items = res.items ?? [];
            let emailArtifact = items.find(
              (a) => a.artifact_type === "email_template" || a.artifact_class === "email_template"
            );
            if (!emailArtifact?.id && items.length === 1) emailArtifact = items[0];
            if (emailArtifact?.id) {
              clearWizardState();
              router.push(`/email-marketing/runs/${runId}/artifacts/${emailArtifact.id}/edit`);
              return;
            }
          }
          clearWizardState();
          router.push(`/runs/${runId}?no_email_artifact=1`);
          return;
        }
        if (status.status === "failed") {
          clearWizardState();
          router.push(`/runs/${runId}`);
          return;
        }
      }
      throw new Error("Run timed out");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Generate"
          description="Create campaign and run the email generation pipeline."
        />
        {!hasTemplate && (
          <p className="text-state-warning text-body-small mb-2">Select a template in the Template step first, then return here.</p>
        )}
        <div>
          <label className="block text-body-small font-medium mb-1">Campaign prompt (optional)</label>
          <textarea
            value={campaignPrompt}
            onChange={(e) => setCampaignPrompt(e.target.value)}
            placeholder="e.g. Summer sale newsletter"
            className="w-full max-w-md rounded border border-border bg-bg px-3 py-2 text-body-small"
            rows={2}
          />
          <p className="text-body-small text-fg-muted mt-1">
            Add a theme (e.g. Summer sale) to guide the generated email copy. You can leave it blank to use a default.
          </p>
        </div>
        {error && <p className="text-state-danger text-body-small">{error}</p>}
        {step && <p className="text-body-small text-fg-muted">{step}</p>}
        <div className="flex flex-wrap gap-3">
          {(() => {
            const isDisabled = busy || createCampaign.isPending || !hasTemplate;
            return (
              <Button
                variant={hasTemplate ? "primary" : "secondary"}
                onClick={handleGenerate}
                disabled={isDisabled}
                aria-disabled={isDisabled}
                title={!hasTemplate ? "Select a template in the Template step first" : undefined}
              >
                {busy || createCampaign.isPending ? "Generating…" : "Create campaign and generate"}
              </Button>
            );
          })()}
          <Button variant="secondary" asChild disabled={busy}>
            <Link href="/email-marketing/new/content">Back</Link>
          </Button>
          <Button variant="secondary" asChild disabled={busy}>
            <Link href="/email-marketing">Cancel</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}

export default function EmailMarketingNewGeneratePage() {
  return (
    <Suspense
      fallback={
        <PageFrame>
          <Stack>
            <PageHeader title="Generate" description="Create campaign and run the email generation pipeline." />
            <p className="text-fg-muted text-body-small">Loading…</p>
          </Stack>
        </PageFrame>
      }
    >
      <GeneratePageContent />
    </Suspense>
  );
}
