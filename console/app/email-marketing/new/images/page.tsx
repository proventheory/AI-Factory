"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, Button, ScrollArea } from "@/components/ui";
import { useBrandProfile } from "@/hooks/use-api";
import { pexelsSearch, copyCampaignImageToCdn } from "@/lib/api";
import { readDesignTokensFromBrand } from "../../../brands/token-helpers";

const WIZARD_KEY = "email_marketing_wizard";

function getWizardState(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const s = sessionStorage.getItem(WIZARD_KEY);
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function setWizardState(updates: Record<string, unknown>) {
  try {
    const next = { ...getWizardState(), ...updates };
    sessionStorage.setItem(WIZARD_KEY, JSON.stringify(next));
  } catch (_e) {}
}

/** True if URL is already our CDN (Supabase upload bucket). */
function isCdnUrl(url: string): boolean {
  return /supabase\.co\/storage\/v1\/object\/public\/upload\//.test(url);
}

type PexelsPhoto = {
  id: number;
  src: { original: string; medium: string; large: string };
  alt: string;
  photographer: string;
};

export default function EmailMarketingNewImagesPage() {
  const router = useRouter();
  const state = getWizardState();
  const brandId = state.brand_profile_id as string | undefined;
  const { data: brand } = useBrandProfile(brandId ?? null);

  const initialImages = (state.selected_images as string[]) ?? [];
  const [selectedUrls, setSelectedUrls] = useState<string[]>(initialImages);
  const [pexelsQuery, setPexelsQuery] = useState("nature");
  const [pexelsPhotos, setPexelsPhotos] = useState<PexelsPhoto[]>([]);
  const [pexelsLoading, setPexelsLoading] = useState(false);
  const [pexelsError, setPexelsError] = useState<string | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);

  const brandAssetUrls = (brand?.design_tokens && typeof brand.design_tokens === "object"
    ? readDesignTokensFromBrand(brand.design_tokens as Record<string, unknown>).assetUrls
    : []) as string[];
  const galleryUrls = brandAssetUrls.filter((u) => u.trim());

  const handlePexelsSearch = useCallback(async () => {
    setPexelsLoading(true);
    setPexelsError(null);
    try {
      const data = await pexelsSearch({ q: pexelsQuery, per_page: 20, page: 1 });
      setPexelsPhotos(
        (data.photos ?? []).map((p: { id: number; src: { original: string; medium: string; large: string }; alt: string; photographer: string }) => ({
          id: p.id,
          src: p.src,
          alt: p.alt ?? "",
          photographer: p.photographer ?? "",
        }))
      );
    } catch (e) {
      setPexelsError(e instanceof Error ? e.message : "Search failed");
      setPexelsPhotos([]);
    } finally {
      setPexelsLoading(false);
    }
  }, [pexelsQuery]);

  const addSelected = (url: string) => {
    if (!url.trim() || selectedUrls.includes(url)) return;
    setSelectedUrls((prev) => [...prev, url]);
  };

  const removeSelected = (url: string) => {
    setSelectedUrls((prev) => prev.filter((u) => u !== url));
  };

  const handleNext = async () => {
    setNextError(null);
    const toCopy = selectedUrls.filter((u) => !isCdnUrl(u));
    const cdnAlready = selectedUrls.filter(isCdnUrl);
    if (toCopy.length === 0) {
      setWizardState({ selected_images: cdnAlready });
      router.push("/email-marketing/new/template");
      return;
    }
    setNextLoading(true);
    try {
      const results = await Promise.allSettled(toCopy.map((url) => copyCampaignImageToCdn(url)));
      const newCdnUrls: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.cdn_url) newCdnUrls.push(r.value.cdn_url);
      }
      const allCdn = [...cdnAlready, ...newCdnUrls];
      setWizardState({ selected_images: allCdn.length > 0 ? allCdn : selectedUrls });
      if (newCdnUrls.length < toCopy.length) {
        setNextError(`Some images could not be copied to CDN (${newCdnUrls.length}/${toCopy.length} succeeded). Your selection was saved; the runner will use what it can.`);
      }
      router.push("/email-marketing/new/template");
    } catch (e) {
      setWizardState({ selected_images: selectedUrls });
      setNextError(e instanceof Error ? e.message : "Failed to copy images to CDN. Your selection was saved; you can continue.");
      router.push("/email-marketing/new/template");
    } finally {
      setNextLoading(false);
    }
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Images"
          description="Select images from Pexels or your brand gallery. They will be stored on our CDN so your emails always load."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Pexels + Gallery */}
          <div className="space-y-5 lg:col-span-2">
            {/* Pexels card */}
            <div className="rounded-xl border-2 border-border bg-card p-5 shadow-sm">
              <h3 className="text-body font-semibold text-fg mb-4">Pexels</h3>
              <div className="flex gap-3 mb-4">
                <input
                  type="search"
                  placeholder="e.g. nature, coffee, office"
                  value={pexelsQuery}
                  onChange={(e) => setPexelsQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePexelsSearch()}
                  className="flex-1 min-w-0 rounded-lg border-2 border-border bg-bg px-3 py-2.5 text-body text-fg placeholder:text-fg-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  aria-label="Search Pexels"
                />
                <Button variant="primary" onClick={handlePexelsSearch} disabled={pexelsLoading}>
                  {pexelsLoading ? "Searching…" : "Search"}
                </Button>
              </div>
              {pexelsError && (
                <div className="mb-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/20 px-3 py-2 text-body-small text-state-danger">
                  {pexelsError}
                </div>
              )}
              <ScrollArea className="h-[280px] rounded-lg border-2 border-border bg-fg-muted/10">
                <div className="p-3 grid grid-cols-4 gap-2">
                  {pexelsPhotos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addSelected(p.src.medium || p.src.original)}
                      className="relative aspect-square rounded-lg overflow-hidden border-2 border-border bg-fg-muted/10 hover:border-brand-500 hover:ring-2 hover:ring-brand-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                    >
                      <img src={p.src.medium || p.src.original} alt={p.alt || ""} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-body-small text-fg-muted mt-3">
                <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Photos provided by Pexels</a>
              </p>
            </div>

            {/* Gallery card */}
            <div className="rounded-xl border-2 border-border bg-card p-5 shadow-sm">
              <h3 className="text-body font-semibold text-fg mb-4">Your gallery (brand assets)</h3>
              {galleryUrls.length === 0 ? (
                <p className="text-body-small text-fg-muted rounded-lg border border-dashed border-border bg-fg-muted/5 p-4">No images in this brand’s assets. Add URLs or upload in Brand → Edit → Brand Identity → Asset URLs.</p>
              ) : (
                <ScrollArea className="h-[200px] rounded-lg border-2 border-border bg-fg-muted/10">
                  <div className="p-3 grid grid-cols-4 gap-2">
                    {galleryUrls.map((url, i) => (
                      <button
                        key={`${i}-${url}`}
                        type="button"
                        onClick={() => addSelected(url)}
                        className="relative aspect-square rounded-lg overflow-hidden border-2 border-border bg-fg-muted/10 hover:border-brand-500 hover:ring-2 hover:ring-brand-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          {/* Right: Selected */}
          <div className="rounded-xl border-2 border-border bg-card p-5 shadow-sm">
            <h3 className="text-body font-semibold text-fg mb-1">Selected ({selectedUrls.length})</h3>
            <p className="text-body-small text-fg-muted mb-4">These will be copied to our CDN when you go Next so emails never lose images.</p>
            <ScrollArea className="h-[380px] rounded-lg border-2 border-border bg-fg-muted/10">
              <ul className="p-3 space-y-2">
                {selectedUrls.map((url) => (
                  <li key={url} className="flex items-center gap-3 rounded-lg border-2 border-border bg-card p-2.5">
                    <img src={url} alt="" className="h-12 w-12 rounded-md object-cover shrink-0 border border-border" onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' fill='%23ccc'%3E%3Crect width='48' height='48'/%3E%3C/svg%3E"; }} />
                    <span className="min-w-0 flex-1 truncate text-body-small text-fg-muted">{url.slice(0, 40)}…</span>
                    <Button variant="secondary" size="sm" onClick={() => removeSelected(url)}>Remove</Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>

        {nextError && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/20 px-4 py-3 text-body-small text-state-danger">
            {nextError}
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Button variant="primary" onClick={handleNext} disabled={nextLoading}>
            {nextLoading ? "Copying to CDN…" : "Next: Template"}
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/email-marketing/new/products">Back</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
