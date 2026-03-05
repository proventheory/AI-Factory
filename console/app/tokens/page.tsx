"use client";

import { PageFrame, Stack, PageHeader } from "@/components/ui";
import { TokenTreeView } from "@/components/TokenTreeView";

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
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Token Registry"
          description="Platform-level design token definitions. Brand themes reference or override these. See docs/BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md for the full token system."
        />
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-body font-semibold text-slate-900">Platform defaults (read-only)</h2>
          <p className="mb-3 text-body-small text-text-muted">
            These tokens are used as the base for brand themes. Brands can override any path in their profile.
          </p>
          <TokenTreeView tokens={PLATFORM_TOKEN_DEFAULTS} className="mt-2" />
        </section>
      </Stack>
    </PageFrame>
  );
}
