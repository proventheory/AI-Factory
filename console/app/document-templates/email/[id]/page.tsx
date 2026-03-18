"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
  LoadingSkeleton,
} from "@/components/ui";
import { useEmailTemplate, useBrandProfile, useBrandProfiles } from "@/hooks/use-api";
import { fetchEmailTemplatePreviewHtml, getEmailComponentLibrary } from "@/lib/api";
import type { EmailComponentRow } from "@/lib/api";

export default function EmailTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data: template, isLoading, error } = useEmailTemplate(id ?? null);
  const { data: brandsData } = useBrandProfiles();
  const brandId = template?.brand_profile_id ?? null;
  const { data: brand } = useBrandProfile(brandId);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [componentsUsed, setComponentsUsed] = useState<EmailComponentRow[]>([]);

  useEffect(() => {
    if (!id) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewHtml(null);
    fetchEmailTemplatePreviewHtml(id)
      .then(setPreviewHtml)
      .catch((e) => setPreviewError(e instanceof Error ? e.message : String(e)))
      .finally(() => setPreviewLoading(false));
  }, [id]);

  useEffect(() => {
    const seq = template?.component_sequence;
    if (!seq || !Array.isArray(seq) || seq.length === 0) {
      setComponentsUsed([]);
      return;
    }
    getEmailComponentLibrary({ limit: 200 })
      .then(({ items }) => {
        const ordered = seq
          .map((id) => items.find((c) => c.id === id))
          .filter((c): c is EmailComponentRow => c != null);
        setComponentsUsed(ordered);
      })
      .catch(() => setComponentsUsed([]));
  }, [template?.component_sequence]);

  const brandsMap = new Map((brandsData?.items ?? []).map((b) => [b.id, b.name]));

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Email Template" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {(error as Error).message}
          </div>
          <Button variant="secondary" onClick={() => router.push("/document-templates")}>
            Back to templates
          </Button>
        </Stack>
      </PageFrame>
    );
  }

  if (isLoading || !template) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Email Template" />
          <CardSection>
            <LoadingSkeleton className="h-32 w-full rounded-lg" />
          </CardSection>
        </Stack>
      </PageFrame>
    );
  }

  const brandName = template.brand_profile_id
    ? (brand?.name ?? brandsMap.get(template.brand_profile_id) ?? template.brand_profile_id?.slice(0, 8))
    : "—";
  const imageSlots = template.image_slots ?? template.img_count ?? 0;
  const productSlots = template.product_slots ?? 0;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title={template.name}
          description={template.brand_profile_id ? `Global · ${brandName}` : "Global (all brands)"}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" asChild>
                <Link href="/email-design-generator/new/template">Use in email wizard</Link>
              </Button>
              <Button variant="secondary" onClick={() => router.push("/document-templates")}>
                Back to templates
              </Button>
            </div>
          }
        />

        {/* Components used — when template is built from component_sequence */}
        {componentsUsed.length > 0 && (
          <CardSection title="Components used" className="border-brand-200 bg-brand-50/50">
            <p className="text-body-small text-text-secondary mb-3">
              This template is composed from the following components (in order) from the Component Registry.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-body-small">
              {componentsUsed.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-fg">{c.name}</span>
                  <span className="text-fg-muted font-mono text-xs">{c.component_type}</span>
                  <Link href="/components" className="text-brand-600 hover:underline text-xs">
                    View in registry
                  </Link>
                </li>
              ))}
            </ol>
          </CardSection>
        )}

        {/* Template capacity — prominent so users see slot limits before using in wizard */}
        <CardSection title="Template capacity" className="border-brand-200 bg-brand-50/50">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-caption-small uppercase tracking-wider text-fg-muted">Layout style</p>
              <p className="text-body font-medium text-fg">{template.type ?? "email"} (email template)</p>
            </div>
            <div>
              <p className="text-caption-small uppercase tracking-wider text-fg-muted">Content images</p>
              <p className="text-body font-medium text-fg">{imageSlots}</p>
              <p className="text-caption-small text-fg-muted">Hero/banner images (not product images)</p>
            </div>
            <div>
              <p className="text-caption-small uppercase tracking-wider text-fg-muted">Products</p>
              <p className="text-body font-medium text-fg">{productSlots}</p>
              <p className="text-caption-small text-fg-muted">Product slots (each has image + title + link)</p>
            </div>
          </div>
        </CardSection>

        <div className="grid gap-6 lg:grid-cols-2">
          <CardSection title="Details">
            <dl className="grid gap-3 text-body-small sm:grid-cols-1">
              <div>
                <dt className="text-text-secondary">Name</dt>
                <dd className="font-medium">{template.name}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Brand</dt>
                <dd className="font-medium">
                  {template.brand_profile_id ? (
                    <Link href={`/brands/${template.brand_profile_id}`} className="text-brand-600 hover:underline">
                      {brandName}
                    </Link>
                  ) : (
                    "Global (all brands)"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Layout style</dt>
                <dd className="font-medium">{template.layout_style ?? `${template.type ?? "email"} (email template)`}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Slots</dt>
                <dd className="font-medium">
                  {imageSlots} content image{imageSlots !== 1 ? "s" : ""}, {productSlots} product{productSlots !== 1 ? "s" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Created</dt>
                <dd className="font-medium">{new Date(template.created_at).toLocaleString()}</dd>
              </div>
            </dl>
          </CardSection>

          {template.image_url && (
            <CardSection title="Preview image">
              <div className="flex justify-center rounded-lg border border-border bg-fg-muted/5 p-4">
                <img
                  src={template.image_url}
                  alt={template.name}
                  className="max-h-72 w-auto rounded object-contain shadow-sm"
                />
              </div>
            </CardSection>
          )}
        </div>

        <CardSection title="Rendered preview">
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            {previewLoading && (
              <div className="flex items-center justify-center h-64 text-fg-muted text-sm">Loading preview…</div>
            )}
            {previewError && (
              <div className="px-4 py-3 text-body-small text-state-danger">
                Preview failed: {previewError}
              </div>
            )}
            {previewHtml && !previewError && (
              <iframe
                title="Email template preview"
                srcDoc={previewHtml}
                className="w-full min-h-[420px] border-0"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </CardSection>

        {template.mjml && (
          <CardSection
            title="MJML source"
            rightSlot={
              <span className="text-caption-small text-fg-muted">
                {template.mjml.length.toLocaleString()} chars
              </span>
            }
          >
            <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-bg-muted p-4 font-mono text-body-small leading-relaxed">
              {template.mjml.slice(0, 2000)}
              {template.mjml.length > 2000 ? "\n…" : ""}
            </pre>
          </CardSection>
        )}
      </Stack>
    </PageFrame>
  );
}
