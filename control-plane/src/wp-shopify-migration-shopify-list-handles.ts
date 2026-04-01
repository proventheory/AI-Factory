/**
 * List product / collection handles and blogs from Shopify Admin REST (redirect map helpers).
 */

const SHOPIFY_API_VERSION = "2024-10";

function shopHost(shopDomain: string): string {
  return shopDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function shopifyAdminJson<T>(
  shopDomain: string,
  accessToken: string,
  method: string,
  path: string,
): Promise<{ ok: boolean; status: number; data: T | null; text: string; link: string | null }> {
  const shop = shopHost(shopDomain);
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
  });
  const text = await res.text();
  let data: T | null = null;
  try {
    if (text?.trim()) data = JSON.parse(text) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text, link: res.headers.get("link") };
}

function shopifyRestNextPathFromLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.trim().match(/<([^>]+)>;\s*rel="next"/i) ?? part.trim().match(/<([^>]+)>;\s*rel=next(?:\s|,|$)/i);
    if (!m) continue;
    try {
      const u = new URL(m[1]);
      const marker = `/admin/api/${SHOPIFY_API_VERSION}`;
      const idx = u.pathname.indexOf(marker);
      if (idx < 0) continue;
      return u.pathname.slice(idx + marker.length) + u.search;
    } catch {
      continue;
    }
  }
  return null;
}

const MAX_PAGES = 400;

export async function listShopifyProductHandles(shopDomain: string, accessToken: string): Promise<string[]> {
  const handles = new Set<string>();
  let path: string | null = "/products.json?limit=250&fields=handle";
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const r = await shopifyAdminJson<{ products?: { handle?: string }[] }>(shopDomain, accessToken, "GET", path);
    if (!r.ok) {
      throw new Error(`Shopify products list ${r.status}: ${r.text.slice(0, 280)}`);
    }
    for (const p of r.data?.products ?? []) {
      const h = typeof p.handle === "string" ? p.handle.trim().toLowerCase() : "";
      if (h) handles.add(h);
    }
    path = shopifyRestNextPathFromLink(r.link);
  }
  return [...handles];
}

async function listHandlesFromCollectionEndpoint(
  shopDomain: string,
  accessToken: string,
  firstPath: string,
  arrayKey: "custom_collections" | "smart_collections",
): Promise<string[]> {
  const handles = new Set<string>();
  let path: string | null = firstPath;
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const r = await shopifyAdminJson<Record<string, { handle?: string }[] | undefined>>(
      shopDomain,
      accessToken,
      "GET",
      path,
    );
    if (!r.ok) {
      throw new Error(`Shopify ${arrayKey} list ${r.status}: ${r.text.slice(0, 280)}`);
    }
    const rows = r.data?.[arrayKey] ?? [];
    for (const c of rows) {
      const h = typeof c.handle === "string" ? c.handle.trim().toLowerCase() : "";
      if (h) handles.add(h);
    }
    path = shopifyRestNextPathFromLink(r.link);
  }
  return [...handles];
}

/** Handles for storefront /collections/{handle} (custom + smart). */
export async function listShopifyCollectionHandles(shopDomain: string, accessToken: string): Promise<string[]> {
  const custom = await listHandlesFromCollectionEndpoint(
    shopDomain,
    accessToken,
    "/custom_collections.json?limit=250&fields=handle",
    "custom_collections",
  );
  const smart = await listHandlesFromCollectionEndpoint(
    shopDomain,
    accessToken,
    "/smart_collections.json?limit=250&fields=handle",
    "smart_collections",
  );
  return [...new Set([...custom, ...smart])];
}

export type ShopifyBlogSummary = { id: number; handle: string; title: string };

/** Blogs on the store (for /blogs/{handle}/… redirect targets without re-running WP migration). */
export async function listShopifyBlogs(shopDomain: string, accessToken: string): Promise<ShopifyBlogSummary[]> {
  const out: ShopifyBlogSummary[] = [];
  let path: string | null = "/blogs.json?limit=250";
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const r = await shopifyAdminJson<{ blogs?: { id?: number; handle?: string; title?: string }[] }>(
      shopDomain,
      accessToken,
      "GET",
      path,
    );
    if (!r.ok) {
      throw new Error(`Shopify blogs list ${r.status}: ${r.text.slice(0, 280)}`);
    }
    for (const b of r.data?.blogs ?? []) {
      const id = typeof b.id === "number" && Number.isFinite(b.id) ? b.id : Number(b?.id);
      const handle = typeof b.handle === "string" ? b.handle.trim() : "";
      if (!handle || !Number.isFinite(id)) continue;
      const title = typeof b.title === "string" ? b.title.trim() : "";
      out.push({ id, handle, title });
    }
    path = shopifyRestNextPathFromLink(r.link);
  }
  return out;
}
