"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
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
import {
  useBrandProfile,
  useBrandEmbeddings,
  useCreateBrandEmbedding,
  useDeleteBrandEmbedding,
} from "@/hooks/use-api";
import type { BrandEmbeddingRow } from "@/lib/api";

function typeVariant(t: string): "info" | "success" | "warning" | "neutral" {
  if (t === "tagline" || t === "slogan") return "success";
  if (t === "mission" || t === "vision") return "info";
  if (t === "style_guide") return "warning";
  return "neutral";
}

export default function BrandEmbeddingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: brand } = useBrandProfile(id);
  const { data, isLoading, error } = useBrandEmbeddings(id);
  const createMut = useCreateBrandEmbedding();
  const deleteMut = useDeleteBrandEmbedding();

  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [embeddingType, setEmbeddingType] = useState("tagline");

  const items = data?.items ?? [];

  const handleCreate = async () => {
    if (!content.trim()) return;
    await createMut.mutateAsync({
      brandId: id,
      content: content.trim(),
      embedding_type: embeddingType,
    });
    setContent("");
    setShowForm(false);
  };

  const columns: Column<BrandEmbeddingRow>[] = [
    {
      key: "embedding_type",
      header: "Type",
      render: (row) => <Badge variant={typeVariant(row.embedding_type)}>{row.embedding_type}</Badge>,
    },
    {
      key: "content",
      header: "Content",
      render: (row) => (
        <span className="block max-w-md truncate" title={row.content}>
          {row.content.length > 100 ? row.content.slice(0, 100) + "\u2026" : row.content}
        </span>
      ),
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
        <Button
          variant="secondary"
          className="border-state-dangerMuted text-state-danger hover:bg-state-dangerMuted/30"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Delete this embedding?"))
              deleteMut.mutate({ brandId: id, embeddingId: row.id });
          }}
        >
          Delete
        </Button>
      ),
    },
  ];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Brand Embeddings" />
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
          title={`Embeddings — ${brand?.name ?? "Brand"}`}
          description="Manage brand voice and content embeddings"
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push(`/brands/${id}`)}>
                Back to Brand
              </Button>
              <Button variant="primary" onClick={() => setShowForm(!showForm)}>
                {showForm ? "Cancel" : "Add Embedding"}
              </Button>
            </div>
          }
        />

        {showForm && (
          <CardSection title="New Embedding">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_auto]">
              <div>
                <label className="mb-1 block text-body-small font-medium text-text-primary">
                  Content <span className="text-state-danger">*</span>
                </label>
                <textarea
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste brand copy, tagline, mission text..."
                />
              </div>
              <div>
                <label className="mb-1 block text-body-small font-medium text-text-primary">
                  Type
                </label>
                <Select
                  value={embeddingType}
                  onChange={(e) => setEmbeddingType(e.target.value)}
                >
                  <option value="tagline">Tagline</option>
                  <option value="slogan">Slogan</option>
                  <option value="mission">Mission</option>
                  <option value="vision">Vision</option>
                  <option value="style_guide">Style Guide</option>
                  <option value="copy_sample">Copy Sample</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="primary"
                  onClick={handleCreate}
                  disabled={createMut.isPending || !content.trim()}
                >
                  {createMut.isPending ? "Saving\u2026" : "Save"}
                </Button>
              </div>
            </div>
          </CardSection>
        )}

        <CardSection>
          {isLoading ? (
            <div className="space-y-3">
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-4/5" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No embeddings yet"
              description="Add brand copy, taglines, or style guide text to build your brand voice."
              action={
                <Button variant="primary" onClick={() => setShowForm(true)}>
                  Add Embedding
                </Button>
              }
            />
          ) : (
            <TableFrame>
              <DataTable
                columns={columns}
                data={items}
                keyExtractor={(row) => row.id}
              />
            </TableFrame>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
