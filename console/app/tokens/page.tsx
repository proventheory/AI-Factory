"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";
import { TokenTreeView } from "@/components/TokenTreeView";
import { useBrandProfiles, useBrandProfile, useDocumentTemplates, useEmailTemplates } from "@/hooks/use-api";

// Platform-level defaults (aligned with packages/tokens defaults.json and BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md)
const PLATFORM_TOKEN_DEFAULTS: Record<string, unknown> = {
  identity: {},
  voice: { reading_level: "grade_9", formality: "neutral" },
  colors: {
    brand: { "500": "#3b82f6", "600": "#2563eb" },
    text: { primary: "#0f172a", secondary: "#334155", muted: "#64748b", inverse: "#ffffff" },
    surface: { base: "#ffffff", raised: "#f8fafc", sunken: "#f1f5f9" },
    state: { success: "#059669", warning: "#d97706", danger: "#dc2626", info: "#2563eb" },
    border: { subtle: "#e2e8f0", default: "#cbd5e1", strong: "#94a3b8" },
  },
  typography: {
    fonts: { heading: "Inter", body: "Inter", mono: "ui-monospace, monospace" },
    scale: { xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem", xl: "1.25rem", "2xl": "1.5rem" },
    weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  },
  spacing: { "0": "0", "1": "0.25rem", "2": "0.5rem", "3": "0.75rem", "4": "1rem", "6": "1.5rem", "8": "2rem" },
  layout: { containerMax: "1280px", sectionGap: "2rem" },
  components: {},
  email: { containerWidth: "600px", padding: "16px" },
  marketing: {},
  seo: { metaTitleMax: 60, metaDescMax: 160 },
  documents: {},
  image_generation: {},
  motion: { duration: "200ms", easing: "ease" },
};

export default function TokenRegistryPage() {
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const { data: brandsData } = useBrandProfiles({ status: "active", limit: 200 });
  const { data: selectedBrand } = useBrandProfile(selectedBrandId || null);
  const brands = brandsData?.items ?? [];
  const { data: docTemplatesData } = useDocumentTemplates(selectedBrandId ? { brand_profile_id: selectedBrandId } : undefined);
  const { data: emailTemplatesData } = useEmailTemplates({
    limit: 100,
    ...(selectedBrandId ? { brand_profile_id: selectedBrandId } : {}),
  });
  const docTemplates = docTemplatesData?.items ?? [];
  const emailTemplates = emailTemplatesData?.items ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Token Registry"
          description="Platform-level design token definitions and per-brand token sets. Brand themes reference or override platform defaults. See docs/BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md for the full token system."
        />

        {/* By brand first so you see one brand at a time; platform defaults are reference below. */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-body font-semibold text-slate-900">By brand</h2>
          <p className="mb-3 text-body-small text-text-muted">
            View one brand&apos;s tokens at a time. Select a brand to see only that brand&apos;s design tokens (overrides and extensions to platform defaults).
          </p>
          <div className="mb-3">
            <label htmlFor="token-registry-brand" className="mb-1 block text-body-small font-medium text-slate-700">
              Brand
            </label>
            <select
              id="token-registry-brand"
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="block w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-body-small text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">— Select a brand —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {brands.length === 0 && (
              <p className="mt-2 text-body-small text-text-muted">
                No brands yet. Create one in <Link href="/brands" className="text-brand-600 hover:underline">Studio → Brands</Link> to see brand-specific tokens here.
              </p>
            )}
          </div>
          {selectedBrandId && selectedBrand && (
            <div className="mt-3 space-y-4">
              <div>
                <p className="mb-2 text-body-small font-medium text-slate-700">
                  <Link href={`/brands/${selectedBrand.id}`} className="text-brand-600 hover:underline">{selectedBrand.name}</Link>
                  {" — design tokens"}
                </p>
                <TokenTreeView
                  tokens={(selectedBrand.design_tokens ?? {}) as Record<string, unknown>}
                  className="mt-2"
                />
              </div>
              <div>
                <p className="mb-2 text-body-small font-medium text-slate-700">Templates for this brand</p>
                <p className="mb-2 text-body-small text-text-muted">
                  Deck/report and email templates linked to this brand. <Link href="/document-templates" className="text-brand-600 hover:underline">View all templates</Link>.
                </p>
                {(docTemplates.length === 0 && emailTemplates.length === 0) ? (
                  <p className="text-body-small text-text-muted">No templates linked to this brand yet.</p>
                ) : (
                  <ul className="list-inside list-disc text-body-small">
                    {docTemplates.map((t) => (
                      <li key={t.id}>
                        <Link href={`/document-templates/${t.id}`} className="text-brand-600 hover:underline">{t.name}</Link>
                        <span className="text-text-muted"> ({t.template_type})</span>
                      </li>
                    ))}
                    {emailTemplates.map((t) => (
                      <li key={t.id}>
                        <Link href={`/document-templates/email/${t.id}`} className="text-brand-600 hover:underline">{t.name}</Link>
                        <span className="text-text-muted"> (email · {t.type})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-body font-semibold text-slate-900">Templates</h2>
          <p className="mb-3 text-body-small text-text-muted">
            All document and email templates appear in <Link href="/document-templates" className="text-brand-600 hover:underline">Document Templates</Link>. Select a brand above to see templates dedicated to that brand. Email templates from the email marketing wizard show there and can be linked to brands.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-body font-semibold text-slate-900">Platform defaults (read-only)</h2>
          <p className="mb-3 text-body-small text-text-muted">
            Base tokens used for brand themes. Brands override specific paths in their profile.
          </p>
          <TokenTreeView tokens={PLATFORM_TOKEN_DEFAULTS} className="mt-2" />
        </section>
      </Stack>
    </PageFrame>
  );
}
