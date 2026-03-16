"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection } from "@/components/ui";
import { TokenTreeView } from "@/components/TokenTreeView";
import { tokens } from "@/design-tokens/tokens";

export default function ColorsPage() {
  const colorTokens = (tokens as Record<string, unknown>).color as Record<string, unknown>;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Colors"
          description="Brand, surface, text, state, border, and neutral palettes. Single source in design-tokens/tokens.ts; used by Console, emails, and documents."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/studio/foundation" className="text-brand-600 hover:underline">Foundation</Link>
          {" · "}
          <Link href="/tokens" className="text-brand-600 hover:underline">Token Registry</Link>
          {" · "}
          <Link href="/brands" className="text-brand-600 hover:underline">Brands</Link> (per-brand overrides)
        </p>
        <CardSection>
          <TokenTreeView tokens={colorTokens} className="mt-2" />
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
