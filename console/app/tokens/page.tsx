"use client";

import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function TokenRegistryPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Token Registry"
          description="Platform-level design token definitions. Brand themes reference or override these. Full token system in progress (see docs/BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md)."
        />
        <p className="text-text-muted text-sm">Token registry UI coming soon.</p>
      </Stack>
    </PageFrame>
  );
}
