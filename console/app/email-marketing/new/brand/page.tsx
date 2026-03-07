"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, Button, LoadingSkeleton } from "@/components/ui";
import { useBrandProfiles } from "@/hooks/use-api";

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

export default function EmailMarketingNewBrandPage() {
  const router = useRouter();
  const { data, isLoading } = useBrandProfiles({ limit: 100 });
  const brands = data?.items ?? [];
  const selected = getWizardState().brand_profile_id as string | undefined;

  const handleSelect = (brandId: string) => {
    setWizardState({ brand_profile_id: brandId });
    router.push("/email-marketing/new/template");
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Brand"
          description="Select a brand profile for this email campaign."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-48 rounded-lg" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {brands.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(b.id)}
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    selected === b.id ? "border-brand-500 bg-brand-50" : "border-border hover:bg-fg-muted/5"
                  }`}
                >
                  <span className="font-medium">{b.name ?? b.slug ?? b.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {brands.length === 0 && !isLoading && (
          <p className="text-body-small text-fg-muted">No brands yet. Create one under Brand & Design → Brands.</p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" asChild>
            <Link href="/email-marketing/new/template">Next: Template</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/email-marketing/new">Back</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
