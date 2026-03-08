"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function BrandThemesPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Brand Themes"
          description="Brand-specific theme instances. Themes reference Builder token registry or override values."
        />
        <p className="text-text-muted text-sm">
          Brand themes live in Studio; manage brands and their design tokens in{" "}
          <Link href="/brands" className="text-brand-600 hover:underline">Brands</Link>.
        </p>
      </Stack>
    </PageFrame>
  );
}
