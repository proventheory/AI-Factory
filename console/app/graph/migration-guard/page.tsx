"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function MigrationGuardPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Migration Guard"
          description="Analyze migration SQL before applying: tables touched, columns, risks, checkpoint suggestion. Control Plane: POST /v1/migration_guard."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/graph/checkpoints" className="text-brand-600 hover:underline">Checkpoints</Link> · <Link href="/releases" className="text-brand-600 hover:underline">Releases</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
