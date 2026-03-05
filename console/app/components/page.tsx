"use client";

import { PageFrame, Stack, PageHeader, TableFrame, DataTable } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

// Platform-level document/artifact components (aligned with document_components.component_type and packages/doc-kit registry)
const PLATFORM_COMPONENTS: { id: string; type: string; description: string; usedIn: string }[] = [
  { id: "kpi_card", type: "kpi_card", description: "KPI metric card with value and label", usedIn: "Decks, dashboards" },
  { id: "table_block", type: "table_block", description: "Data table with configurable columns", usedIn: "Reports, decks" },
  { id: "chart_block", type: "chart_block", description: "Chart (bar, line, pie) from data", usedIn: "Reports, decks" },
  { id: "callout", type: "callout", description: "Highlighted callout or quote block", usedIn: "Decks, reports" },
  { id: "timeline", type: "timeline", description: "Timeline or milestone list", usedIn: "Decks, reports" },
  { id: "pricing_table", type: "pricing_table", description: "Pricing plans comparison", usedIn: "Decks, marketing" },
  { id: "cover_slide", type: "cover_slide", description: "Title or cover slide", usedIn: "Decks" },
  { id: "divider", type: "divider", description: "Visual divider / separator", usedIn: "Decks, reports" },
  { id: "text_block", type: "text_block", description: "Rich text block", usedIn: "Decks, reports, emails" },
  { id: "image_block", type: "image_block", description: "Image with optional caption", usedIn: "Decks, reports" },
  { id: "two_column", type: "two_column", description: "Two-column layout", usedIn: "Decks, reports" },
  { id: "header_block", type: "header_block", description: "Document header (e.g. logo, title)", usedIn: "Reports, decks" },
  { id: "footer_block", type: "footer_block", description: "Document footer", usedIn: "Reports, decks" },
];

export default function ComponentRegistryPage() {
  const columns: Column<typeof PLATFORM_COMPONENTS[0]>[] = [
    { key: "type", header: "Component type" },
    { key: "description", header: "Description" },
    { key: "usedIn", header: "Used in" },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Component Registry"
          description="Platform-level UI components used to build artifacts and dashboards. Document templates reference these by type."
        />
        <TableFrame>
          <DataTable
            columns={columns}
            data={PLATFORM_COMPONENTS}
            keyExtractor={(r) => r.id}
          />
        </TableFrame>
      </Stack>
    </PageFrame>
  );
}
