"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function GraphDiagnosticsPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Graph health"
          description="Graph audit and missing capabilities. Control Plane: GET /v1/graph/audit/:runId, GET /v1/graph/missing_capabilities/:planId."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/jobs" className="text-brand-600 hover:underline">Jobs</Link> · <Link href="/graph/explorer" className="text-brand-600 hover:underline">Graph Explorer</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
