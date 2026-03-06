"use client";

import { useParams, useRouter } from "next/navigation";
import {
  Button,
  Badge,
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
  LoadingSkeleton,
} from "@/components/ui";
import {
  useBrandProfile,
  useDeleteBrandProfile,
  useBrandEmbeddings,
  useBrandAssets,
} from "@/hooks/use-api";

function ColorSwatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="h-8 w-8 rounded border" style={{ backgroundColor: hex }} />
      <span className="text-[10px] text-text-secondary">{label}</span>
    </div>
  );
}

export default function BrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: brand, isLoading, error } = useBrandProfile(id);
  const { data: embeddings } = useBrandEmbeddings(id);
  const { data: assets } = useBrandAssets(id);
  const archiveMut = useDeleteBrandProfile();

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Brand Detail" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {(error as Error).message}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  if (isLoading || !brand) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Brand Detail" />
          <CardSection>
            <div className="space-y-3">
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-3/4" />
            </div>
          </CardSection>
        </Stack>
      </PageFrame>
    );
  }

  const identity = (brand.identity ?? {}) as Record<string, any>;
  const tone = (brand.tone ?? {}) as Record<string, any>;
  const vs = (brand.visual_style ?? {}) as Record<string, any>;
  const cs = (brand.copy_style ?? {}) as Record<string, any>;
  const dt = (brand.design_tokens ?? {}) as Record<string, any>;
  const brandColors: Record<string, string> = dt?.color?.brand ?? {};
  const logoUrl = dt?.logo?.url ?? dt?.logo_url ?? "";

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title={brand.name}
          description={`Status: ${brand.status}`}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push(`/brands/${id}/edit`)}>
                Edit
              </Button>
              <Button
                variant="secondary"
                className="border-state-dangerMuted text-state-danger hover:bg-state-dangerMuted/30"
                onClick={() => {
                  if (confirm("Archive this brand?"))
                    archiveMut.mutate(id, { onSuccess: () => router.push("/brands") });
                }}
              >
                Archive
              </Button>
            </div>
          }
        />

        {logoUrl && (
          <CardSection title="Logo">
            <div className="flex flex-wrap items-center gap-4">
              <img
                src={logoUrl}
                alt={`${brand.name} logo`}
                className="h-20 w-auto max-w-[200px] object-contain rounded border border-border bg-bg-muted"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="text-body-small text-text-secondary">
                <a href={logoUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline break-all">
                  {logoUrl}
                </a>
              </div>
            </div>
          </CardSection>
        )}

        <CardSection title="Brand Identity">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <span className="text-text-secondary">Archetype</span>
                <p className="font-medium">{identity.archetype ?? "—"}</p>
              </div>
              <div>
                <span className="text-text-secondary">Industry</span>
                <p className="font-medium">{identity.industry ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <span className="text-text-secondary">Tagline</span>
                <p className="font-medium">{identity.tagline ?? "—"}</p>
              </div>
              {identity.mission && (
                <div className="col-span-2 md:col-span-4">
                  <span className="text-text-secondary">Mission</span>
                  <p>{identity.mission}</p>
                </div>
              )}
              {identity.values?.length > 0 && (
                <div className="col-span-2 md:col-span-4">
                  <span className="text-text-secondary">Values</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {identity.values.map((v: string) => (
                      <Badge key={v}>{v}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(identity.website || identity.contact_email || identity.location) && (
                <div className="col-span-2 md:col-span-4 flex flex-wrap gap-4">
                  {identity.website && (
                    <div>
                      <span className="text-text-secondary">Website</span>
                      <p className="font-medium"><a href={identity.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{identity.website}</a></p>
                    </div>
                  )}
                  {identity.contact_email && (
                    <div>
                      <span className="text-text-secondary">Contact email</span>
                      <p className="font-medium">{identity.contact_email}</p>
                    </div>
                  )}
                  {identity.location && (
                    <div>
                      <span className="text-text-secondary">Location</span>
                      <p className="font-medium">{identity.location}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            {((dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url) || (dt.social_media?.length > 0) || (dt.contact_info?.length > 0) || (dt.asset_urls?.length > 0)) && (
              <div className="border-t border-border pt-4 grid gap-3 text-sm">
                <span className="text-text-secondary font-medium">Sitemap & links</span>
                {(dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url) && (
                  <div>
                    <span className="text-text-secondary">Brand sitemap</span>
                    <p className="font-medium">
                      <a href={dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                        {dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url}
                      </a>
                      {(dt.sitemap_type ?? dt.brand_sitemap_type ?? dt.email_sitemap_type) ? ` (${dt.sitemap_type ?? dt.brand_sitemap_type ?? dt.email_sitemap_type})` : ""}
                    </p>
                  </div>
                )}
                {Array.isArray(dt.social_media) && dt.social_media.length > 0 && (
                  <div>
                    <span className="text-text-secondary">Social</span>
                    <ul className="mt-1 list-disc list-inside">
                      {dt.social_media.map((s: { name?: string; url?: string }, i: number) => (
                        <li key={i}>
                          {s.name && <span>{s.name}: </span>}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{s.url}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(dt.contact_info) && dt.contact_info.length > 0 && (
                  <div>
                    <span className="text-text-secondary">Contact</span>
                    <ul className="mt-1 list-disc list-inside">
                      {dt.contact_info.map((c: { type?: string; value?: string }, i: number) => (
                        <li key={i}>{c.type}: {c.value}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(dt.asset_urls) && dt.asset_urls.length > 0 && (
                  <div>
                    <span className="text-text-secondary">Asset URLs</span>
                    <ul className="mt-1 list-disc list-inside break-all">
                      {dt.asset_urls.slice(0, 5).map((u: string, i: number) => (
                        <li key={i}><a href={u} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{u}</a></li>
                      ))}
                      {dt.asset_urls.length > 5 && <li className="text-text-secondary">+{dt.asset_urls.length - 5} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardSection>

        <CardSection title="Tone & Voice">
          <div className="flex flex-wrap gap-6 text-sm">
            {tone.voice_descriptors?.length > 0 && (
              <div>
                <span className="text-text-secondary">Voice</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tone.voice_descriptors.map((v: string) => (
                    <Badge key={v} variant="info">{v}</Badge>
                  ))}
                </div>
              </div>
            )}
            {tone.reading_level && (
              <div>
                <span className="text-text-secondary">Reading Level</span>
                <p className="font-medium">{tone.reading_level}</p>
              </div>
            )}
            {tone.formality && (
              <div>
                <span className="text-text-secondary">Formality</span>
                <p className="font-medium">{tone.formality}</p>
              </div>
            )}
            {tone.sentence_length && (
              <div>
                <span className="text-text-secondary">Sentence Length</span>
                <p className="font-medium">{tone.sentence_length}</p>
              </div>
            )}
          </div>
        </CardSection>

        <CardSection title="Visual Style">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            {vs.density && (
              <div>
                <span className="text-text-secondary">Density</span>
                <p className="font-medium">{vs.density}</p>
              </div>
            )}
            {vs.style_description && (
              <div className="col-span-2">
                <span className="text-text-secondary">Style</span>
                <p>{vs.style_description}</p>
              </div>
            )}
            {vs.image_style && (
              <div>
                <span className="text-text-secondary">Image Style</span>
                <p className="font-medium">{vs.image_style}</p>
              </div>
            )}
            {vs.icon_style && (
              <div>
                <span className="text-text-secondary">Icon Style</span>
                <p className="font-medium">{vs.icon_style}</p>
              </div>
            )}
          </div>
        </CardSection>

        <CardSection title="Copy Style">
          <div className="flex flex-wrap gap-6 text-sm">
            {cs.voice && (
              <div className="max-w-md">
                <span className="text-text-secondary">Voice</span>
                <p>{cs.voice}</p>
              </div>
            )}
            {cs.banned_words?.length > 0 && (
              <div>
                <span className="text-text-secondary">Banned Words</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {cs.banned_words.map((w: string) => (
                    <Badge key={w} variant="error">{w}</Badge>
                  ))}
                </div>
              </div>
            )}
            {cs.preferred_phrases?.length > 0 && (
              <div>
                <span className="text-text-secondary">Preferred Phrases</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {cs.preferred_phrases.map((p: string) => (
                    <Badge key={p} variant="success">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
            {cs.cta_style && (
              <div>
                <span className="text-text-secondary">CTA Style</span>
                <p className="font-medium">{cs.cta_style}</p>
              </div>
            )}
          </div>
        </CardSection>

        <CardSection title="Design Tokens — Color Palette">
          <div className="flex flex-wrap gap-2">
            {Object.entries(brandColors)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([shade, hex]) => (
                <ColorSwatch key={shade} hex={hex} label={shade} />
              ))}
            {Object.keys(brandColors).length === 0 && (
              <p className="text-sm text-text-secondary">No color tokens defined.</p>
            )}
          </div>
        </CardSection>

        <CardSection
          title="Brand Embeddings"
          rightSlot={
            <Button variant="secondary" onClick={() => router.push(`/brands/${id}/embeddings`)}>
              Manage
            </Button>
          }
        >
          <p className="text-sm text-text-secondary">
            {embeddings?.items?.length ?? 0} embeddings stored
          </p>
        </CardSection>

        <CardSection title="Brand Assets">
          <div className="flex flex-wrap gap-4">
            {(assets?.items ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary">No assets uploaded.</p>
            ) : (
              (assets?.items ?? []).map((a) => (
                <div key={a.id} className="flex flex-col items-center gap-1">
                  <img
                    src={a.uri}
                    alt={a.asset_type}
                    className="h-12 w-12 rounded border object-contain"
                  />
                  <span className="text-xs text-text-secondary">{a.asset_type}</span>
                </div>
              ))
            )}
          </div>
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
