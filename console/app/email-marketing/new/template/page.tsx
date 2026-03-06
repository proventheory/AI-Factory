"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, Button, LoadingSkeleton } from "@/components/ui";
import { useEmailTemplates } from "@/hooks/use-api";

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

export default function EmailMarketingNewTemplatePage() {
  const router = useRouter();
  const { data, isLoading } = useEmailTemplates({ limit: 50 });
  const templates = data?.items ?? [];
  const selected = getWizardState().template_id as string | undefined;

  const handleUse = (templateId: string) => {
    setWizardState({ template_id: templateId });
    router.push("/email-marketing/new/generate");
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Template"
          description="Choose an email template for this campaign (optional)."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-48 rounded-lg" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => handleUse(t.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selected === t.id ? "border-brand-500 bg-brand-50" : "border-border hover:bg-fg-muted/5"
                  }`}
                >
                  {t.image_url && <img src={t.image_url} alt="" className="mb-2 h-24 w-full rounded object-cover" />}
                  <span className="font-medium">{t.name}</span>
                  <span className="text-body-small text-fg-muted ml-1">({t.type})</span>
                </button>
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
    </PageFrame>
  );
}
