"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function DecisionLoopPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Decision loop"
          description="Run a tick, compute baselines, view anomalies; optional auto-act (e.g. open_incident). Control Plane: GET /v1/decision_loop/observe, POST /v1/decision_loop/tick."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/policies" className="text-brand-600 hover:underline">Policies</Link> · <Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
