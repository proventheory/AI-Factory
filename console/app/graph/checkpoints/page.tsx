"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function GraphCheckpointsPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Checkpoints"
          description="Graph checkpoints for scope. Control Plane: GET /v1/checkpoints, POST /v1/checkpoints, GET /v1/checkpoints/:id/diff."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/graph/checkpoint-diff" className="text-brand-600 hover:underline">Checkpoint diff</Link> · <Link href="/graph/change-impact" className="text-brand-600 hover:underline">Change Impact</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
