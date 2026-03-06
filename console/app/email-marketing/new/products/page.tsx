"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, Button, LoadingSkeleton } from "@/components/ui";
import { useSitemapProducts, useBrandProfile } from "@/hooks/use-api";
import { updateBrandProfile } from "@/lib/api";

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

type ProductItem = { src: string; title: string; product_url: string };

export default function EmailMarketingNewProductsPage() {
  const router = useRouter();
  const state = getWizardState();
  const brandId = state.brand_profile_id as string | undefined;
  const { data: brand } = useBrandProfile(brandId ?? null);

  const [sitemapUrl, setSitemapUrl] = useState("");
  const [sitemapType, setSitemapType] = useState("ecommerce");
  const [items, setItems] = useState<ProductItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const fetchProducts = useSitemapProducts();
  const hasPrefilled = useRef<string | null>(null);

  // Prefill from brand tokens: canonical sitemap_url/type or email_* (wizard) (once per brand)
  useEffect(() => {
    if (!brandId || !brand?.design_tokens || typeof brand.design_tokens !== "object") return;
    if (hasPrefilled.current === brandId) return;
    hasPrefilled.current = brandId;
    const dt = brand.design_tokens as Record<string, unknown>;
    const url = typeof dt.sitemap_url === "string" ? dt.sitemap_url : (typeof dt.email_sitemap_url === "string" ? dt.email_sitemap_url : "");
    const type = typeof dt.sitemap_type === "string" ? dt.sitemap_type : (typeof dt.email_sitemap_type === "string" ? dt.email_sitemap_type : "ecommerce");
    if (url) setSitemapUrl(url);
    if (type) setSitemapType(type);
  }, [brandId, brand?.design_tokens, brand?.id]);

  const handleFetch = async () => {
    if (!sitemapUrl.trim()) return;
    try {
      const res = await fetchProducts.mutateAsync({
        sitemap_url: sitemapUrl.trim(),
        sitemap_type: sitemapType,
        page: 1,
        limit: 20,
      });
      setItems(res.items ?? []);
      setSelected(new Set());
    } catch (_e) {
      setItems([]);
    }
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

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
            email_sitemap_url: sitemapUrl,
            email_sitemap_type: sitemapType,
            email_products: products,
          },
        } as Record<string, unknown>);
      } catch (_e) {
        // non-blocking: wizard state is already saved
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
          description="Enter sitemap URL and type, then fetch and select products."
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            placeholder="https://example.com/sitemap_products.xml"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="rounded border border-border bg-bg px-3 py-2 text-body-small w-80"
          />
          <select
            value={sitemapType}
            onChange={(e) => setSitemapType(e.target.value)}
            className="rounded border border-border bg-bg px-3 py-2 text-body-small"
          >
            <option value="drupal">drupal</option>
            <option value="ecommerce">ecommerce</option>
            <option value="bigcommerce">bigcommerce</option>
            <option value="shopify">shopify</option>
          </select>
          <Button
            variant="primary"
            disabled={fetchProducts.isPending || !sitemapUrl.trim()}
            onClick={handleFetch}
          >
            {fetchProducts.isPending ? "Fetching…" : "Fetch products"}
          </Button>
        </div>
        {fetchProducts.isPending && <LoadingSkeleton className="h-32 rounded-lg" />}
        {items.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {items.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                className={`flex flex-col rounded-lg border p-2 text-left ${
                  selected.has(i) ? "border-brand-500 bg-brand-50" : "border-border"
                }`}
              >
                {p.src && <img src={p.src} alt="" className="h-24 w-full object-cover rounded" />}
                <span className="text-body-small mt-1 truncate">{p.title || p.product_url}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={handleNext} disabled={items.length === 0 || saving}>
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
