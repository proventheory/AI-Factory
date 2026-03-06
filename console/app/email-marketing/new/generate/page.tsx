"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, Button } from "@/components/ui";
import { useCreateEmailCampaign } from "@/hooks/use-api";
import { getRunStatus, getRunArtifacts } from "@/lib/api";

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

function clearWizardState() {
  try {
    sessionStorage.removeItem(WIZARD_KEY);
  } catch (_e) {}
}

export default function EmailMarketingNewGeneratePage() {
  const router = useRouter();
  const [campaignPrompt, setCampaignPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");

  const createCampaign = useCreateEmailCampaign();

  const handleGenerate = async () => {
    const state = getWizardState();
    const brandProfileId = state.brand_profile_id as string | undefined;
    const templateId = state.template_id as string | undefined;
    const products = (state.products as Array<{ src?: string; title?: string; product_url?: string }>) ?? [];

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
          const { items } = await getRunArtifacts(runId);
          const emailArtifact = items?.find(
            (a) => a.artifact_type === "email_template" || a.artifact_class === "email_template"
          );
          clearWizardState();
          if (emailArtifact?.id) {
            router.push(`/email-marketing/runs/${runId}/artifacts/${emailArtifact.id}/edit`);
            return;
          }
          router.push(`/runs/${runId}`);
          return;
        }
        if (status.status === "failed") {
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
        {!getWizardState().template_id && (
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
        </div>
        {error && <p className="text-state-danger text-body-small">{error}</p>}
        {step && <p className="text-body-small text-fg-muted">{step}</p>}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={busy || createCampaign.isPending || !getWizardState().template_id}
          >
            {busy || createCampaign.isPending ? "Generating…" : "Create campaign and generate"}
          </Button>
          <Button variant="secondary" asChild disabled={busy}>
            <Link href="/email-marketing/new/template">Back</Link>
          </Button>
          <Button variant="secondary" asChild disabled={busy}>
            <Link href="/email-marketing">Cancel</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
