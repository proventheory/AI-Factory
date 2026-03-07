"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, Button } from "@/components/ui";

export default function EmailMarketingNewPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="New email campaign"
          description="Create a new email campaign: choose brand, select template, then pick products and images in one step and render preview."
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" asChild>
            <Link href="/email-marketing/new/brand">Start: Brand</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/email-marketing">Back to Email Marketing</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
