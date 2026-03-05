"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, EmptyState, Button } from "@/components/ui";

export default function EmailMarketingPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Email Marketing"
          description="Campaigns and templates managed in-platform."
        />
        <CardSection>
          <EmptyState
            title="Email campaigns"
            description="Create and manage email campaigns, lists, and templates from here. This section is part of the platform and will show your campaigns once the email marketing backend is connected."
            action={
              <Button variant="primary" disabled>
                New campaign (coming soon)
              </Button>
            }
          />
          <p className="mt-4 text-body-small text-text-secondary">
            <Link href="/dashboard" className="text-brand-600 hover:underline">
              ← Back to Overview
            </Link>
          </p>
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
