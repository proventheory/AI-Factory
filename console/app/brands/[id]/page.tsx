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
          <div className="space-y-6">
            {/* Core identity: grid with clear label/value pairs */}
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <dl className="space-y-1">
                <dt className="text-xs font-medium uppercase tracking-wider text-fg-muted">Archetype</dt>
                <dd className="text-body font-medium text-fg">{identity.archetype ?? "—"}</dd>
              </dl>
              <dl className="space-y-1">
                <dt className="text-xs font-medium uppercase tracking-wider text-fg-muted">Industry</dt>
                <dd className="text-body font-medium text-fg">{identity.industry ?? "—"}</dd>
              </dl>
              <dl className="space-y-1 sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wider text-fg-muted">Tagline</dt>
                <dd className="text-body font-medium text-fg">{identity.tagline ?? "—"}</dd>
              </dl>
              {identity.mission && (
                <dl className="space-y-1 sm:col-span-2 lg:col-span-4">
                  <dt className="text-xs font-medium uppercase tracking-wider text-fg-muted">Mission</dt>
                  <dd className="text-body text-fg mt-1 leading-relaxed">{identity.mission}</dd>
                </dl>
              )}
              {identity.values?.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Values</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {identity.values.map((v: string) => (
                      <Badge key={v}>{v}</Badge>
                    ))}
                  </dd>
                </div>
              )}
              {(identity.website || identity.location) && (
                <div className="flex flex-wrap gap-6 sm:col-span-2 lg:col-span-4">
                  {identity.website && (
                    <dl className="space-y-1">
                      <dt className="text-xs font-medium uppercase tracking-wider text-fg-muted">Website</dt>
                      <dd>
                        <a href={identity.website} target="_blank" rel="noopener noreferrer" className="text-body font-medium text-brand-600 hover:underline break-all">
                          {identity.website}
                        </a>
                      </dd>
                    </dl>
                  )}
                  {identity.location && (
                    <dl className="space-y-1">
                      <dt className="text-xs font-medium uppercase tracking-wider text-fg-muted">Location</dt>
                      <dd className="text-body font-medium text-fg">{identity.location}</dd>
                    </dl>
                  )}
                </div>
              )}
            </div>

            {/* Sitemap, Social, Contact (single source), Asset URLs — in sub-cards */}
            {((dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url) || (dt.social_media?.length > 0) || (dt.contact_info?.length > 0) || identity.contact_email || (dt.asset_urls?.length > 0)) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url) && (
                  <div className="rounded-lg border border-border bg-fg-muted/5 p-4">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Sitemap & links</h4>
                    <a href={dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url} target="_blank" rel="noopener noreferrer" className="text-body font-medium text-brand-600 hover:underline break-all">
                      {dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url}
                    </a>
                    {(dt.sitemap_type ?? dt.brand_sitemap_type ?? dt.email_sitemap_type) && (
                      <span className="ml-1.5 text-body-small text-fg-muted">({dt.sitemap_type ?? dt.brand_sitemap_type ?? dt.email_sitemap_type})</span>
                    )}
                  </div>
                )}

                {Array.isArray(dt.social_media) && dt.social_media.length > 0 && (
                  <div className="rounded-lg border border-border bg-fg-muted/5 p-4">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">Social</h4>
                    <ul className="space-y-2">
                      {dt.social_media.map((s: { name?: string; url?: string }, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          {s.name && <span className="text-body-small font-medium text-fg-muted shrink-0">{s.name}</span>}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-body text-brand-600 hover:underline truncate min-w-0">
                            {s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Contact: single place — show email once (identity or contact_info, no duplicate) */}
                {(Array.isArray(dt.contact_info) && dt.contact_info.length > 0) || identity.contact_email ? (
                  <div className="rounded-lg border border-border bg-fg-muted/5 p-4">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">Contact</h4>
                    <ul className="space-y-2">
                      {identity.contact_email && !(Array.isArray(dt.contact_info) && dt.contact_info.some((c: { type?: string }) => (c.type ?? "").toLowerCase() === "email")) && (
                        <li className="flex items-center gap-2">
                          <span className="text-body-small font-medium text-fg-muted shrink-0">email</span>
                          <a href={`mailto:${identity.contact_email}`} className="text-body text-brand-600 hover:underline truncate min-w-0">
                            {identity.contact_email}
                          </a>
                        </li>
                      )}
                      {Array.isArray(dt.contact_info) && dt.contact_info.map((c: { type?: string; value?: string }, i: number) => {
                        const isEmail = (c.type ?? "").toLowerCase() === "email";
                        if (isEmail && identity.contact_email) return null;
                        return (
                          <li key={i} className="flex items-center gap-2">
                            <span className="text-body-small font-medium text-fg-muted shrink-0">{c.type ?? "—"}</span>
                            {isEmail ? (
                              <a href={`mailto:${c.value}`} className="text-body text-brand-600 hover:underline truncate min-w-0">{c.value}</a>
                            ) : (
                              <span className="text-body text-fg">{c.value}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {Array.isArray(dt.asset_urls) && dt.asset_urls.length > 0 && (
                  <div className="rounded-lg border border-border bg-fg-muted/5 p-4 sm:col-span-2">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">Asset URLs</h4>
                    <ul className="space-y-2">
                      {dt.asset_urls.slice(0, 5).map((u: string, i: number) => (
                        <li key={i}>
                          <a href={u} target="_blank" rel="noopener noreferrer" className="text-body text-brand-600 hover:underline break-all">
                            {u}
                          </a>
                        </li>
                      ))}
                      {dt.asset_urls.length > 5 && <li className="text-body-small text-fg-muted">+{dt.asset_urls.length - 5} more</li>}
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
