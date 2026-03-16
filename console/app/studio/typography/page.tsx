"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection } from "@/components/ui";
import { TokenTreeView } from "@/components/TokenTreeView";
import { tokens } from "@/design-tokens/tokens";

export default function TypographyPage() {
  const typographyTokens = (tokens as Record<string, unknown>).typography as Record<string, unknown>;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Typography"
          description="Font families, sizes, weights, headings, body, and caption. Single source in design-tokens/tokens.ts; used by Console, emails, and documents."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/studio/foundation" className="text-brand-600 hover:underline">Foundation</Link>
          {" · "}
          <Link href="/tokens" className="text-brand-600 hover:underline">Token Registry</Link>
          {" · "}
          <Link href="/components" className="text-brand-600 hover:underline">Components</Link>
        </p>
        <CardSection>
          <TokenTreeView tokens={typographyTokens} className="mt-2" />
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
