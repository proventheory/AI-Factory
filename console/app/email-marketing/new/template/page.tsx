"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, Button, LoadingSkeleton } from "@/components/ui";
import { useEmailTemplates } from "@/hooks/use-api";
import { getEmailTemplatePreviewUrl } from "@/lib/api";

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

type TemplateRow = { id: string; name: string; type: string; image_url: string | null };

export default function EmailMarketingNewTemplatePage() {
  const router = useRouter();
  const { data, isLoading } = useEmailTemplates({ limit: 50 });
  const templates = (data?.items ?? []) as TemplateRow[];
  const selected = getWizardState().template_id as string | undefined;
  const [previewId, setPreviewId] = useState<string | null>(null);

  const handleUse = (templateId: string) => {
    setWizardState({ template_id: templateId });
    router.push("/email-marketing/new/generate");
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Template"
          description="Choose an email template for this campaign (optional). Preview to see desktop and mobile."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {templates.map((t) => (
              <li key={t.id}>
                <div
                  className={`flex min-h-[320px] flex-col rounded-lg border transition ${
                    selected === t.id ? "border-brand-500 bg-brand-50" : "border-border bg-card"
                  }`}
                >
                  <div className="min-h-[220px] flex-1 overflow-hidden rounded-t-lg bg-fg-muted/10">
                    {t.image_url ? (
                      <img
                        src={t.image_url}
                        alt=""
                        className="h-full min-h-[220px] w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex h-full min-h-[220px] items-center justify-center text-fg-muted text-sm">
                        No preview image
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    <div className="font-medium leading-tight">
                      {t.name}
                      <span className="text-body-small text-fg-muted ml-1">({t.type})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPreviewId(t.id)}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleUse(t.id)}
                      >
                        Use this template
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {templates.length === 0 && !isLoading && (
          <p className="text-body-small text-fg-muted">No email templates yet. You can still continue; the runner will generate a simple email.</p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => router.push("/email-marketing/new/generate")}>
            Next: Generate
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/email-marketing/new/products">Back</Link>
          </Button>
        </div>
      </Stack>

      {previewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setPreviewId(null)}
            aria-hidden
          />
          <div
            className="relative z-10 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 id="preview-title" className="text-lg font-semibold">
                Template preview — Desktop &amp; mobile
              </h2>
              <Button variant="secondary" size="sm" onClick={() => setPreviewId(null)}>
                Close
              </Button>
            </div>
            <div className="flex flex-1 gap-4 overflow-auto p-4">
              <div className="flex flex-col gap-2">
                <span className="text-body-small font-medium text-fg-muted">Desktop (600px)</span>
                <div className="border bg-fg-muted/5 rounded overflow-hidden" style={{ width: 600 }}>
                  <iframe
                    title="Desktop preview"
                    src={getEmailTemplatePreviewUrl(previewId)}
                    className="h-[600px] w-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-body-small font-medium text-fg-muted">Mobile (375px)</span>
                <div className="border bg-fg-muted/5 rounded overflow-hidden" style={{ width: 375 }}>
                  <iframe
                    title="Mobile preview"
                    src={getEmailTemplatePreviewUrl(previewId)}
                    className="h-[600px] w-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
