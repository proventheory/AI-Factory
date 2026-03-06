"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, Button } from "@/components/ui";

export default function EmailMarketingArtifactEditPage() {
  const params = useParams();
  const runId = params.runId as string;
  const artifactId = params.artifactId as string;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Edit email artifact"
          description={`Edit artifact ${artifactId} from run ${runId}.`}
        />
        <p className="text-body-small text-fg-muted">Load artifact via GET /v1/artifacts/:id or GET /v1/runs/:runId/artifacts; easy-email-pro editor. (Phase 5.)</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" asChild>
            <Link href="/email-marketing">Back to Email Marketing</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/runs/${runId}`}>View run</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
