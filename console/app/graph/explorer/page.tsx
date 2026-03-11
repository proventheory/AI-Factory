"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function GraphExplorerPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Graph Explorer"
          description="Explore plan topology, node/edge graph, and run state. Control Plane: GET /v1/graph/topology/:planId, GET /v1/graph/frontier/:runId."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/plans" className="text-brand-600 hover:underline">Plans</Link> · <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
