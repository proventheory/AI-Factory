"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
  Button,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useDocumentTemplates, useEmailTemplates, useBrandProfiles, useDeleteEmailTemplate } from "@/hooks/use-api";
import { fetchEmailTemplatePreviewHtml, type DocumentTemplateRow, type EmailTemplateRow } from "@/lib/api";

/** Live preview thumbnail for email templates that have no stored image_url (e.g. composed templates). */
function EmailTemplatePreviewThumb({ templateId }: { templateId: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetchEmailTemplatePreviewHtml(templateId)
      .then(setHtml)
      .catch(() => setHtml(null))
      .finally(() => setLoading(false));
  }, [templateId]);
  if (loading) {
    return (
      <div className="h-9 w-14 shrink-0 rounded border border-border bg-bg-muted flex items-center justify-center text-[10px] text-fg-muted">
        …
      </div>
    );
  }
  if (!html) {
    return (
      <div className="h-9 w-14 shrink-0 rounded border border-border bg-bg-muted flex items-center justify-center text-[10px] text-fg-muted">
        Preview
      </div>
    );
  }
  return (
    <iframe
      title="Preview"
      srcDoc={html}
      className="h-9 w-14 shrink-0 rounded border border-border object-cover overflow-hidden min-w-[3.5rem]"
      sandbox="allow-same-origin"
    />
  );
}

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
  const [templateToDelete, setTemplateToDelete] = useState<TemplateListRow | null>(null);
  const { data: docData, isLoading: docLoading, error } = useDocumentTemplates();
  const { data: emailData, isLoading: emailLoading } = useEmailTemplates({ limit: 500 });
  const { data: brandsData } = useBrandProfiles();
  const deleteTemplate = useDeleteEmailTemplate();

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
          {row.source === "email" && (row.image_url ? (
            <img
              src={row.image_url}
              alt=""
              className="h-9 w-14 shrink-0 rounded border border-border object-cover"
            />
          ) : (
            <EmailTemplatePreviewThumb templateId={row.id} />
          ))}
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
    {
      key: "actions",
      header: "",
      render: (row) =>
        row.source === "email" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 min-w-8 p-0 text-fg-muted hover:text-state-danger"
            aria-label={`Delete ${row.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setTemplateToDelete(row);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          "—"
        ),
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

        <AlertDialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete template</AlertDialogTitle>
              <AlertDialogDescription>
                Delete &quot;{templateToDelete?.name}&quot;? This cannot be undone. Campaigns that used this template will keep their copy; you will no longer be able to select this template for new campaigns.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-state-danger text-white hover:bg-state-danger/90"
                onClick={async () => {
                  if (!templateToDelete) return;
                  try {
                    await deleteTemplate.mutateAsync(templateToDelete.id);
                    setTemplateToDelete(null);
                  } catch {
                    // Error surfaced via mutation state / toast if you add one
                  }
                }}
                disabled={deleteTemplate.isPending}
              >
                {deleteTemplate.isPending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Stack>
    </PageFrame>
  );
}
