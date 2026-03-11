"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function LineagePage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Lineage viewer"
          description="Producer and consumers for an artifact. Control Plane: GET /v1/graph/lineage/:artifactId."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/artifacts" className="text-brand-600 hover:underline">Artifacts</Link> · <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
