"use client";

import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function ComponentRegistryPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Component Registry"
          description="Platform-level UI components used to build artifacts and dashboards."
        />
        <p className="text-text-muted text-sm">Component registry UI coming soon.</p>
      </Stack>
    </PageFrame>
  );
}
