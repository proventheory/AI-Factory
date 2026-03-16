"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection } from "@/components/ui";
import { TokenTreeView } from "@/components/TokenTreeView";
import { tokens } from "@/design-tokens/tokens";

export default function SpacingPage() {
  const spacingTokens = (tokens as Record<string, unknown>).spacing as Record<string, unknown>;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Spacing"
          description="4px grid spacing scale. Used for layout, padding, and margins in Console and documents. Single source in design-tokens/tokens.ts."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/studio/foundation" className="text-brand-600 hover:underline">Foundation</Link>
          {" · "}
          <Link href="/tokens" className="text-brand-600 hover:underline">Token Registry</Link>
          {" · "}
          <Link href="/components" className="text-brand-600 hover:underline">Components</Link>
        </p>
        <CardSection>
          <TokenTreeView tokens={spacingTokens} className="mt-2" />
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
