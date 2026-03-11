"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function ImportGraphPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Import graph"
          description="Per-service module graph used for deploy repair (e.g. missing file → files to commit). Control Plane: GET /v1/import_graph?service_id=, POST /v1/import_graph."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/graph/deploys" className="text-brand-600 hover:underline">Deploy events</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
