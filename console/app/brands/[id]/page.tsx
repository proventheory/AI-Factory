"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  useBrandUsage,
} from "@/hooks/use-api";
import {
  getBrandPalette,
  getBrandTypography,
  getBrandCompletenessDiagnostics,
  getResolvedTokenEntries,
  RESOLVED_TOKEN_PATHS,
  PALETTE_ROLE_USAGE,
  type BrandPalette,
  type BrandTypography,
} from "../token-helpers";
import * as api from "@/lib/api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

function ColorSwatch({ hex, label, large, usage }: { hex: string; label: string; large?: boolean; usage?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className={`rounded border border-border ${large ? "h-12 w-12" : "h-8 w-8"}`}
        style={{ backgroundColor: hex }}
      />
      <span className="text-[10px] text-text-secondary">{label}</span>
      {usage && <span className="text-[9px] text-fg-muted max-w-[80px] text-center">{usage}</span>}
      <span className="text-[10px] font-mono text-text-muted">{hex}</span>
    </div>
  );
}

function CompletenessBadge({ level }: { level: string }) {
  const variant = level === "Complete" || level === "Ready" ? "success" : level === "Standard" ? "info" : "neutral";
  return <Badge variant={variant as "success" | "info" | "neutral"}>{level}</Badge>;
}

function ReadinessRow({
  label,
  level,
  reason,
  suggestion,
  missing,
}: { label: string; level: string; reason: string; suggestion?: string; missing?: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-fg-muted/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">{label}</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CompletenessBadge level={level} />
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="text-body-small text-brand-600 hover:underline"
            >
              {open ? "Hide why" : "Why?"}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-body-small text-text-secondary">
          <p>{reason}</p>
          {suggestion && <p className="text-fg-muted">→ {suggestion}</p>}
          {missing && missing.length > 0 && (
            <p className="font-medium text-fg-muted">Missing: {missing.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function BrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: brand, isLoading, error } = useBrandProfile(id);
  const { data: embeddings } = useBrandEmbeddings(id);
  const { data: assets } = useBrandAssets(id);
  const { data: usage } = useBrandUsage(id ?? null);
  const archiveMut = useDeleteBrandProfile();
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [ga4PropertyId, setGa4PropertyId] = useState<string | null>(null);
  const [ga4Properties, setGa4Properties] = useState<{ propertyId: string; displayName: string; accountDisplayName?: string }[]>([]);
  const [ga4PropertiesLoading, setGa4PropertiesLoading] = useState(false);
  const [ga4PropertiesError, setGa4PropertiesError] = useState<string | null>(null);
  const [ga4PropertySaveBusy, setGa4PropertySaveBusy] = useState(false);
  const [googleDisconnectBusy, setGoogleDisconnectBusy] = useState(false);
  const [googleConnectError, setGoogleConnectError] = useState<string | null>(null);

  const fetchGoogleConnected = useCallback(() => {
    if (!id) return;
    api.getBrandGoogleConnected(id).then((r) => {
      setGoogleConnected(r.connected);
      setGa4PropertyId(r.ga4_property_id ?? null);
    }).catch(() => setGoogleConnected(false));
  }, [id]);

  useEffect(() => {
    fetchGoogleConnected();
  }, [fetchGoogleConnected]);

  useEffect(() => {
    if (!id || !googleConnected) return;
    setGa4PropertiesLoading(true);
    setGa4PropertiesError(null);
    api.getBrandGoogleGa4Properties(id).then((r) => {
      setGa4Properties(r.properties ?? []);
      setGa4PropertiesError(null);
    }).catch((err: Error) => {
      setGa4Properties([]);
      const raw = err?.message ?? "Could not load GA4 properties";
      setGa4PropertiesError(raw.includes("<") ? "Could not load GA4 properties. If you just deployed, wait a minute and refresh." : raw);
    }).finally(() => setGa4PropertiesLoading(false));
  }, [id, googleConnected]);

  useEffect(() => {
    const connected = searchParams.get("google_connected");
    const err = searchParams.get("error");
    if (connected === "1" || err) {
      setGoogleConnected(connected === "1");
      setGoogleConnectError(err ? decodeURIComponent(err) : null);
      if (connected === "1" && id) api.getBrandGoogleConnected(id).then((r) => { setGa4PropertyId(r.ga4_property_id ?? null); });
      router.replace(`/brands/${id}`, { scroll: false });
    }
  }, [id, router, searchParams]);

  /** Direct link so browser navigates to API → API 302 to Google. Avoids fetch-then-redirect being blocked. */
  const connectGoogleHref =
    typeof window !== "undefined" && id
      ? `${API}/v1/seo/google/auth?brand_id=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(`${window.location.origin}/brands/${id}`)}&redirect=1`
      : "#";

  async function handleDisconnectGoogle() {
    if (!id) return;
    setGoogleDisconnectBusy(true);
    try {
      await api.deleteBrandGoogleCredentials(id);
      setGoogleConnected(false);
      setGa4PropertyId(null);
      setGa4Properties([]);
      setGa4PropertiesError(null);
    } finally {
      setGoogleDisconnectBusy(false);
    }
  }

  async function handleGa4PropertyChange(value: string) {
    if (!id) return;
    const propertyId = value === "" ? null : value;
    setGa4PropertySaveBusy(true);
    try {
      await api.patchBrandGoogleGa4Property(id, { property_id: propertyId });
      setGa4PropertyId(propertyId);
    } finally {
      setGa4PropertySaveBusy(false);
    }
  }

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
  const diagnostics = getBrandCompletenessDiagnostics(dt, deckTheme, reportTheme);
  const resolvedEntries = getResolvedTokenEntries(dt, [...RESOLVED_TOKEN_PATHS]);
  const brandColors: Record<string, string> = palette.brand ?? {};
  const neutralColors: Record<string, string> = palette.neutral ?? {};
  const scaleKeys = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
  const roleAliasKeys = ["primary", "primary_dark", "accent", "secondary"];
  const brandScale = Object.fromEntries(Object.entries(brandColors).filter(([k]) => scaleKeys.includes(k)));
  const brandRoles = Object.fromEntries(Object.entries(brandColors).filter(([k]) => !scaleKeys.includes(k)));
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

        <CardSection title="Google (GSC / GA4)">
          <p className="text-body-small text-text-secondary mb-3">
            Connect the Google account that has access to Search Console and GA4 for this brand. SEO initiatives that use this brand will use this connection.
          </p>
          <p className="text-body-small text-text-muted mb-3">
            When you connect, Google will ask you to choose an account if you have more than one. To use a different account later, use &quot;Use a different account&quot; below or disconnect and connect again.
          </p>
          {googleConnectError && (
            <div className="mb-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
              {googleConnectError}
            </div>
          )}
          {googleConnected === true ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-sm">Google connected</span>
                <a href={connectGoogleHref} className="text-body-small text-brand-600 hover:underline">
                  Use a different account
                </a>
                <Button variant="secondary" onClick={handleDisconnectGoogle} disabled={googleDisconnectBusy}>
                  {googleDisconnectBusy ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="ga4-property" className="text-body-small font-medium text-fg-muted shrink-0">
                  GA4 property
                </label>
                {ga4PropertiesLoading ? (
                  <span className="text-body-small text-fg-muted">Loading properties…</span>
                ) : (
                  <select
                    id="ga4-property"
                    value={ga4PropertyId ?? ""}
                    onChange={(e) => handleGa4PropertyChange(e.target.value)}
                    disabled={ga4PropertySaveBusy}
                    className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-body-small text-fg min-w-[200px] max-w-full"
                  >
                    <option value="">— Select a property —</option>
                    {ga4Properties.map((p) => (
                      <option key={p.propertyId} value={p.propertyId}>
                        {p.displayName}{p.accountDisplayName ? ` (${p.accountDisplayName})` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {ga4PropertySaveBusy && <span className="text-body-small text-fg-muted">Saving…</span>}
              </div>
              {ga4PropertiesError && (
                <p className="text-body-small text-state-danger">{ga4PropertiesError}</p>
              )}
              {!ga4PropertiesLoading && !ga4PropertiesError && ga4Properties.length === 0 && (
                <p className="text-body-small text-fg-muted">No GA4 properties in this account. Add a GA4 property in Google Analytics or choose an account that has access to one.</p>
              )}
            </div>
          ) : (
            <a href={connectGoogleHref} className="inline-flex items-center justify-center rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
              Connect Google
            </a>
          )}
        </CardSection>

        <CardSection title="Brand system">
          <p className="text-body-small text-text-secondary mb-4">
            Diagnostic panel: token registry and downstream readiness. Click &quot;Why?&quot; to see why each item is in its state and what to configure next.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4">
            <ReadinessRow label="Color system" level={diagnostics.color.level} reason={diagnostics.color.reason} suggestion={diagnostics.color.suggestion} />
            <ReadinessRow label="Typography" level={diagnostics.typography.level} reason={diagnostics.typography.reason} suggestion={diagnostics.typography.suggestion} />
            <ReadinessRow label="Deck readiness" level={diagnostics.deck.level} reason={diagnostics.deck.reason} missing={diagnostics.deck.missing.length ? diagnostics.deck.missing : undefined} />
            <ReadinessRow label="Report readiness" level={diagnostics.report.level} reason={diagnostics.report.reason} missing={diagnostics.report.missing.length ? diagnostics.report.missing : undefined} />
            <ReadinessRow label="Email readiness" level={diagnostics.email.level} reason={diagnostics.email.reason} missing={diagnostics.email.missing.length ? diagnostics.email.missing : undefined} />
          </div>
          <div className="flex flex-wrap gap-4 text-body-small text-text-muted border-t border-border pt-4">
            <span>Last updated: {brand.updated_at ? new Date(brand.updated_at).toLocaleDateString() : "—"}</span>
            <span>Source: manual</span>
            <span>Provenance: who changed and when — coming when audit is available</span>
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
            {((dt.sitemap_url ?? dt.brand_sitemap_url ?? dt.email_sitemap_url) || (dt.social_media?.length > 0) || (dt.contact_info?.length > 0) || identity.contact_email || (dt.asset_urls?.length > 0) || (dt.footer_urls && typeof dt.footer_urls === "object" && !Array.isArray(dt.footer_urls) && Object.keys(dt.footer_urls).length > 0)) && (
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

                {dt.footer_urls && typeof dt.footer_urls === "object" && !Array.isArray(dt.footer_urls) && Object.keys(dt.footer_urls).length > 0 && (
                  <div className="rounded-lg border border-border bg-fg-muted/5 p-4 sm:col-span-2">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">Footer & page links</h4>
                    <p className="text-body-small text-fg-muted mb-3">Tokenized: terms of service, privacy, contact, support, and category links. Edit in Brand Edit → Footer & page links.</p>
                    <ul className="space-y-2 max-h-48 overflow-y-auto">
                      {Object.entries(dt.footer_urls as Record<string, string>).map(([key, url]) => (
                        <li key={key} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-body-small font-mono text-fg-muted shrink-0">{key}</span>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-body text-brand-600 hover:underline break-all min-w-0">
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
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
            Scale (50–900) is canonical; role aliases point into the scale. Labels show where colors are used downstream (CTA, headings, charts).
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Scale (50–900)</h4>
              <div className="flex flex-wrap gap-4">
                {Object.entries(brandScale)
                  .sort(sortScale)
                  .map(([shade, hex]) => (
                    <ColorSwatch key={shade} hex={hex} label={shade} large usage={PALETTE_ROLE_USAGE[shade]} />
                  ))}
                {Object.keys(brandScale).length === 0 && (
                  <p className="text-body-small text-text-muted">No scale keys. Add in Edit → Design tokens (advanced).</p>
                )}
              </div>
            </div>
            {Object.keys(brandRoles).length > 0 && (
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Role aliases (primary, primary_dark, accent…)</h4>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(brandRoles)
                    .sort(sortScale)
                    .map(([role, hex]) => (
                      <ColorSwatch key={role} hex={hex} label={role} large usage={PALETTE_ROLE_USAGE[role]} />
                    ))}
                </div>
              </div>
            )}
            {typeof dt.heading_highlight_color === "string" && dt.heading_highlight_color.trim() && (
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Title highlight (H1/H2)</h4>
                <div className="flex flex-wrap gap-4">
                  <ColorSwatch hex={dt.heading_highlight_color.trim()} label="title highlight" large usage="Design touch on titles (not links); alternative: bold a keyword" />
                </div>
              </div>
            )}
            {Array.isArray(dt.gradients) && dt.gradients.length > 0 && (
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Gradients (container backgrounds)</h4>
                <div className="flex flex-wrap gap-4">
                  {dt.gradients.map((g: { name?: string; type?: string; stops?: string[] }, i: number) => {
                    const stops = Array.isArray(g?.stops) ? g.stops.filter((s: unknown) => typeof s === "string") as string[] : [];
                    if (stops.length < 2) return null;
                    const css = `linear-gradient(135deg, ${stops.join(", ")})`;
                    const name = typeof g.name === "string" && g.name.trim() ? g.name.trim() : `Gradient ${i + 1}`;
                    return (
                      <div key={i} className="flex flex-col items-center gap-1.5">
                        <span className="rounded border border-border h-12 w-20" style={{ background: css }} />
                        <span className="text-[10px] text-text-secondary">{name}</span>
                        <span className="text-[9px] font-mono text-fg-muted max-w-[120px] truncate" title={css}>{stops.join(" → ")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
            Three layers: families, scale (with actual size/line-height), and weights. Specimens and in-context sample show the system in use.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">1. Families</h4>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-body-small">
                <div><dt className="text-fg-muted">Heading</dt><dd className="font-medium" style={{ fontFamily: typography.fontHeadings }}>{typography.fontHeadings}</dd></div>
                <div><dt className="text-fg-muted">Body</dt><dd className="font-medium" style={{ fontFamily: typography.fontBody }}>{typography.fontBody}</dd></div>
                <div><dt className="text-fg-muted">Mono</dt><dd className="font-medium font-mono">{typography.fontMono}</dd></div>
              </dl>
            </div>
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">2. Scale (size / weight / line-height)</h4>
              <div className="rounded border border-border overflow-hidden">
                <table className="w-full text-body-small">
                  <thead className="bg-fg-muted/10">
                    <tr>
                      <th className="text-left p-2 font-medium text-fg-muted">Role</th>
                      <th className="text-left p-2 font-medium text-fg-muted">Size</th>
                      <th className="text-left p-2 font-medium text-fg-muted">Weight</th>
                      <th className="text-left p-2 font-medium text-fg-muted">Line height</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).filter((h) => typography.heading[h]).map((h) => {
                      const spec = typography.heading[h];
                      if (!spec) return null;
                      return (
                        <tr key={h} className="border-t border-border">
                          <td className="p-2 font-mono">{h}</td>
                          <td className="p-2">{spec.size}</td>
                          <td className="p-2">{spec.weight}</td>
                          <td className="p-2">{spec.lineHeight}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border">
                      <td className="p-2 font-mono">body</td>
                      <td className="p-2">{typography.body.default.size}</td>
                      <td className="p-2">{typography.body.default.weight}</td>
                      <td className="p-2">{typography.body.default.lineHeight}</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="p-2 font-mono">caption</td>
                      <td className="p-2">{typography.caption.size}</td>
                      <td className="p-2">{typography.caption.weight}</td>
                      <td className="p-2">{typography.caption.lineHeight}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">3. Weights</h4>
              <div className="flex flex-wrap gap-4">
                {Object.entries(typography.fontWeight).map(([name, w]) => (
                  <span key={name} className="text-body-small" style={{ fontWeight: w }}>
                    {name} ({w})
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Specimens & in-context</h4>
              <p className="text-body-small text-text-secondary mb-3">
                Rendered with the same scale as the table above (size / weight / line-height). Root font-size is 16px so rem values match. Headings use the brand primary; body uses neutral.
              </p>
              <div
                className="space-y-3 rounded-lg border border-border bg-white p-4 shadow-sm"
                style={{ fontSize: "16px" }}
              >
                {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((h) => {
                  const spec = typography.heading[h];
                  if (!spec) return null;
                  const headingColor = palette.brand["700"] ?? palette.brand["600"] ?? palette.brand["500"] ?? palette.brand.primary ?? "#0f172a";
                  return (
                    <div key={h} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="text-fg-muted shrink-0 font-mono text-xs" style={{ width: "2.5rem" }}>{h}</span>
                      <span className="text-fg-muted shrink-0 text-xs font-normal" style={{ width: "10rem" }}>
                        {spec.size} · {spec.weight} · {spec.lineHeight}
                      </span>
                      <span
                        style={{
                          fontSize: spec.size,
                          fontWeight: spec.weight,
                          lineHeight: spec.lineHeight,
                          fontFamily: typography.fontHeadings,
                          color: headingColor,
                        }}
                      >
                        {brand.name}
                      </span>
                    </div>
                  );
                })}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
                    <span className="text-fg-muted shrink-0 font-mono text-xs" style={{ width: "2.5rem" }}>body</span>
                    <span className="text-fg-muted shrink-0 text-xs font-normal" style={{ width: "10rem" }}>
                      {typography.body.default.size} · {typography.body.default.weight} · {typography.body.default.lineHeight}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: typography.body.default.size,
                      fontWeight: typography.body.default.weight,
                      lineHeight: typography.body.default.lineHeight,
                      fontFamily: typography.fontBody,
                      color: palette.neutral["700"] ?? palette.neutral["900"] ?? "#334155",
                    }}
                  >
                    The quick brown fox jumps over the lazy dog. This is body copy so you can see how the brand feels in a short paragraph. Used in emails, decks, and reports.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardSection>

        <CardSection title="Preview surfaces">
          <p className="text-body-small text-text-secondary mb-4">
            Mini mockups using this brand&apos;s tokens. How the brand feels when applied to email, deck, report, and product.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <p className="text-xs font-medium uppercase tracking-wider text-fg-muted px-3 py-2 border-b border-border">Email header</p>
              <div
                className="h-24 flex items-center justify-center p-3"
                style={{ backgroundColor: Object.values(brandColors)[0] ?? palette.brand["500"] ?? "#3b82f6" }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="max-h-full w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <span className="text-white/90 font-medium" style={{ fontFamily: typography.fontHeadings }}>{brand.name}</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <p className="text-xs font-medium uppercase tracking-wider text-fg-muted px-3 py-2 border-b border-border">Deck title slide</p>
              <div
                className="h-24 flex items-center justify-center p-3"
                style={{
                  backgroundColor: palette.brand["700"] ?? palette.brand["600"] ?? Object.values(brandColors)[0] ?? "#1e3a8a",
                  color: "rgba(255,255,255,0.95)",
                }}
              >
                <span
                  className="font-bold text-center line-clamp-2"
                  style={{
                    fontFamily: typography.fontHeadings,
                    fontSize: typography.heading?.h2?.size ?? "1.25rem",
                    fontWeight: typography.heading?.h2?.weight ?? 700,
                  }}
                >
                  {brand.name}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <p className="text-xs font-medium uppercase tracking-wider text-fg-muted px-3 py-2 border-b border-border">Report cover</p>
              <div
                className="h-24 flex flex-col justify-end p-3"
                style={{
                  borderBottom: `3px solid ${palette.brand["500"] ?? Object.values(brandColors)[0] ?? "#3b82f6"}`,
                }}
              >
                <span
                  className="font-semibold text-fg"
                  style={{
                    fontFamily: typography.fontHeadings,
                    fontSize: typography.heading?.h3?.size ?? "1.125rem",
                    fontWeight: typography.heading?.h3?.weight ?? 600,
                  }}
                >
                  {brand.name} — Report
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <p className="text-xs font-medium uppercase tracking-wider text-fg-muted px-3 py-2 border-b border-border">Product card</p>
              <div
                className="h-24 flex flex-col justify-between p-3"
                style={{
                  borderLeft: `4px solid ${palette.brand["500"] ?? Object.values(brandColors)[0] ?? "#3b82f6"}`,
                }}
              >
                <span
                  className="font-semibold text-fg line-clamp-1"
                  style={{
                    fontFamily: typography.fontHeadings,
                    fontSize: typography.heading?.h4?.size ?? "1rem",
                    fontWeight: typography.heading?.h4?.weight ?? 600,
                  }}
                >
                  Product name
                </span>
                <span
                  className="text-fg-muted line-clamp-1"
                  style={{
                    fontSize: typography.body.default.size,
                    fontFamily: typography.fontBody,
                  }}
                >
                  Short description
                </span>
              </div>
            </div>
          </div>
        </CardSection>

        <CardSection title="Resolved tokens">
          <p className="text-body-small text-text-secondary mb-4">
            Debugging surface for the design token pipeline. <strong>Explicit</strong> = set on this brand. <strong>Default</strong> = inherited from system; configure in Edit to override. <strong>Missing</strong> = not set and no fallback—downstream may skip or use a safe default. When you see a value from default, you know what to configure next.
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
            System integration map: actual relationships and counts. Use the links to navigate to campaigns, runs, and templates that use this brand.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            {usage && (
              <>
                <a href="/initiatives" className="rounded-lg border border-border bg-fg-muted/5 p-3 hover:bg-fg-muted/10 transition-colors block">
                  <span className="text-2xl font-semibold text-brand-600">{usage.initiatives_count}</span>
                  <p className="text-body-small text-fg-muted">Initiatives (campaigns)</p>
                </a>
                <a href="/runs" className="rounded-lg border border-border bg-fg-muted/5 p-3 hover:bg-fg-muted/10 transition-colors block">
                  <span className="text-2xl font-semibold text-brand-600">{usage.runs_count}</span>
                  <p className="text-body-small text-fg-muted">Runs</p>
                </a>
                <div className="rounded-lg border border-border bg-fg-muted/5 p-3">
                  <span className="text-body font-medium text-fg">
                    {usage.last_run_at ? new Date(usage.last_run_at).toLocaleDateString() : "—"}
                  </span>
                  <p className="text-body-small text-fg-muted">Last run</p>
                </div>
                <a href="/document-templates" className="rounded-lg border border-border bg-fg-muted/5 p-3 hover:bg-fg-muted/10 transition-colors block">
                  <span className="text-2xl font-semibold text-brand-600">{usage.document_templates_count + usage.email_templates_count}</span>
                  <p className="text-body-small text-fg-muted">Templates linked</p>
                </a>
              </>
            )}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li>
              <a href="/document-templates" className="text-body font-medium text-brand-600 hover:underline">
                {usage ? `${usage.email_templates_count} email templates` : "Email templates"}
              </a>
              <span className="text-body-small text-fg-muted ml-1">— link to this brand</span>
            </li>
            <li>
              <a href="/document-templates" className="text-body font-medium text-brand-600 hover:underline">
                {usage ? `${usage.document_templates_count} document templates` : "Document templates"}
              </a>
              <span className="text-body-small text-fg-muted ml-1">— decks, reports</span>
            </li>
            <li>
              <a href="/email-marketing" className="text-body font-medium text-brand-600 hover:underline">Email Design Generator
              </a>
              <span className="text-body-small text-fg-muted ml-1">— runs, generate</span>
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
          {(embeddings?.items?.length ?? 0) === 0 && (
            <p className="mt-2 text-body-small text-fg-muted rounded-lg border border-border bg-fg-muted/5 p-3">
              <strong>Next step:</strong> Embeddings help the AI match brand tone and imagery. Add content (taglines, mission, copy samples) in Manage so generation stays on-brand.
            </p>
          )}
        </CardSection>

        <CardSection title="Brand Assets">
          <div className="flex flex-wrap gap-4">
            {(assets?.items ?? []).length === 0 ? (
              <>
                <p className="text-sm text-text-secondary">No assets uploaded.</p>
                <p className="w-full mt-2 text-body-small text-fg-muted rounded-lg border border-border bg-fg-muted/5 p-3">
                  <strong>Next step:</strong> Add product shots or lifestyle photos so emails and content can use on-brand imagery. Upload in Edit → Asset URLs or via brand assets.
                </p>
              </>
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
