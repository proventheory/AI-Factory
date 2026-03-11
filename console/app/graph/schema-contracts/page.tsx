"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function SchemaContractsPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Schema & contracts"
          description="Plan nodes with input/output_schema_ref and contract breakage scan. Control Plane: GET /v1/contract_breakage_scan."
        />
        <p className="text-body-small text-text-muted">
          <Link href="/plans" className="text-brand-600 hover:underline">Plans</Link> · <Link href="/graph/explorer" className="text-brand-600 hover:underline">Graph Explorer</Link>
        </p>
      </Stack>
    </PageFrame>
  );
}
