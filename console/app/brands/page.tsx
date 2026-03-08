"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive } from "lucide-react";
import {
  Button,
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
  TableFrame,
  DataTable,
  Badge,
  LoadingSkeleton,
  EmptyState,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useBrandProfiles, useDeleteBrandProfile, useUpdateBrandProfile } from "@/hooks/use-api";
import type { BrandProfileRow } from "@/lib/api";

function statusVariant(status: string): "success" | "warning" | "neutral" {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

export default function BrandsPage() {
  const router = useRouter();
  const [brandToArchive, setBrandToArchive] = useState<BrandProfileRow | null>(null);
  const { data, isLoading, error } = useBrandProfiles({ limit: 50 });
  const deleteBrand = useDeleteBrandProfile();
  const updateBrand = useUpdateBrandProfile();
  const items = data?.items ?? [];

  const columns: Column<BrandProfileRow>[] = [
    { key: "name", header: "Name" },
    {
      key: "archetype",
      header: "Archetype",
      render: (row) => (row.identity as Record<string, unknown>)?.archetype as string ?? "—",
    },
    {
      key: "industry",
      header: "Industry",
      render: (row) => (row.identity as Record<string, unknown>)?.industry as string ?? "—",
    },
    {
      key: "contact_email",
      header: "Contact email",
      render: (row) => {
        const identity = row.identity as Record<string, unknown> | undefined;
        const email = identity?.contact_email as string | undefined;
        if (email) return <a href={`mailto:${email}`} className="text-brand-600 hover:underline truncate max-w-[180px] block" onClick={(e) => e.stopPropagation()}>{email}</a>;
        const dt = row.design_tokens as Record<string, unknown> | undefined;
        const contactInfo = Array.isArray(dt?.contact_info) ? dt.contact_info as { type?: string; value?: string }[] : [];
        const contactEmail = contactInfo.find((c) => (c.type ?? "").toLowerCase() === "email")?.value;
        return contactEmail ? <a href={`mailto:${contactEmail}`} className="text-brand-600 hover:underline truncate max-w-[180px] block" onClick={(e) => e.stopPropagation()}>{contactEmail}</a> : "—";
      },
    },
    {
      key: "color",
      header: "Color",
      render: (row) => {
        const dt = row.design_tokens as Record<string, unknown>;
        const color = dt?.color as Record<string, Record<string, string>> | undefined;
        const hex = color?.brand?.["500"];
        return hex ? (
          <span className="inline-block h-4 w-4 rounded-full border" style={{ backgroundColor: hex }} />
        ) : (
          "—"
        );
      },
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
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 min-w-8 p-0 text-fg-muted hover:text-fg"
            aria-label={`Edit ${row.name}`}
            onClick={() => router.push(`/brands/${row.id}/edit`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {row.status === "archived" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 min-w-8 p-0 text-fg-muted hover:text-brand-600"
              aria-label={`Restore ${row.name}`}
              onClick={() => updateBrand.mutate({ id: row.id, status: "active" })}
              disabled={updateBrand.isPending}
            >
              Restore
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 min-w-8 p-0 text-fg-muted hover:text-state-danger"
              aria-label={`Archive ${row.name}`}
              onClick={() => setBrandToArchive(row)}
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const handleArchive = async () => {
    if (!brandToArchive) return;
    try {
      await deleteBrand.mutateAsync(brandToArchive.id);
      setBrandToArchive(null);
    } catch {
      // Error surfaced via mutation state if needed
    }
  };

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Brands" />
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
          title="Brands"
          description="Manage brand profiles and identity"
          actions={
            <Button variant="primary" onClick={() => router.push("/brands/new")}>
              New Brand
            </Button>
          }
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
              title="No brands yet"
              description="Create your first brand profile to get started."
              action={
                <Button variant="primary" onClick={() => router.push("/brands/new")}>
                  New Brand
                </Button>
              }
            />
          ) : (
            <TableFrame>
              <DataTable
                columns={columns}
                data={items}
                keyExtractor={(row) => row.id}
                onRowClick={(row) => router.push(`/brands/${row.id}`)}
              />
            </TableFrame>
          )}
        </CardSection>
      </Stack>

      <AlertDialog open={!!brandToArchive} onOpenChange={(open) => !open && setBrandToArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive brand</AlertDialogTitle>
            <AlertDialogDescription>
              Archive &quot;{brandToArchive?.name}&quot;? The brand will be marked archived and hidden from active use. You can still view it; initiatives and templates linked to it will keep their reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-state-danger text-white hover:bg-state-danger/90"
              onClick={handleArchive}
              disabled={deleteBrand.isPending}
            >
              {deleteBrand.isPending ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
