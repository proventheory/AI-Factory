"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection } from "@/components/ui";

export default function BlocksPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Blocks"
          description="Reusable blocks for email, decks, and reports. Built from the Component Registry and design tokens."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/studio/foundation" className="text-brand-600 hover:underline">Foundation</Link>
          {" · "}
          <Link href="/components" className="text-brand-600 hover:underline">Component Registry</Link>
          {" · "}
          <Link href="/document-templates" className="text-brand-600 hover:underline">Pages (templates)</Link>
        </p>
        <CardSection>
          <p className="text-body text-text-secondary mb-4">
            Blocks are email and document components (MJML/HTML fragments) managed in the <strong>Component Registry</strong>.
            They use the same typography, colors, and spacing tokens and are composed into document templates and email campaigns.
          </p>
          <Link
            href="/components"
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-body-small font-medium text-white hover:bg-brand-700"
          >
            Open Component Registry →
          </Link>
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
