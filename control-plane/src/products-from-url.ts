/**
 * Products from URL: support both XML sitemap (delegate to sitemap-products) and JSON URLs (e.g. Shopify collection).
 * Returns normalized shape { src, title, product_url, description? } per docs/BRAND_EMAIL_FIELD_MAPPING.md.
 */

import axios from "axios";
import { fetchSitemapProducts, type SitemapProduct, type SitemapType } from "./sitemap-products.js";

export type ProductsFromUrlType = "shopify_json" | "sitemap_xml";

export interface ProductsFromUrlOptions {
  url: string;
  type: ProductsFromUrlType;
  /** Required when type is sitemap_xml. Ignored for shopify_json. */
  sitemap_type?: SitemapType;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Strip HTML tags for description. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize Shopify-style JSON to SitemapProduct[].
 * Supports: { products: [...] } or array at root; each product: title/name, image.src or images[0].src or featured_image.src, url or handle (with base), body/body_html/description.
 */
function normalizeShopifyJson(data: unknown, baseUrl: string): SitemapProduct[] {
  let list: unknown[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).products)) {
    list = (data as Record<string, unknown>).products as unknown[];
  } else if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).items)) {
    list = (data as Record<string, unknown>).items as unknown[];
  }
  const base = baseUrl.replace(/\/?$/, "");
  const out: SitemapProduct[] = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const obj = p as Record<string, unknown>;
    const title =
      (typeof obj.title === "string" ? obj.title : null) ??
      (typeof obj.name === "string" ? obj.name : null) ??
      "";
    let productUrl =
      (typeof obj.url === "string" ? obj.url : null) ??
      (typeof obj.handle === "string" ? `${base}/products/${(obj.handle as string).replace(/^\//, "")}` : null);
    if (!productUrl && typeof obj.handle === "string") {
      productUrl = `${base}/products/${(obj.handle as string).replace(/^\//, "")}`;
    }
    if (!title || !productUrl) continue;

    let src = "";
    const img = obj.image as Record<string, unknown> | undefined;
    const feat = obj.featured_image as Record<string, unknown> | undefined;
    const imgs = obj.images as unknown[] | undefined;
    if (img && typeof img.src === "string") src = img.src;
    else if (img && typeof img.url === "string") src = img.url;
    else if (feat && typeof feat.src === "string") src = feat.src;
    else if (Array.isArray(imgs) && imgs[0] && typeof imgs[0] === "object" && (imgs[0] as Record<string, unknown>).src)
      src = String((imgs[0] as Record<string, unknown>).src);
    if (!src) continue;

    let description: string | undefined;
    const body = obj.body ?? obj.body_html ?? obj.description;
    if (typeof body === "string" && body.trim()) description = stripHtml(body).slice(0, 500);

    out.push({ src, title, product_url: productUrl, description });
  }
  return out;
}

/**
 * Fetch products from a URL. For sitemap_xml delegates to fetchSitemapProducts; for shopify_json fetches JSON and normalizes.
 */
export async function productsFromUrl(
  options: ProductsFromUrlOptions
): Promise<{ items: SitemapProduct[]; has_more: boolean; total?: number }> {
  const { url, type, sitemap_type, limit = DEFAULT_LIMIT } = options;
  if (!url || !type) {
    throw new Error("url and type are required");
  }
  if (!isValidUrl(url)) {
    throw new Error("url must be http or https");
  }

  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  if (type === "sitemap_xml") {
    const st = sitemap_type ?? "ecommerce";
    return fetchSitemapProducts({
      sitemap_url: url,
      sitemap_type: st,
      page: 1,
      limit: safeLimit,
    });
  }

  if (type === "shopify_json") {
    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 3,
      validateStatus: (status) => status === 200,
      responseType: "json",
    });
    const baseUrl = new URL(url).origin;
    const items = normalizeShopifyJson(response.data, baseUrl).slice(0, safeLimit);
    return {
      items,
      has_more: items.length >= safeLimit,
      total: items.length,
    };
  }

  throw new Error(`type must be shopify_json or sitemap_xml, got: ${type}`);
}
