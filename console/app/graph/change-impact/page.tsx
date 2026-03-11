"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function ChangeImpactPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Change Impact"
          description="Compute and view graph impacts for change events. Control Plane: GET /v1/change_events, POST /v1/change_events/:id/impact."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/graph/checkpoints" className="text-brand-600 hover:underline">Checkpoints</Link> · <Link href="/graph/repair-preview" className="text-brand-600 hover:underline">Repair Preview</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
