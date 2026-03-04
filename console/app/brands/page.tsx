"use client";

import { useRouter } from "next/navigation";
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
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useBrandProfiles } from "@/hooks/use-api";
import type { BrandProfileRow } from "@/lib/api";

function statusVariant(status: string): "success" | "warning" | "neutral" {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

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
    key: "color",
    header: "Color",
    render: (row) => {
      const dt = row.design_tokens as Record<string, any>;
      const hex = dt?.color?.brand?.["500"];
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
];

export default function BrandsPage() {
  const router = useRouter();
  const { data, isLoading, error } = useBrandProfiles({ limit: 50 });
  const items = data?.items ?? [];

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
    </PageFrame>
  );
}
