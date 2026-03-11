"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function RepairPreviewPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Repair Preview"
          description="Repair plan and replay scope for a failed node. Control Plane: GET /v1/graph/repair_plan/:runId/:nodeId, POST /v1/graph/subgraph_replay."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link> · <Link href="/graph/deploys" className="text-brand-600 hover:underline">Deploy events</Link> · <Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
