"use client";

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

export default function EmailTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data: template, isLoading, error } = useEmailTemplate(id ?? null);
  const { data: brandsData } = useBrandProfiles();
  const brandId = template?.brand_profile_id ?? null;
  const { data: brand } = useBrandProfile(brandId);

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

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title={template.name}
          description={`Type: ${template.type}${template.brand_profile_id ? ` · Brand: ${brandName}` : " · Global"}`}
          actions={
            <div className="flex gap-2">
              <Button variant="primary" asChild>
                <Link href="/email-marketing/new/template">Use in email wizard</Link>
              </Button>
              <Button variant="secondary" onClick={() => router.push("/document-templates")}>
                Back to templates
              </Button>
            </div>
          }
        />
        <CardSection title="Details">
          <dl className="grid gap-3 text-body-small sm:grid-cols-2">
            <div>
              <dt className="text-text-secondary">Name</dt>
              <dd className="font-medium">{template.name}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Type</dt>
              <dd className="font-medium">{template.type}</dd>
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
              <dt className="text-text-secondary">Image slots</dt>
              <dd className="font-medium">{template.img_count}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Created</dt>
              <dd className="font-medium">{new Date(template.created_at).toLocaleString()}</dd>
            </div>
          </dl>
        </CardSection>
        {template.image_url && (
          <CardSection title="Preview image">
            <img
              src={template.image_url}
              alt={template.name}
              className="max-h-48 w-auto rounded border border-border object-contain"
            />
          </CardSection>
        )}
        {template.mjml && (
          <CardSection title="MJML">
            <pre className="max-h-64 overflow-auto rounded border border-border bg-bg-muted p-3 font-mono text-body-small">
              {template.mjml.slice(0, 2000)}
              {template.mjml.length > 2000 ? "\n…" : ""}
            </pre>
          </CardSection>
        )}
      </Stack>
    </PageFrame>
  );
}
