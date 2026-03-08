"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, Button } from "@/components/ui";

export default function LandingPageGeneratorNewPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="New landing page"
          description="Create a new landing page: choose brand, select template, then pick products and images and generate. We will switch to pre-built landing page templates next."
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" asChild>
            <Link href="/landing-page-generator/new/brand">Start: Brand</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/landing-page-generator">Back to Landing Page Generator</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
