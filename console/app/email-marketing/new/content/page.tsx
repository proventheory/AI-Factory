"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PageFrame,
  Stack,
  PageHeader,
  Button,
  LoadingSkeleton,
  Checkbox,
  ScrollArea,
} from "@/components/ui";
import {
  useSitemapProducts,
  useProductsFromUrl,
  useBrandProfile,
  useEmailTemplate,
} from "@/hooks/use-api";
import { updateBrandProfile, pexelsSearch, copyCampaignImageToCdn } from "@/lib/api";
import { readDesignTokensFromBrand } from "../../../brands/token-helpers";

const WIZARD_KEY = "email_marketing_wizard";
const PAGE_SIZE = 24;

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

function isCdnUrl(url: string): boolean {
  return /supabase\.co\/storage\/v1\/object\/public\/upload\//.test(url);
}

type ProductItem = { src: string; title: string; product_url: string };

type ProductsCache = {
  items: ProductItem[];
  totalAvailable: number | null;
  hasMore: boolean;
  sitemap_url: string;
  sitemap_type: string;
};

function migrateLegacyCache(state: Record<string, unknown>): Record<string, ProductsCache> | undefined {
  const byBrand = state.products_cache_by_brand as Record<string, ProductsCache> | undefined;
  if (byBrand && typeof byBrand === "object") return byBrand;
  const legacy = state.products_cache as ProductsCache | undefined;
  const legacyBrandId = state.wizard_sitemap_brand_id as string | undefined;
  if (legacy && Array.isArray(legacy.items) && legacyBrandId) return { [legacyBrandId]: legacy };
  return undefined;
}

function getProductsCacheForBrand(brandId: string | undefined): ProductsCache | null {
  if (!brandId) return null;
  const state = getWizardState();
  const byBrand = (state.products_cache_by_brand ?? migrateLegacyCache(state)) as Record<string, ProductsCache> | undefined;
  const cache = byBrand?.[brandId];
  return cache && Array.isArray(cache.items) ? cache : null;
}

function normalizeSitemapUrl(url: string): string {
  return (url || "").trim().replace(/\/+$/, "");
}

function setProductsCache(cache: ProductsCache, brandId: string) {
  if (!brandId) return;
  const state = getWizardState();
  const byBrand = (migrateLegacyCache(state) ?? state.products_cache_by_brand ?? {}) as Record<string, ProductsCache>;
  setWizardState({ products_cache_by_brand: { ...byBrand, [brandId]: cache } });
}

type PexelsPhoto = {
  id: number;
  src: { original: string; medium: string; large: string };
  alt: string;
  photographer: string;
};

export default function EmailMarketingNewContentPage() {
  const router = useRouter();
  // Wizard state is in sessionStorage; first render can be SSR where window is undefined, so we sync after mount so template/brand load and limits apply
  const [wizardBrandId, setWizardBrandId] = useState<string | null>(null);
  const [wizardTemplateId, setWizardTemplateId] = useState<string | null>(null);
  useEffect(() => {
    const s = getWizardState();
    setWizardBrandId((s.brand_profile_id as string) ?? null);
    setWizardTemplateId((s.template_id as string) ?? null);
    const storedImages = s.selected_images as string[] | undefined;
    if (Array.isArray(storedImages) && storedImages.length > 0) setSelectedUrls(storedImages);
  }, []);
  const brandId = wizardBrandId ?? undefined;
  const templateId = wizardTemplateId ?? undefined;
  const state = getWizardState();
  const { data: brand } = useBrandProfile(brandId ?? null);
  const { data: template, isLoading: templateLoading } = useEmailTemplate(templateId ?? null);
  const imageSlots = template?.image_slots ?? 0;
  const productSlots = template?.product_slots ?? 0;

  // Products state
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [sitemapType, setSitemapType] = useState("ecommerce");
  const [items, setItems] = useState<ProductItem[]>([]);
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const fetchProducts = useSitemapProducts();
  const fetchProductsFromUrl = useProductsFromUrl();
  const hasLoadedForBrand = useRef<string | null>(null);

  // Images state (initial from wizard; may be overwritten in useEffect when we sync from sessionStorage)
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [pexelsQuery, setPexelsQuery] = useState("nature");
  const [pexelsPhotos, setPexelsPhotos] = useState<PexelsPhoto[]>([]);
  const [pexelsLoading, setPexelsLoading] = useState(false);
  const [pexelsError, setPexelsError] = useState<string | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);

  const brandAssetUrls =
    brand?.design_tokens && typeof brand.design_tokens === "object"
      ? (readDesignTokensFromBrand(brand.design_tokens as Record<string, unknown>).assetUrls as string[])
      : [];
  const galleryUrls = brandAssetUrls.filter((u) => u?.trim());

  // When template loads with slot limits, trim any over-selection (e.g. user selected before template loaded)
  useEffect(() => {
    if (productSlots > 0) {
      setSelected((prev) => {
        if (prev.size <= productSlots) return prev;
        return new Set(Array.from(prev).slice(0, productSlots));
      });
    }
    if (imageSlots > 0) {
      setSelectedUrls((prev) => {
        if (prev.length <= imageSlots) return prev;
        return prev.slice(0, imageSlots);
      });
    }
  }, [productSlots, imageSlots]);

  // Load products from cache or brand
  useEffect(() => {
    if (!brandId) return;
    const cache = getProductsCacheForBrand(brandId);
    if (cache && cache.items.length > 0) {
      setSitemapUrl(cache.sitemap_url || "");
      setSitemapType(cache.sitemap_type || "ecommerce");
      setItems(cache.items);
      setTotalAvailable(cache.totalAvailable);
      setHasMore(cache.hasMore);
      setSelected(new Set());
      hasLoadedForBrand.current = brandId;
      return;
    }
    if (!brand?.design_tokens || typeof brand.design_tokens !== "object") return;
    if (hasLoadedForBrand.current === brandId) return;
    const dt = brand.design_tokens as Record<string, unknown>;
    const rawUrl = dt.sitemap_url ?? dt.brand_sitemap_url ?? (dt as Record<string, unknown>).email_sitemap_url;
    const rawType = dt.sitemap_type ?? dt.brand_sitemap_type ?? (dt as Record<string, unknown>).email_sitemap_type;
    setSitemapUrl(typeof rawUrl === "string" ? rawUrl : "");
    setSitemapType(typeof rawType === "string" ? rawType : "ecommerce");
    setItems([]);
    setTotalAvailable(null);
    setHasMore(false);
    setSelected(new Set());
    hasLoadedForBrand.current = brandId;
  }, [brandId, brand?.design_tokens, brand?.id]);

  const handleFetch = async (append = false) => {
    const url = sitemapUrl.trim();
    if (!url) return;
    const normalizedUrl = normalizeSitemapUrl(url);
    const isJson = sitemapType === "shopify_json";
    try {
      const res = isJson
        ? await fetchProductsFromUrl.mutateAsync({ url, type: "shopify_json", limit: PAGE_SIZE })
        : await fetchProducts.mutateAsync({
            sitemap_url: url,
            sitemap_type: sitemapType,
            page: append ? Math.floor(items.length / PAGE_SIZE) + 1 : 1,
            limit: PAGE_SIZE,
          });
      const newItems = res.items ?? [];
      const total = typeof res.total === "number" ? res.total : null;
      const more = !!res.has_more || newItems.length >= PAGE_SIZE;
      const cachePayload = { sitemap_url: normalizedUrl, sitemap_type: sitemapType };
      if (append) {
        const combined = [...items, ...newItems];
        setItems(combined);
        if (brandId) setProductsCache({ items: combined, totalAvailable: total ?? combined.length, hasMore: more, ...cachePayload }, brandId);
      } else {
        setItems(newItems);
        setSelected(new Set());
        setTotalAvailable(total);
        if (brandId) setProductsCache({ items: newItems, totalAvailable: total ?? null, hasMore: more, ...cachePayload }, brandId);
      }
      setHasMore(more);
      setWizardState({ sitemap_url: normalizedUrl, sitemap_type: sitemapType });
    } catch (_e) {
      if (!append && brandId) {
        setItems([]);
        setTotalAvailable(null);
        setProductsCache({ items: [], totalAvailable: null, hasMore: false, sitemap_url: normalizedUrl, sitemap_type: sitemapType }, brandId);
      }
      setHasMore(false);
    }
  };

  const maxProducts = productSlots > 0 ? productSlots : undefined;

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (maxProducts == null || next.size < maxProducts) next.add(i);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const limit = maxProducts != null ? maxProducts - next.size : filteredIndices.length;
      filteredIndices.slice(0, limit).forEach((i) => next.add(i));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const filteredIndices = useMemo(() => {
    if (!search.trim()) return items.map((_, i) => i);
    const q = search.trim().toLowerCase();
    return items.map((p, i) => (p.title?.toLowerCase().includes(q) || p.product_url?.toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0);
  }, [items, search]);

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

  const maxImages = imageSlots > 0 ? imageSlots : undefined;

  const addSelectedImage = (url: string) => {
    if (!url.trim() || selectedUrls.includes(url)) return;
    if (maxImages != null && selectedUrls.length >= maxImages) return;
    setSelectedUrls((prev) => [...prev, url]);
  };

  const removeSelectedImage = (url: string) => {
    setSelectedUrls((prev) => prev.filter((u) => u !== url));
  };

  const handleNext = async () => {
    setNextError(null);
    const products = Array.from(selected).map((i) => items[i]);
    setWizardState({ sitemap_url: sitemapUrl, sitemap_type: sitemapType, products });

    if (brandId) {
      setSaving(true);
      try {
        await updateBrandProfile(brandId, {
          design_tokens: {
            sitemap_url: sitemapUrl,
            sitemap_type: sitemapType,
            brand_sitemap_url: sitemapUrl,
            brand_sitemap_type: sitemapType,
            products,
          },
        } as Record<string, unknown>);
      } catch (_e) {
        /* non-blocking */
      } finally {
        setSaving(false);
      }
    }

    const toCopy = selectedUrls.filter((u) => !isCdnUrl(u));
    const cdnAlready = selectedUrls.filter(isCdnUrl);
    if (toCopy.length === 0) {
      setWizardState({ selected_images: cdnAlready });
      router.push("/email-marketing/new/generate");
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
        setNextError(`Some images could not be copied to CDN (${newCdnUrls.length}/${toCopy.length} succeeded). Your selection was saved.`);
      }
      router.push("/email-marketing/new/generate");
    } catch (e) {
      setWizardState({ selected_images: selectedUrls });
      setNextError(e instanceof Error ? e.message : "Failed to copy images to CDN. Your selection was saved; you can continue.");
      router.push("/email-marketing/new/generate");
    } finally {
      setNextLoading(false);
    }
  };

  const slotHint =
    templateLoading && templateId
      ? "Loading template… You'll see \"Select X products\" and \"Select X image(s)\" below once loaded."
      : !templateId
        ? "Select a template in the previous step (Template) to see how many products and images to choose. Limits will apply once a template is selected."
        : imageSlots > 0 || productSlots > 0
          ? `This template needs ${imageSlots} image${imageSlots !== 1 ? "s" : ""} and ${productSlots} product${productSlots !== 1 ? "s" : ""}. Select exactly that many below — limits are enforced.`
          : "Select products and images for your email. The first image is used as the hero; the rest fill content slots.";

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Products & images"
          description={slotHint}
        />

        {/* Products section */}
        <section className="rounded-xl border-2 border-border bg-card p-5">
          <h2 className="text-body font-semibold text-fg mb-1">
            {productSlots > 0 ? `Select ${productSlots} product${productSlots !== 1 ? "s" : ""}` : "Products"}
          </h2>
          {productSlots > 0 && (
            <p className="text-body-small text-fg-muted mb-3">This template needs {productSlots} product{productSlots !== 1 ? "s" : ""}. You cannot select more.</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="url"
              placeholder="https://example.com/sitemap_products.xml"
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              className="min-w-[240px] flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm placeholder:text-fg-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <select
              value={sitemapType}
              onChange={(e) => setSitemapType(e.target.value)}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
            >
              <option value="drupal">Drupal</option>
              <option value="ecommerce">Ecommerce</option>
              <option value="bigcommerce">BigCommerce</option>
              <option value="shopify">Shopify</option>
              <option value="shopify_json">Shopify (JSON)</option>
            </select>
            <Button
              variant="primary"
              disabled={(sitemapType === "shopify_json" ? fetchProductsFromUrl.isPending : fetchProducts.isPending) || !sitemapUrl.trim()}
              onClick={() => handleFetch(false)}
            >
              {sitemapType === "shopify_json" ? (fetchProductsFromUrl.isPending ? "Fetching…" : "Fetch products") : (fetchProducts.isPending ? "Fetching…" : "Fetch products")}
            </Button>
          </div>
          {(fetchProducts.isPending || fetchProductsFromUrl.isPending) && items.length === 0 && (
            <LoadingSkeleton className="h-32 rounded-lg" />
          )}
          {items.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <input
                  type="search"
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-[180px] max-w-sm rounded-md border border-border bg-bg px-3 py-2 text-sm"
                />
                <Button variant="secondary" size="sm" onClick={selectAllVisible} disabled={maxProducts != null && selected.size >= maxProducts}>
                  Select all visible
                </Button>
                <Button variant="secondary" size="sm" onClick={clearSelection}>Clear</Button>
                <span className="text-body-small text-fg-muted">
                  {items.length} loaded · {selected.size}
                  {maxProducts != null ? ` / ${maxProducts}` : ""} selected
                </span>
              </div>
              <ScrollArea className="h-[240px] rounded-lg border border-border">
                <ul className="divide-y divide-border p-2">
                  {filteredIndices.length === 0 ? (
                    <li className="px-4 py-6 text-center text-body-small text-fg-muted">{search.trim() ? "No match." : "No products."}</li>
                  ) : (
                    filteredIndices.slice(0, 50).map((idx) => {
                      const p = items[idx];
                      const isSelectedItem = selected.has(idx);
                      const atProductLimit = maxProducts != null && selected.size >= maxProducts && !isSelectedItem;
                      return (
                        <li key={idx}>
                          <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 rounded hover:bg-fg-muted/5 ${isSelectedItem ? "bg-brand-50" : ""} ${atProductLimit ? "opacity-60" : ""}`}>
                            <Checkbox
                              checked={isSelectedItem}
                              onChange={() => toggle(idx)}
                              disabled={atProductLimit}
                              className="shrink-0"
                            />
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-fg-muted/10">
                              {p.src ? <img src={p.src} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-fg-muted text-xs">—</div>}
                            </div>
                            <span className="truncate text-sm font-medium">{p.title || "Untitled"}</span>
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>
              </ScrollArea>
              {hasMore && sitemapType !== "shopify_json" && (
                <Button variant="secondary" size="sm" className="mt-2" disabled={fetchProducts.isPending} onClick={() => handleFetch(true)}>
                  {fetchProducts.isPending ? "Loading…" : "Load more"}
                </Button>
              )}
            </>
          )}
        </section>

        {/* Images section */}
        <section className="rounded-xl border-2 border-border bg-card p-5">
          <h2 className="text-body font-semibold text-fg mb-1">
            {imageSlots > 0 ? `Select ${imageSlots} image${imageSlots !== 1 ? "s" : ""}` : "Images"}
          </h2>
          <p className="text-body-small text-fg-muted mb-3">
            {imageSlots > 0
              ? `This template needs ${imageSlots} image${imageSlots !== 1 ? "s" : ""}. First = hero. You cannot select more. Choose from Pexels or your gallery; they're copied to our CDN.`
              : "First image = hero. Choose from Pexels or your brand gallery; they're copied to our CDN."}
          </p>
          {imageSlots > 0 && selectedUrls.length >= imageSlots && (
            <p className="text-body-small text-brand-600 mb-2">Maximum reached ({selectedUrls.length} / {imageSlots}). Remove one to change selection.</p>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <div className="flex gap-2">
                <input
                  type="search"
                  placeholder="e.g. nature, coffee"
                  value={pexelsQuery}
                  onChange={(e) => setPexelsQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePexelsSearch()}
                  className="flex-1 min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                />
                <Button variant="primary" onClick={handlePexelsSearch} disabled={pexelsLoading}>{pexelsLoading ? "Searching…" : "Search"}</Button>
              </div>
              {pexelsError && <p className="text-body-small text-state-danger">{pexelsError}</p>}
              <ScrollArea className="h-[200px] rounded-lg border border-border bg-fg-muted/5">
                <div className="p-2 grid grid-cols-4 gap-2">
                  {pexelsPhotos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addSelectedImage(p.src.medium || p.src.original)}
                      className="aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <img src={p.src.medium || p.src.original} alt={p.alt || ""} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </ScrollArea>
              {galleryUrls.length > 0 && (
                <div>
                  <p className="text-body-small font-medium text-fg mb-1">Your gallery</p>
                  <ScrollArea className="h-[120px] rounded-lg border border-border bg-fg-muted/5">
                    <div className="p-2 grid grid-cols-4 gap-2">
                      {galleryUrls.slice(0, 12).map((url, i) => (
                        <button
                          key={`${i}-${url}`}
                          type="button"
                          onClick={() => addSelectedImage(url)}
                          className="aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-brand-500"
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
            <div>
              <p className="text-body-small font-medium text-fg mb-1">
                Selected ({selectedUrls.length}{maxImages != null ? ` / ${maxImages}` : ""})
              </p>
              <ScrollArea className="h-[280px] rounded-lg border border-border bg-fg-muted/5">
                <ul className="p-2 space-y-2">
                  {selectedUrls.map((url, index) => (
                    <li key={url} className="flex items-center gap-2 rounded border border-border bg-card p-2">
                      <img src={url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' fill='%23ccc'%3E%3Crect width='40' height='40'/%3E%3C/svg%3E"; }} />
                      {index === 0 && <span className="text-[10px] font-medium text-brand-600">Hero</span>}
                      <span className="min-w-0 flex-1 truncate text-body-small text-fg-muted">{url.slice(0, 30)}…</span>
                      <Button variant="secondary" size="sm" onClick={() => removeSelectedImage(url)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          </div>
        </section>

        {nextError && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/20 px-4 py-3 text-body-small text-state-danger">{nextError}</div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={handleNext} disabled={nextLoading || saving}>
            {nextLoading ? "Copying images…" : saving ? "Saving…" : "Next: Render preview"}
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/email-marketing/new/template">Back</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
