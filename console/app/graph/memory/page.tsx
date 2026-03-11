"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function GraphMemoryPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Memory (incidents)"
          description="Incident resolutions used by the decision loop and repair planning. Control Plane: GET /v1/incident_memory, GET /v1/memory/lookup."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/incidents" className="text-brand-600 hover:underline">Incidents</Link> · <Link href="/graph/failure-clusters" className="text-brand-600 hover:underline">Failure clusters</Link> · <Link href="/graph/decision-loop" className="text-brand-600 hover:underline">Decision loop</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
