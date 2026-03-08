"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { PageFrame, Stack, PageHeader, Button } from "@/components/ui";
import { useEmailCampaign } from "@/hooks/use-api";

export default function EmailMarketingCampaignEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) ?? "";
  const { data: campaign, isLoading, error } = useEmailCampaign(id || null);
  const templateArtifactId = campaign?.template_artifact_id;

  useEffect(() => {
    if (templateArtifactId && !isLoading) {
      router.replace(`/email-marketing/artifacts/${templateArtifactId}/edit`);
    }
  }, [templateArtifactId, isLoading, router]);

  if (isLoading) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit campaign" description="Loading…" />
          <div className="h-32 animate-pulse rounded-md bg-fg-muted/10" />
        </Stack>
      </PageFrame>
    );
  }

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit campaign" description="Error loading campaign." />
          <p className="text-body-small text-fg-danger">{error instanceof Error ? error.message : "Campaign not found"}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild><Link href="/email-marketing">Back to Email Generator</Link></Button>
            <Button variant="secondary" asChild><Link href={`/initiatives/${id}`}>Open initiative</Link></Button>
          </div>
        </Stack>
      </PageFrame>
    );
  }

  if (!templateArtifactId) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit campaign" description={campaign?.title ? `Edit template for ${campaign.title}` : "Edit campaign"} />
          <p className="text-body-small text-fg-muted">This campaign has no template artifact linked. Add a template artifact to edit email content here.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild><Link href="/email-marketing">Back to Email Generator</Link></Button>
            <Button variant="secondary" asChild><Link href={`/initiatives/${id}`}>Open initiative</Link></Button>
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Edit campaign" description="Redirecting to template editor…" />
        <div className="h-32 animate-pulse rounded-md bg-fg-muted/10" />
      </Stack>
    </PageFrame>
  );
}
