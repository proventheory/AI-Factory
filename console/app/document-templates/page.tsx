"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
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
import { useDocumentTemplates, useEmailTemplates, useBrandProfiles } from "@/hooks/use-api";
import type { DocumentTemplateRow, EmailTemplateRow } from "@/lib/api";

/** Unified row for document + email templates so both render in one table. */
type TemplateListRow = {
  id: string;
  name: string;
  template_type: string;
  brand_profile_id?: string | null;
  status: string;
  created_at: string;
  source: "document" | "email";
  /** Email only: from contract or MJML */
  image_slots?: number;
  product_slots?: number;
  layout_style?: string;
  image_url?: string | null;
};

function statusVariant(status: string): "success" | "warning" | "neutral" {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

function typeVariant(t: string): "info" | "success" | "warning" | "neutral" {
  if (t === "deck" || t?.includes("deck")) return "info";
  if (t === "report" || t?.includes("report")) return "success";
  if (t === "email" || t === "newsletter" || t === "promo") return "warning";
  return "neutral";
}

export default function DocumentTemplatesPage() {
  const router = useRouter();
  const { data: docData, isLoading: docLoading, error } = useDocumentTemplates();
  const { data: emailData, isLoading: emailLoading } = useEmailTemplates({ limit: 500 });
  const { data: brandsData } = useBrandProfiles();

  const brandsMap = useMemo(
    () => new Map((brandsData?.items ?? []).map((b) => [b.id, b.name])),
    [brandsData?.items],
  );

  const items: TemplateListRow[] = useMemo(() => {
    const docs: TemplateListRow[] = (docData?.items ?? []).map((row: DocumentTemplateRow) => ({
      id: row.id,
      name: row.name,
      template_type: row.template_type,
      brand_profile_id: row.brand_profile_id ?? null,
      status: row.status,
      created_at: row.created_at,
      source: "document" as const,
    }));
    const emails: TemplateListRow[] = (emailData?.items ?? []).map((row: EmailTemplateRow) => ({
      id: row.id,
      name: row.name,
      template_type: row.type ?? "email",
      brand_profile_id: row.brand_profile_id ?? null,
      status: "active",
      created_at: row.created_at,
      source: "email" as const,
      image_slots: row.image_slots,
      product_slots: row.product_slots,
      layout_style: row.layout_style,
      image_url: row.image_url ?? null,
    }));
    return [...docs, ...emails].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [docData?.items, emailData?.items]);

  const columns: Column<TemplateListRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.source === "email" && row.image_url && (
            <img
              src={row.image_url}
              alt=""
              className="h-9 w-14 shrink-0 rounded border border-border object-cover"
            />
          )}
          <span className="font-medium text-fg">{row.name}</span>
        </div>
      ),
    },
    {
      key: "template_type",
      header: "Kind",
      render: (row) =>
        row.source === "email" ? (
          <span className="text-body-small break-words">
            {row.layout_style ?? `(${row.template_type})`}
            {(row.image_slots != null || row.product_slots != null) && (
              <> · {row.image_slots ?? 0} img, {row.product_slots ?? 0} prod</>
            )}
          </span>
        ) : (
          <Badge variant={typeVariant(row.template_type)}>{row.template_type}</Badge>
        ),
    },
    {
      key: "slots",
      header: "Slots",
      render: (row) =>
        row.source === "email" ? (
          "—"
        ) : (
          "—"
        ),
    },
    {
      key: "brand",
      header: "Brand",
      render: (row) =>
        row.brand_profile_id
          ? brandsMap.get(row.brand_profile_id) ?? row.brand_profile_id.slice(0, 8)
          : "—",
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

  const isLoading = docLoading || emailLoading;

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
          description="Deck, report, and email templates. Email templates show image and product slot capacity; use them in the email wizard to build campaigns. Brand embeddings are managed per brand: open a brand → Brand Embeddings → Manage."
        />
        <CardSection className="overflow-hidden rounded-lg border border-border shadow-sm">
          {isLoading ? (
            <div className="space-y-3">
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-4/5" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No templates"
              description="Create email templates via the email marketing wizard (seed script or API), or create deck/report templates via the API. They will appear here."
            />
          ) : (
            <TableFrame>
              <DataTable
                columns={columns}
                data={items}
                keyExtractor={(row) => `${row.source}-${row.id}`}
                onRowClick={(row) =>
                  row.source === "email"
                    ? router.push(`/document-templates/email/${row.id}`)
                    : router.push(`/document-templates/${row.id}`)
                }
              />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
