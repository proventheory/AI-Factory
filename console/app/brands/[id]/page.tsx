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
import {
  getBrandPalette,
  getBrandTypography,
  getBrandCompleteness,
  getResolvedTokenEntries,
  type BrandCompleteness,
  type BrandPalette,
  type BrandTypography,
} from "../token-helpers";

function ColorSwatch({ hex, label, large }: { hex: string; label: string; large?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className={`rounded border border-border ${large ? "h-12 w-12" : "h-8 w-8"}`}
        style={{ backgroundColor: hex }}
      />
      <span className="text-[10px] text-text-secondary">{label}</span>
      <span className="text-[10px] font-mono text-text-muted">{hex}</span>
    </div>
  );
}

function CompletenessBadge({ level }: { level: string }) {
  const variant = level === "Complete" || level === "Ready" ? "success" : level === "Standard" ? "info" : "neutral";
  return <Badge variant={variant as "success" | "info" | "neutral"}>{level}</Badge>;
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
  const deckTheme = (brand.deck_theme ?? {}) as Record<string, unknown>;
  const reportTheme = (brand.report_theme ?? {}) as Record<string, unknown>;
  const logoUrl = dt?.logo?.url ?? dt?.logo_url ?? "";
  const contactEmailDisplay: string | undefined =
    identity.contact_email ||
    (Array.isArray(dt?.contact_info) ? dt.contact_info.find((c: { type?: string }) => (c.type ?? "").toLowerCase() === "email")?.value : undefined);

  const palette: BrandPalette = getBrandPalette(dt);
  const typography: BrandTypography = getBrandTypography(dt);
  const completeness: BrandCompleteness = getBrandCompleteness(dt, deckTheme, reportTheme);
  const resolvedPaths = ["color.brand.500", "color.brand.600", "typography.fonts.heading", "typography.fonts.body", "logo.url"];
  const resolvedEntries = getResolvedTokenEntries(dt, resolvedPaths);
  const brandColors: Record<string, string> = palette.brand ?? {};
  const neutralColors: Record<string, string> = palette.neutral ?? {};
  const sortScale = (a: [string, string], b: [string, string]) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    if (a[0] === "primary" || a[0] === "primary_dark") return 1;
    if (b[0] === "primary" || b[0] === "primary_dark") return -1;
    return String(a[0]).localeCompare(String(b[0]));
  };

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

        <CardSection title="Brand system">
          <p className="text-body-small text-text-secondary mb-4">
            Token registry and downstream readiness. Used across emails, pitch decks, reports, and content.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-4">
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">Color system</span>
              <div className="mt-1"><CompletenessBadge level={completeness.color} /></div>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">Typography</span>
              <div className="mt-1"><CompletenessBadge level={completeness.typography} /></div>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">Deck readiness</span>
              <div className="mt-1"><CompletenessBadge level={completeness.deck} /></div>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">Report readiness</span>
              <div className="mt-1"><CompletenessBadge level={completeness.report} /></div>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">Email readiness</span>
              <div className="mt-1"><CompletenessBadge level={completeness.email} /></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-body-small text-text-muted border-t border-border pt-4">
            <span>Last updated: {brand.updated_at ? new Date(brand.updated_at).toLocaleDateString() : "—"}</span>
            <span>Source: manual</span>
          </div>
        </CardSection>

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
              {(identity.website || identity.location || identity.contact_email || (Array.isArray(dt?.contact_info) && dt.contact_info.some((c: { type?: string }) => (c.type ?? "").toLowerCase() === "email"))) && (
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
                  {contactEmailDisplay && (
                    <dl className="space-y-1">
                      <dt className="text-xs font-medium uppercase tracking-wider text-fg-muted">Contact email</dt>
                      <dd>
                        <a href={`mailto:${contactEmailDisplay}`} className="text-body font-medium text-brand-600 hover:underline break-all">
                          {contactEmailDisplay}
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

        <CardSection title="Color palette">
          <p className="text-body-small text-text-secondary mb-4">
            Used in emails, pitch decks, reports, and UI. Scale keys (50–900) and legacy primary/secondary.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Brand</h4>
              <div className="flex flex-wrap gap-4">
                {Object.entries(brandColors)
                  .sort(sortScale)
                  .map(([shade, hex]) => (
                    <ColorSwatch key={shade} hex={hex} label={shade} large />
                  ))}
                {Object.keys(brandColors).length === 0 && (
                  <p className="text-body-small text-text-muted">No brand color tokens. Add in Edit.</p>
                )}
              </div>
            </div>
            {Object.keys(neutralColors).length > 0 && (
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Neutral</h4>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(neutralColors)
                    .sort(sortScale)
                    .map(([shade, hex]) => (
                      <ColorSwatch key={shade} hex={hex} label={shade} large />
                    ))}
                </div>
              </div>
            )}
          </div>
        </CardSection>

        <CardSection title="Typography">
          <p className="text-body-small text-text-secondary mb-4">
            Type scale and weights used across emails, pitch decks, reports, and content.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Families</h4>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-body-small">
                <div><dt className="text-fg-muted">Heading</dt><dd className="font-medium" style={{ fontFamily: typography.fontHeadings }}>{typography.fontHeadings}</dd></div>
                <div><dt className="text-fg-muted">Body</dt><dd className="font-medium" style={{ fontFamily: typography.fontBody }}>{typography.fontBody}</dd></div>
                <div><dt className="text-fg-muted">Mono</dt><dd className="font-medium font-mono">{typography.fontMono}</dd></div>
              </dl>
            </div>
            {Object.keys(typography.heading).length > 0 && (
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Type scale (specimens)</h4>
                <div className="space-y-2">
                  {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).filter((h) => typography.heading[h]).map((h) => {
                    const spec = typography.heading[h];
                    if (!spec) return null;
                    return (
                      <div key={h} className="flex items-baseline gap-3">
                        <span className="text-fg-muted w-12 shrink-0 text-body-small">{h}</span>
                        <span style={{ fontSize: spec.size, fontWeight: spec.weight, lineHeight: spec.lineHeight, fontFamily: typography.fontHeadings }}>
                          {brand.name}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-baseline gap-3">
                    <span className="text-fg-muted w-12 shrink-0 text-body-small">Body</span>
                    <span style={{ fontSize: typography.body.default.size, fontWeight: typography.body.default.weight, fontFamily: typography.fontBody }}>
                      The quick brown fox jumps over the lazy dog.
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-fg-muted w-12 shrink-0 text-body-small">Caption</span>
                    <span style={{ fontSize: typography.caption.size, fontWeight: typography.caption.weight, fontFamily: typography.fontBody }}>
                      Caption and metadata text
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Weights</h4>
              <div className="flex flex-wrap gap-4">
                {Object.entries(typography.fontWeight).map(([name, w]) => (
                  <span key={name} className="text-body-small" style={{ fontWeight: w }}>
                    {name} ({w})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardSection>

        <CardSection title="Resolved tokens">
          <p className="text-body-small text-text-secondary mb-4">
            Where each value comes from: explicit on this brand, or default. Use for debugging.
          </p>
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-body-small">
              <thead className="bg-fg-muted/10">
                <tr>
                  <th className="text-left p-2 font-medium text-fg-muted">Path</th>
                  <th className="text-left p-2 font-medium text-fg-muted">Source</th>
                  <th className="text-left p-2 font-medium text-fg-muted">Value</th>
                </tr>
              </thead>
              <tbody>
                {resolvedEntries.map((e) => (
                  <tr key={e.path} className="border-t border-border">
                    <td className="p-2 font-mono text-xs">{e.path}</td>
                    <td className="p-2"><CompletenessBadge level={e.source} /></td>
                    <td className="p-2 truncate max-w-[200px]">
                      {typeof e.value === "string" && e.value.startsWith("#") ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-4 w-4 rounded border" style={{ backgroundColor: e.value }} />
                          {e.value}
                        </span>
                      ) : (
                        String(e.value ?? "—")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardSection>

        <CardSection title="Where these tokens are used">
          <p className="text-body-small text-text-secondary mb-4">
            This brand system drives output across the factory. v1: static links; later: template counts and last used.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li>
              <a href="/document-templates" className="text-body font-medium text-brand-600 hover:underline">
                Email templates
              </a>
              <span className="text-body-small text-fg-muted ml-1">— templates, campaigns</span>
            </li>
            <li>
              <a href="/document-templates" className="text-body font-medium text-brand-600 hover:underline">
                Pitch decks
              </a>
              <span className="text-body-small text-fg-muted ml-1">— slide master, charts</span>
            </li>
            <li>
              <a href="/document-templates" className="text-body font-medium text-brand-600 hover:underline">
                Report decks
              </a>
              <span className="text-body-small text-fg-muted ml-1">— reports, PDFs</span>
            </li>
            <li>
              <span className="text-body font-medium text-fg">Graphics & content</span>
              <span className="text-body-small text-fg-muted ml-1">— image generation, social</span>
            </li>
          </ul>
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
