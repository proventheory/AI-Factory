"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, Button } from "@/components/ui";

export default function EmailMarketingCampaignEditPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Edit campaign"
          description={`Edit email content for campaign ${id}. Load artifact and use email editor.`}
        />
        <p className="text-body-small text-fg-muted">Editor will load artifact via GET /v1/runs/:runId/artifacts or GET /v1/artifacts/:id. (Phase 5.)</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" asChild>
            <Link href="/email-marketing">Back to Email Marketing</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/initiatives/${id}`}>Open initiative</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
