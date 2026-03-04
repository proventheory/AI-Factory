"use client";

import { useRouter } from "next/navigation";
import {
  Button,
  Badge,
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
  TableFrame,
  DataTable,
  LoadingSkeleton,
  EmptyState,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useDocumentTemplates, useBrandProfiles } from "@/hooks/use-api";
import type { DocumentTemplateRow } from "@/lib/api";

function statusVariant(status: string): "success" | "warning" | "neutral" {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

function typeVariant(t: string): "info" | "success" | "warning" | "neutral" {
  if (t === "deck") return "info";
  if (t === "report") return "success";
  if (t === "email") return "warning";
  return "neutral";
}

export default function DocumentTemplatesPage() {
  const router = useRouter();
  const { data, isLoading, error } = useDocumentTemplates();
  const { data: brandsData } = useBrandProfiles();

  const items = data?.items ?? [];
  const brandsMap = new Map(
    (brandsData?.items ?? []).map((b) => [b.id, b.name]),
  );

  const columns: Column<DocumentTemplateRow>[] = [
    { key: "name", header: "Name" },
    {
      key: "template_type",
      header: "Type",
      render: (row) => (
        <Badge variant={typeVariant(row.template_type)}>{row.template_type}</Badge>
      ),
    },
    {
      key: "brand",
      header: "Brand",
      render: (row) =>
        row.brand_profile_id ? brandsMap.get(row.brand_profile_id) ?? row.brand_profile_id.slice(0, 8) : "—",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    },
    {
      key: "created_at",
      header: "Created",
      render: (row) => new Date(row.created_at).toLocaleDateString(),
    },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Document Templates" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {(error as Error).message}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Document Templates"
          description="Manage deck, report, and email templates linked to brand profiles."
        />
        <CardSection>
          {isLoading ? (
            <div className="space-y-3">
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-4/5" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No document templates"
              description="Templates will appear here once created via the API."
            />
          ) : (
            <TableFrame>
              <DataTable
                columns={columns}
                data={items}
                keyExtractor={(row) => row.id}
                onRowClick={(row) => router.push(`/document-templates/${row.id}`)}
              />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
