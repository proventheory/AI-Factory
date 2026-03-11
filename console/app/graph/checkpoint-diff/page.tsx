"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function CheckpointDiffPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Checkpoint diff"
          description="Diff between checkpoints. Control Plane: GET /v1/checkpoints/:id/diff."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/graph/checkpoints" className="text-brand-600 hover:underline">Checkpoints</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
