"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, Button, LoadingSkeleton, Checkbox } from "@/components/ui";
import { useSitemapProducts, useBrandProfile } from "@/hooks/use-api";
import { updateBrandProfile } from "@/lib/api";

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

type ProductItem = { src: string; title: string; product_url: string };

export default function EmailMarketingNewProductsPage() {
  const router = useRouter();
  const state = getWizardState();
  const brandId = state.brand_profile_id as string | undefined;
  const { data: brand } = useBrandProfile(brandId ?? null);

  const [sitemapUrl, setSitemapUrl] = useState("");
  const [sitemapType, setSitemapType] = useState("ecommerce");
  const [items, setItems] = useState<ProductItem[]>([]);
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const fetchProducts = useSitemapProducts();
  const hasPrefilled = useRef<string | null>(null);

  // Prefill from brand tokens
  useEffect(() => {
    if (!brandId || !brand?.design_tokens || typeof brand.design_tokens !== "object") return;
    if (hasPrefilled.current === brandId) return;
    hasPrefilled.current = brandId;
    const dt = brand.design_tokens as Record<string, unknown>;
    const rawUrl =
      dt.sitemap_url ?? dt.brand_sitemap_url ?? (dt as Record<string, unknown>).email_sitemap_url;
    const rawType =
      dt.sitemap_type ?? dt.brand_sitemap_type ?? (dt as Record<string, unknown>).email_sitemap_type;
    const url = typeof rawUrl === "string" ? rawUrl : "";
    const sitemapTypeVal = typeof rawType === "string" ? rawType : "ecommerce";
    if (url) setSitemapUrl(url);
    if (sitemapTypeVal) setSitemapType(sitemapTypeVal);
  }, [brandId, brand?.design_tokens, brand?.id]);

  const handleFetch = async (append = false) => {
    if (!sitemapUrl.trim()) return;
    const page = append ? Math.floor(items.length / PAGE_SIZE) + 1 : 1;
    try {
      const res = await fetchProducts.mutateAsync({
        sitemap_url: sitemapUrl.trim(),
        sitemap_type: sitemapType,
        page,
        limit: PAGE_SIZE,
      });
      const newItems = res.items ?? [];
      if (append) {
        setItems((prev) => [...prev, ...newItems]);
      } else {
        setItems(newItems);
        setSelected(new Set());
        setTotalAvailable(typeof res.total === "number" ? res.total : null);
      }
      setHasMore(!!res.has_more || newItems.length >= PAGE_SIZE);
    } catch (_e) {
      if (!append) {
        setItems([]);
        setTotalAvailable(null);
      }
      setHasMore(false);
    }
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      filteredIndices.forEach((i) => next.add(i));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const filteredIndices = useMemo(() => {
    if (!search.trim()) return items.map((_, i) => i);
    const q = search.trim().toLowerCase();
    return items.map((p, i) => (p.title?.toLowerCase().includes(q) || p.product_url?.toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0);
  }, [items, search]);

  const handleNext = async () => {
    const products = Array.from(selected).map((i) => items[i]);
    setWizardState({
      sitemap_url: sitemapUrl,
      sitemap_type: sitemapType,
      products,
    });
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
        // non-blocking
      } finally {
        setSaving(false);
      }
    }
    router.push("/email-marketing/new/template");
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Products"
          description="Enter your sitemap URL, fetch products, then select the ones to feature in the email."
        />

        {/* Fetch bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
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
          </select>
          <Button
            variant="primary"
            disabled={fetchProducts.isPending || !sitemapUrl.trim()}
            onClick={() => handleFetch(false)}
          >
            {fetchProducts.isPending ? "Fetching…" : "Fetch products"}
          </Button>
        </div>

        {fetchProducts.isPending && items.length === 0 && (
          <LoadingSkeleton className="h-48 rounded-lg" />
        )}

        {items.length > 0 && (
          <>
            {/* Toolbar: search + select all / clear + count */}
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-[200px] max-w-sm rounded-md border border-border bg-bg px-3 py-2 text-sm placeholder:text-fg-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <Button variant="secondary" size="sm" onClick={selectAllVisible}>
                Select all visible
              </Button>
              <Button variant="secondary" size="sm" onClick={clearSelection}>
                Clear selection
              </Button>
              <span className="text-body-small text-fg-muted">
                {totalAvailable != null
                  ? `${totalAvailable} product${totalAvailable === 1 ? "" : "s"} available`
                  : `${items.length} loaded`}
                {totalAvailable != null && ` · ${items.length} on this page`}
                {` · ${selected.size} selected`}
                {search.trim() && ` (${filteredIndices.length} match)`}
              </span>
            </div>

            {/* Scrollable product list */}
            <div
              className="rounded-lg border border-border bg-card overflow-hidden"
              style={{ minHeight: 320, maxHeight: "60vh" }}
            >
              <div className="overflow-y-auto p-2" style={{ maxHeight: "calc(60vh - 8px)" }}>
                <ul className="divide-y divide-border">
                  {filteredIndices.length === 0 ? (
                    <li className="px-4 py-8 text-center text-body-small text-fg-muted">
                      {search.trim() ? "No products match your search." : "No products."}
                    </li>
                  ) : (
                    filteredIndices.map((idx) => {
                      const p = items[idx];
                      const isSelected = selected.has(idx);
                      return (
                        <li key={idx}>
                          <label
                            className={`flex cursor-pointer items-center gap-4 px-4 py-3 transition hover:bg-fg-muted/5 ${
                              isSelected ? "bg-brand-50" : ""
                            }`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onChange={() => toggle(idx)}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 cursor-pointer"
                            />
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-fg-muted/10">
                              {p.src ? (
                                <img
                                  src={p.src}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-fg-muted text-xs">
                                  No image
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-fg">
                                {p.title || "Untitled product"}
                              </span>
                              {p.product_url && (
                                <span className="block truncate text-body-small text-fg-muted">
                                  {p.product_url}
                                </span>
                              )}
                            </div>
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>

            {hasMore && (
              <Button
                variant="secondary"
                disabled={fetchProducts.isPending}
                onClick={() => handleFetch(true)}
              >
                {fetchProducts.isPending ? "Loading…" : "Load more products"}
              </Button>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={items.length === 0 || saving}
          >
            {saving ? "Saving…" : "Next: Template"}
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/email-marketing/new/brand">Back</Link>
          </Button>
        </div>
      </Stack>
    </PageFrame>
  );
}
