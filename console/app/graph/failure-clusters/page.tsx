"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function FailureClustersPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Failure clusters"
          description="Clusters by failure_class. Control Plane: GET /v1/failure_clusters."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/incidents" className="text-brand-600 hover:underline">Incidents</Link> · <Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
