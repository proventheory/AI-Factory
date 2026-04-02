/**
 * WooCommerce / WordPress → Shopify Admin REST (products, collections, customers, redirects, discounts, pages).
 * Requires Shopify scopes: write_products, read_products (incl. product metafields for Yoast/Rank Math SEO),
 * write_customers, read_customers, write_content, read_content, write_online_store_navigation (redirects),
 * write_discounts (coupons), as applicable.
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
  body?: unknown,
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
    ...(body != null && method !== "GET" ? { body: JSON.stringify(body) } : {}),
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

async function wooFetchJson(
  wcBase: string,
  authHeader: string,
  path: string,
  query: string,
): Promise<{ data: unknown[]; total: number }> {
  const url = `${wcBase.replace(/\/$/, "")}/${path.replace(/^\//, "")}?${query}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`WooCommerce ${path} ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as unknown[];
  const totalHdr = res.headers.get("x-wp-total");
  const total = totalHdr ? Math.max(0, parseInt(totalHdr, 10)) : data.length;
  return { data: Array.isArray(data) ? data : [], total };
}

/** Single product (for full `meta_data` when list response is trimmed). */
async function wooFetchProduct(
  wcBase: string,
  authHeader: string,
  productId: string,
): Promise<Record<string, unknown> | null> {
  const url = `${wcBase.replace(/\/$/, "")}/products/${encodeURIComponent(productId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, unknown>;
  return j && typeof j === "object" ? j : null;
}

function metaValueToPlainString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

/** First non-empty value among keys, in priority order (Yoast before Rank Math before AIOSEO). */
function wooMetaFirstNonEmpty(o: Record<string, unknown>, keysInPriorityOrder: string[]): string | null {
  const meta = o.meta_data;
  if (!Array.isArray(meta)) return null;
  for (const key of keysInPriorityOrder) {
    for (const row of meta) {
      const m = row as Record<string, unknown>;
      const k = typeof m.key === "string" ? m.key : "";
      if (k !== key) continue;
      const s = metaValueToPlainString(m.value);
      if (s) return s;
    }
  }
  return null;
}

function sanitizeSeoPlaintext(raw: string): string {
  const t = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

function truncateUtf16(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Yoast SEO / Rank Math product meta from Woo `meta_data` (REST).
 * Empty Yoast title → omit (Shopify falls back to product title).
 */
const SEO_TITLE_META_KEYS = ["_yoast_wpseo_title", "rank_math_title", "_aioseo_title"];
const SEO_DESC_META_KEYS = ["_yoast_wpseo_metadesc", "rank_math_description", "_aioseo_description"];

function extractWooProductSeo(o: Record<string, unknown>): { titleTag?: string; descriptionTag?: string } {
  const titleRaw = wooMetaFirstNonEmpty(o, SEO_TITLE_META_KEYS);
  const descRaw = wooMetaFirstNonEmpty(o, SEO_DESC_META_KEYS);

  const titleTag = titleRaw ? truncateUtf16(sanitizeSeoPlaintext(titleRaw), 70) : undefined;
  const descriptionTag = descRaw ? truncateUtf16(sanitizeSeoPlaintext(descRaw), 320) : undefined;

  return {
    ...(titleTag ? { titleTag } : {}),
    ...(descriptionTag ? { descriptionTag } : {}),
  };
}

async function extractWooProductSeoWithFallback(
  wcBase: string,
  authHeader: string,
  productId: string,
  o: Record<string, unknown>,
): Promise<{ titleTag?: string; descriptionTag?: string }> {
  let seo = extractWooProductSeo(o);
  if (seo.titleTag || seo.descriptionTag) return seo;
  const full = await wooFetchProduct(wcBase, authHeader, productId);
  if (full) seo = extractWooProductSeo(full);
  return seo;
}

/** WooCommerce `tags: [{ id, name, slug }]` → Shopify comma-separated `tags` (commas inside names flattened). */
function wooProductTagsToShopifyCsv(o: Record<string, unknown>): string | undefined {
  const raw = o.tags;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const names = new Set<string>();
  for (const t of raw) {
    if (typeof t === "string") {
      const safe = t.replace(/,/g, " ").replace(/\s+/g, " ").trim();
      if (safe) names.add(safe);
      continue;
    }
    const row = t as Record<string, unknown>;
    const name =
      typeof row.name === "string"
        ? row.name.trim()
        : typeof row.slug === "string"
          ? row.slug.replace(/-/g, " ").trim()
          : "";
    if (!name) continue;
    const safe = name.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (safe) names.add(safe);
  }
  if (names.size === 0) return undefined;
  return [...names].join(", ");
}

/** List responses sometimes omit tag objects; single-product GET includes them. */
async function ensureWooProductTagsOnDoc(
  wcBase: string,
  authHeader: string,
  productId: string,
  o: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tags = o.tags;
  if (Array.isArray(tags) && tags.length > 0) return o;
  const full = await wooFetchProduct(wcBase, authHeader, productId);
  if (full && Array.isArray(full.tags) && full.tags.length > 0) return full;
  return o;
}

async function updateShopifyProductTags(
  shopDomain: string,
  accessToken: string,
  productId: number,
  tagsCsv: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await shopifyAdminJson(
    shopDomain,
    accessToken,
    "PUT",
    `/products/${productId}.json`,
    { product: { id: productId, tags: tagsCsv } },
  );
  if (!r.ok) {
    return { ok: false, message: `tags ${r.status}: ${r.text.slice(0, 200)}` };
  }
  return { ok: true };
}

/**
 * Shopify “Search engine listing” uses global metafields `title_tag` + `description_tag` (single_line_text_field).
 * @see https://shopify.dev/tutorials/manage-seo-data-with-admin-api
 */
async function upsertProductGlobalSeoMetafields(
  shopDomain: string,
  accessToken: string,
  productId: number,
  titleTag: string | undefined,
  descriptionTag: string | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const pairs: { key: string; value: string }[] = [];
  if (titleTag?.trim()) pairs.push({ key: "title_tag", value: titleTag.trim() });
  if (descriptionTag?.trim()) pairs.push({ key: "description_tag", value: descriptionTag.trim() });
  if (pairs.length === 0) return { ok: true };

  const listRes = await shopifyAdminJson<{ metafields?: { id?: number; namespace?: string; key?: string }[] }>(
    shopDomain,
    accessToken,
    "GET",
    `/products/${productId}/metafields.json?limit=250`,
  );
  if (!listRes.ok) {
    return { ok: false, message: `list metafields ${listRes.status}: ${listRes.text.slice(0, 200)}` };
  }
  const byKey = new Map<string, number>();
  for (const m of listRes.data?.metafields ?? []) {
    if (m.namespace === "global" && typeof m.key === "string" && typeof m.id === "number") {
      byKey.set(m.key, m.id);
    }
  }

  for (const { key, value } of pairs) {
    const mid = byKey.get(key);
    if (mid != null) {
      const r = await shopifyAdminJson(
        shopDomain,
        accessToken,
        "PUT",
        `/metafields/${mid}.json`,
        { metafield: { id: mid, value, type: "single_line_text_field" } },
      );
      if (!r.ok) {
        return { ok: false, message: `${key} PUT ${r.status}: ${r.text.slice(0, 200)}` };
      }
    } else {
      const r = await shopifyAdminJson(shopDomain, accessToken, "POST", `/products/${productId}/metafields.json`, {
        metafield: {
          namespace: "global",
          key,
          value,
          type: "single_line_text_field",
        },
      });
      if (!r.ok) {
        return { ok: false, message: `${key} POST ${r.status}: ${r.text.slice(0, 200)}` };
      }
    }
  }
  return { ok: true };
}

export type EtlRow = {
  source_id: string;
  title?: string;
  shopify_id?: string;
  shopify_admin_url?: string;
  note?: string;
  error?: string;
};

export type EtlSummary = { created: number; skipped: number; failed: number };

export type EtlResult = { rows: EtlRow[]; summary: EtlSummary; truncated: boolean; hint?: string };

type ProgressFn = (p: {
  current: number;
  total: number;
  source_id?: string;
  created: number;
  skipped: number;
  failed: number;
}) => void;

function adminProductUrl(shopDomain: string, id: string | number): string {
  const shop = shopHost(shopDomain);
  return `https://${shop}/admin/products/${id}`;
}

function adminCollectionUrl(shopDomain: string, id: string | number): string {
  const shop = shopHost(shopDomain);
  return `https://${shop}/admin/collections/${id}`;
}

function adminCustomerUrl(shopDomain: string, id: string | number): string {
  const shop = shopHost(shopDomain);
  return `https://${shop}/admin/customers/${id}`;
}

function adminPageUrl(shopDomain: string, id: string | number): string {
  const shop = shopHost(shopDomain);
  return `https://${shop}/admin/pages/${id}`;
}

async function shopifyProductIdByHandle(
  shopDomain: string,
  accessToken: string,
  handle: string,
): Promise<number | null> {
  const h = handle.trim().toLowerCase();
  if (!h) return null;
  const r = await shopifyAdminJson<{ products?: { id?: number }[] }>(
    shopDomain,
    accessToken,
    "GET",
    `/products.json?handle=${encodeURIComponent(h)}`,
  );
  const id = r.data?.products?.[0]?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

async function shopifyCollectionIdByHandle(
  shopDomain: string,
  accessToken: string,
  handle: string,
): Promise<number | null> {
  const h = handle.trim().toLowerCase();
  if (!h) return null;
  for (const path of [
    `/custom_collections.json?handle=${encodeURIComponent(h)}`,
    `/smart_collections.json?handle=${encodeURIComponent(h)}`,
  ]) {
    const r = await shopifyAdminJson<{ custom_collections?: { id?: number }[]; smart_collections?: { id?: number }[] }>(
      shopDomain,
      accessToken,
      "GET",
      path,
    );
    const cc = r.data?.custom_collections?.[0]?.id;
    const sc = r.data?.smart_collections?.[0]?.id;
    const id = typeof cc === "number" ? cc : typeof sc === "number" ? sc : null;
    if (id != null) return id;
  }
  return null;
}

async function shopifyCustomerIdByEmail(
  shopDomain: string,
  accessToken: string,
  email: string,
): Promise<number | null> {
  const q = email.trim().toLowerCase();
  if (!q) return null;
  const r = await shopifyAdminJson<{ customers?: { id?: number }[] }>(
    shopDomain,
    accessToken,
    "GET",
    `/customers.json?email=${encodeURIComponent(q)}`,
  );
  const id = r.data?.customers?.[0]?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

async function shopifyPageIdByHandle(
  shopDomain: string,
  accessToken: string,
  handle: string,
): Promise<number | null> {
  const h = handle.trim().toLowerCase();
  if (!h) return null;
  const r = await shopifyAdminJson<{ pages?: { id?: number }[] }>(
    shopDomain,
    accessToken,
    "GET",
    `/pages.json?handle=${encodeURIComponent(h)}`,
  );
  const id = r.data?.pages?.[0]?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function wooProductHandle(o: Record<string, unknown>): string {
  const slug = typeof o.slug === "string" ? o.slug.trim().toLowerCase().replace(/\.html?$/i, "") : "";
  if (slug) return slug;
  return `product-${o.id}`;
}

function shopifyStatusFromWoo(status: string): "active" | "draft" {
  const s = (status || "").toLowerCase();
  if (s === "publish" || s === "published") return "active";
  return "draft";
}

function priceString(v: unknown): string {
  if (v == null) return "0.00";
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0) return "0.00";
  return n.toFixed(2);
}

type WooVariation = Record<string, unknown>;

async function fetchWooVariations(
  wcBase: string,
  authHeader: string,
  productId: string,
): Promise<WooVariation[]> {
  const out: WooVariation[] = [];
  let page = 1;
  const perPage = 100;
  let totalPages = 1;
  do {
    const { data, total } = await wooFetchJson(
      wcBase,
      authHeader,
      `products/${productId}/variations`,
      `page=${page}&per_page=${perPage}`,
    );
    out.push(...(data as WooVariation[]));
    totalPages = Math.max(1, Math.ceil(total / perPage));
    page++;
  } while (page <= totalPages && page < 50);
  return out;
}

function buildShopifyProductBodyFromWoo(
  o: Record<string, unknown>,
  variations: WooVariation[],
): Record<string, unknown> | { error: string } {
  const type = typeof o.type === "string" ? o.type : "simple";
  if (type === "grouped") return { error: "Woo grouped products are not supported in this importer." };
  if (type === "external") return { error: "Woo external products are not supported in this importer." };

  const title = typeof o.name === "string" ? o.name : "Product";
  const bodyHtml =
    typeof o.description === "string" && o.description.trim()
      ? o.description
      : typeof o.short_description === "string"
        ? o.short_description
        : "";
  const handle = wooProductHandle(o);
  const status = shopifyStatusFromWoo(typeof o.status === "string" ? o.status : "");
  const vendor = typeof (o as { vendor?: string }).vendor === "string" ? (o as { vendor: string }).vendor : "";
  const productType =
    typeof (o as { categories?: { name?: string }[] }).categories?.[0]?.name === "string"
      ? String((o as { categories: { name: string }[] }).categories[0].name)
      : "";

  const imagesRaw = Array.isArray(o.images) ? (o.images as Record<string, unknown>[]) : [];
  const images = imagesRaw
    .map((im) => (typeof im.src === "string" ? { src: im.src } : null))
    .filter((x): x is { src: string } => Boolean(x))
    .slice(0, 10);

  const tagsCsv = wooProductTagsToShopifyCsv(o);

  if (type === "variable" && variations.length > 0) {
    const optionNames = new Set<string>();
    for (const v of variations) {
      const attrs = Array.isArray(v.attributes) ? (v.attributes as { name?: string; option?: string }[]) : [];
      for (const a of attrs) {
        const n = typeof a.name === "string" ? a.name.trim() : "";
        if (n) optionNames.add(n);
      }
    }
    const optList = [...optionNames].slice(0, 3);
    if (optList.length === 0) {
      optList.push("Option");
    }

    const shopifyVariants: Record<string, unknown>[] = [];
    for (const v of variations) {
      const attrs = Array.isArray(v.attributes) ? (v.attributes as { name?: string; option?: string }[]) : [];
      const map = new Map<string, string>();
      for (const a of attrs) {
        const n = typeof a.name === "string" ? a.name.trim() : "";
        const op = typeof a.option === "string" ? a.option.trim() : "";
        if (n) map.set(n.toLowerCase(), op || "Default");
      }
      const variant: Record<string, unknown> = {
        price: priceString(v.regular_price ?? v.price),
        sku: typeof v.sku === "string" ? v.sku : undefined,
      };
      for (let i = 0; i < optList.length; i++) {
        const key = `option${i + 1}`;
        const nm = optList[i]!.toLowerCase();
        variant[key] = map.get(nm) ?? "Default";
      }
      shopifyVariants.push(variant);
    }

    const options = optList.map((name) => ({ name }));

    return {
      product: {
        title,
        body_html: bodyHtml || "<p></p>",
        vendor: vendor || undefined,
        product_type: productType || undefined,
        handle,
        status,
        variants: shopifyVariants,
        options,
        ...(images.length ? { images } : {}),
        ...(tagsCsv ? { tags: tagsCsv } : {}),
      },
    };
  }

  const sku = typeof o.sku === "string" ? o.sku : "";
  const variant: Record<string, unknown> = {
    price: priceString(o.regular_price ?? o.price),
    ...(sku ? { sku } : {}),
  };

  return {
    product: {
      title,
      body_html: bodyHtml || "<p></p>",
      vendor: vendor || undefined,
      product_type: productType || undefined,
      handle,
      status,
      variants: [variant],
      ...(images.length ? { images } : {}),
      ...(tagsCsv ? { tags: tagsCsv } : {}),
    },
  };
}

export async function migrateWooProductsToShopify(opts: {
  server: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
  shopDomain: string;
  accessToken: string;
  excludedIds: Set<string>;
  maxItems: number;
  skipIfExistsInShopify: boolean;
  onProgress?: ProgressFn;
}): Promise<EtlResult> {
  const wcBase = `${opts.server.replace(/\/$/, "")}/wp-json/wc/v3`;
  const auth = Buffer.from(`${opts.wooConsumerKey}:${opts.wooConsumerSecret}`).toString("base64");
  const authHeader = `Basic ${auth}`;

  const rows: EtlRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let truncated = false;
  let wpTotal = 0;
  let page = 1;
  const perPage = 50;

  while (rows.length < opts.maxItems) {
    const { data, total } = await wooFetchJson(
      wcBase,
      authHeader,
      "products",
      `page=${page}&per_page=${perPage}&status=any`,
    );
    if (page === 1) wpTotal = total;
    if (data.length === 0) break;

    for (const row of data) {
      if (rows.length >= opts.maxItems) {
        truncated = true;
        break;
      }
      const o = row as Record<string, unknown>;
      const id = o.id != null ? String(o.id) : "";
      if (!id || opts.excludedIds.has(id)) continue;

      const title = typeof o.name === "string" ? o.name : id;
      const handle = wooProductHandle(o);

      if (opts.skipIfExistsInShopify) {
        const existing = await shopifyProductIdByHandle(opts.shopDomain, opts.accessToken, handle);
        if (existing != null) {
          const seo = await extractWooProductSeoWithFallback(wcBase, authHeader, id, o);
          const oTags = await ensureWooProductTagsOnDoc(wcBase, authHeader, id, o);
          const tagsCsv = wooProductTagsToShopifyCsv(oTags);
          const noteParts: string[] = [];
          if (seo.titleTag || seo.descriptionTag) {
            const seoRes = await upsertProductGlobalSeoMetafields(
              opts.shopDomain,
              opts.accessToken,
              existing,
              seo.titleTag,
              seo.descriptionTag,
            );
            noteParts.push(
              seoRes.ok
                ? "SEO metafields from Woo (Yoast / Rank Math / AIOSEO)."
                : `SEO update failed: ${seoRes.message}`,
            );
          }
          if (tagsCsv) {
            const tagRes = await updateShopifyProductTags(opts.shopDomain, opts.accessToken, existing, tagsCsv);
            noteParts.push(tagRes.ok ? "Tags synced from Woo." : `Tags: ${tagRes.message}`);
          }
          const note =
            noteParts.length > 0 ? `Already existed — ${noteParts.join(" ")}` : "Already existed in Shopify (skipped)";
          rows.push({
            source_id: id,
            title,
            shopify_id: String(existing),
            shopify_admin_url: adminProductUrl(opts.shopDomain, existing),
            note,
          });
          skipped++;
          opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
          continue;
        }
      }

      let variations: WooVariation[] = [];
      if (typeof o.type === "string" && o.type === "variable" && Array.isArray(o.variations) && (o.variations as unknown[]).length > 0) {
        try {
          variations = await fetchWooVariations(wcBase, authHeader, id);
        } catch {
          variations = [];
        }
      }

      const oForBuild = await ensureWooProductTagsOnDoc(wcBase, authHeader, id, o);
      const body = buildShopifyProductBodyFromWoo(oForBuild, variations);
      if ("error" in body) {
        rows.push({ source_id: id, title, error: (body as { error: string }).error });
        failed++;
        opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
        continue;
      }

      const r = await shopifyAdminJson<{ product?: { id?: number } }>(
        opts.shopDomain,
        opts.accessToken,
        "POST",
        "/products.json",
        body,
      );
      if (!r.ok || !r.data?.product?.id) {
        const err = r.data && typeof (r.data as { errors?: unknown }).errors !== "undefined"
          ? JSON.stringify((r.data as { errors: unknown }).errors).slice(0, 400)
          : r.text.slice(0, 400);
        rows.push({ source_id: id, title, error: `Shopify ${r.status}: ${err}` });
        failed++;
      } else {
        const pid = r.data.product.id;
        const seo = await extractWooProductSeoWithFallback(wcBase, authHeader, id, o);
        let note: string | undefined;
        if (seo.titleTag || seo.descriptionTag) {
          const seoRes = await upsertProductGlobalSeoMetafields(
            opts.shopDomain,
            opts.accessToken,
            pid,
            seo.titleTag,
            seo.descriptionTag,
          );
          note = seoRes.ok
            ? "SEO title/description from Woo (Yoast / Rank Math / AIOSEO) set on global metafields."
            : `Created; SEO metafields warning: ${seoRes.message}`;
        }
        rows.push({
          source_id: id,
          title,
          shopify_id: String(pid),
          shopify_admin_url: adminProductUrl(opts.shopDomain, pid),
          ...(note ? { note } : {}),
        });
        created++;
      }
      opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
    }

    if (rows.length >= opts.maxItems) break;
    if (data.length < perPage) break;
    page++;
  }

  return {
    rows,
    summary: { created, skipped, failed },
    truncated,
    hint: truncated ? `Stopped at ${opts.maxItems} products (batch cap). Run again to continue.` : undefined,
  };
}

export async function migrateWooCategoriesToShopify(opts: {
  server: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
  shopDomain: string;
  accessToken: string;
  excludedIds: Set<string>;
  maxItems: number;
  skipIfExistsInShopify: boolean;
  onProgress?: ProgressFn;
}): Promise<EtlResult> {
  const wcBase = `${opts.server.replace(/\/$/, "")}/wp-json/wc/v3`;
  const auth = Buffer.from(`${opts.wooConsumerKey}:${opts.wooConsumerSecret}`).toString("base64");
  const authHeader = `Basic ${auth}`;

  const rows: EtlRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let truncated = false;
  let wpTotal = 0;
  let page = 1;
  const perPage = 100;

  while (rows.length < opts.maxItems) {
    const { data, total } = await wooFetchJson(
      wcBase,
      authHeader,
      "products/categories",
      `page=${page}&per_page=${perPage}`,
    );
    if (page === 1) wpTotal = total;
    if (data.length === 0) break;

    for (const row of data) {
      if (rows.length >= opts.maxItems) {
        truncated = true;
        break;
      }
      const o = row as Record<string, unknown>;
      const id = o.id != null ? String(o.id) : "";
      if (!id || opts.excludedIds.has(id)) continue;

      const title = typeof o.name === "string" ? o.name : id;
      const slug = typeof o.slug === "string" ? o.slug.trim().toLowerCase() : `category-${id}`;
      const desc = typeof o.description === "string" ? o.description : "";

      if (opts.skipIfExistsInShopify) {
        const existing = await shopifyCollectionIdByHandle(opts.shopDomain, opts.accessToken, slug);
        if (existing != null) {
          rows.push({
            source_id: id,
            title,
            shopify_id: String(existing),
            shopify_admin_url: adminCollectionUrl(opts.shopDomain, existing),
            note: "Collection with this handle already exists (skipped)",
          });
          skipped++;
          opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
          continue;
        }
      }

      const r = await shopifyAdminJson<{ custom_collection?: { id?: number } }>(
        opts.shopDomain,
        opts.accessToken,
        "POST",
        "/custom_collections.json",
        {
          custom_collection: {
            title,
            handle: slug,
            body_html: desc || undefined,
            published: true,
          },
        },
      );

      if (!r.ok || !r.data?.custom_collection?.id) {
        const err = r.text.slice(0, 400);
        rows.push({ source_id: id, title, error: `Shopify ${r.status}: ${err}` });
        failed++;
      } else {
        const cid = r.data.custom_collection.id;
        rows.push({
          source_id: id,
          title,
          shopify_id: String(cid),
          shopify_admin_url: adminCollectionUrl(opts.shopDomain, cid),
        });
        created++;
      }
      opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
    }

    if (rows.length >= opts.maxItems) break;
    if (data.length < perPage) break;
    page++;
  }

  return {
    rows,
    summary: { created, skipped, failed },
    truncated,
    hint: truncated ? `Stopped at ${opts.maxItems} categories (batch cap). Run again to continue.` : undefined,
  };
}

export async function migrateWooCustomersToShopify(opts: {
  server: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
  shopDomain: string;
  accessToken: string;
  excludedIds: Set<string>;
  maxItems: number;
  skipIfExistsInShopify: boolean;
  onProgress?: ProgressFn;
}): Promise<EtlResult> {
  const wcBase = `${opts.server.replace(/\/$/, "")}/wp-json/wc/v3`;
  const auth = Buffer.from(`${opts.wooConsumerKey}:${opts.wooConsumerSecret}`).toString("base64");
  const authHeader = `Basic ${auth}`;

  const rows: EtlRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let truncated = false;
  let wpTotal = 0;
  let page = 1;
  const perPage = 100;

  while (rows.length < opts.maxItems) {
    const { data, total } = await wooFetchJson(wcBase, authHeader, "customers", `page=${page}&per_page=${perPage}`);
    if (page === 1) wpTotal = total;
    if (data.length === 0) break;

    for (const row of data) {
      if (rows.length >= opts.maxItems) {
        truncated = true;
        break;
      }
      const o = row as Record<string, unknown>;
      const id = o.id != null ? String(o.id) : "";
      if (!id || opts.excludedIds.has(id)) continue;

      const email = typeof o.email === "string" ? o.email.trim() : "";
      if (!email) {
        rows.push({ source_id: id, title: `Customer ${id}`, error: "No email on Woo customer — Shopify requires email." });
        failed++;
        opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
        continue;
      }

      const billing = (o.billing as Record<string, unknown>) || {};
      const first = typeof billing.first_name === "string" ? billing.first_name : "";
      const last = typeof billing.last_name === "string" ? billing.last_name : "";

      if (opts.skipIfExistsInShopify) {
        const existing = await shopifyCustomerIdByEmail(opts.shopDomain, opts.accessToken, email);
        if (existing != null) {
          rows.push({
            source_id: id,
            title: email,
            shopify_id: String(existing),
            shopify_admin_url: adminCustomerUrl(opts.shopDomain, existing),
            note: "Customer with this email already exists (skipped)",
          });
          skipped++;
          opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
          continue;
        }
      }

      const r = await shopifyAdminJson<{ customer?: { id?: number } }>(opts.shopDomain, opts.accessToken, "POST", "/customers.json", {
        customer: {
          email,
          first_name: first || undefined,
          last_name: last || undefined,
          verified_email: true,
        },
      });

      if (!r.ok || !r.data?.customer?.id) {
        rows.push({ source_id: id, title: email, error: `Shopify ${r.status}: ${r.text.slice(0, 400)}` });
        failed++;
      } else {
        const cid = r.data.customer.id;
        rows.push({
          source_id: id,
          title: email,
          shopify_id: String(cid),
          shopify_admin_url: adminCustomerUrl(opts.shopDomain, cid),
        });
        created++;
      }
      opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
    }

    if (rows.length >= opts.maxItems) break;
    if (data.length < perPage) break;
    page++;
  }

  return {
    rows,
    summary: { created, skipped, failed },
    truncated,
    hint: truncated ? `Stopped at ${opts.maxItems} customers (batch cap). Run again to continue.` : undefined,
  };
}

/** Path on Shopify store (leading slash) from full URL. */
function pathnameOnly(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const p = u.pathname || "/";
    return p.startsWith("/") ? p : `/${p}`;
  } catch {
    return null;
  }
}

export async function migrateWooPermalinkRedirectsToShopify(opts: {
  server: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
  shopDomain: string;
  accessToken: string;
  excludedIds: Set<string>;
  maxItems: number;
  /** Public Shopify storefront origin e.g. https://example.com — used as redirect target base. */
  targetStoreOrigin: string;
  onProgress?: ProgressFn;
}): Promise<EtlResult> {
  const wcBase = `${opts.server.replace(/\/$/, "")}/wp-json/wc/v3`;
  const auth = Buffer.from(`${opts.wooConsumerKey}:${opts.wooConsumerSecret}`).toString("base64");
  const authHeader = `Basic ${auth}`;
  const base = opts.targetStoreOrigin.replace(/\/$/, "");

  const rows: EtlRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let truncated = false;

  type Queued = { syntheticId: string; title: string; oldUrl: string; targetPath: string };
  const queue: Queued[] = [];

  let page = 1;
  const per = 50;
  let totalEstimate = 0;

  while (queue.length < opts.maxItems) {
    const { data: prods, total: pt } = await wooFetchJson(
      wcBase,
      authHeader,
      "products",
      `page=${page}&per_page=${per}&status=any`,
    );
    const { data: cats, total: ct } = await wooFetchJson(
      wcBase,
      authHeader,
      "products/categories",
      `page=${page}&per_page=${per}`,
    );
    if (page === 1) totalEstimate = pt + ct;

    for (const row of prods) {
      if (queue.length >= opts.maxItems) break;
      const o = row as Record<string, unknown>;
      const id = o.id != null ? String(o.id) : "";
      const permalink = typeof o.permalink === "string" ? o.permalink : "";
      const name = typeof o.name === "string" ? o.name : id;
      const sid = `p:${id}`;
      if (!id || !permalink || opts.excludedIds.has(sid)) continue;
      const path = pathnameOnly(permalink);
      const handle = wooProductHandle(o);
      if (!path) continue;
      queue.push({
        syntheticId: sid,
        title: name,
        oldUrl: permalink,
        targetPath: `${base}/products/${handle}`,
      });
    }
    for (const row of cats) {
      if (queue.length >= opts.maxItems) break;
      const o = row as Record<string, unknown>;
      const id = o.id != null ? String(o.id) : "";
      const slug = typeof o.slug === "string" ? o.slug.trim().toLowerCase() : "";
      const perm = typeof (o as { permalink?: string }).permalink === "string" ? (o as { permalink: string }).permalink : "";
      const href = typeof (o as { link?: string }).link === "string" ? (o as { link: string }).link : "";
      const link =
        perm ||
        href ||
        (slug ? `${opts.server.replace(/\/$/, "")}/product-category/${encodeURIComponent(slug)}/` : "");
      const name = typeof o.name === "string" ? o.name : id;
      const sid = `c:${id}`;
      if (!id || !link || opts.excludedIds.has(sid)) continue;
      const path = pathnameOnly(link);
      if (!path || !slug) continue;
      queue.push({
        syntheticId: sid,
        title: name,
        oldUrl: link,
        targetPath: `${base}/collections/${slug}`,
      });
    }

    if (queue.length >= opts.maxItems) break;
    if (prods.length < per && cats.length < per) break;
    page++;
    if (page > 200) break;
  }

  const toCreate = queue.slice(0, opts.maxItems);
  if (queue.length > toCreate.length) truncated = true;

  for (const item of toCreate) {
    if (rows.length >= opts.maxItems) {
      truncated = true;
      break;
    }
    const fromPath = pathnameOnly(item.oldUrl);
    if (!fromPath) {
      rows.push({ source_id: item.syntheticId, title: item.title, error: "Could not parse source URL path." });
      failed++;
      continue;
    }

    const r = await shopifyAdminJson<{ redirect?: { id?: number } }>(opts.shopDomain, opts.accessToken, "POST", "/redirects.json", {
      redirect: {
        path: fromPath,
        target: item.targetPath,
      },
    });

    if (!r.ok || !r.data?.redirect?.id) {
      rows.push({
        source_id: item.syntheticId,
        title: item.title,
        error: `Shopify ${r.status}: ${r.text.slice(0, 400)}`,
      });
      failed++;
    } else {
      rows.push({
        source_id: item.syntheticId,
        title: item.title,
        shopify_id: String(r.data.redirect.id),
        note: `${fromPath} → ${item.targetPath}`,
      });
      created++;
    }
    opts.onProgress?.({
      current: rows.length,
      total: Math.min(totalEstimate, opts.maxItems),
      source_id: item.syntheticId,
      created,
      skipped,
      failed,
    });
  }

  return {
    rows,
    summary: { created, skipped, failed },
    truncated,
    hint: truncated
      ? `Stopped at ${opts.maxItems} redirects (batch cap). Run again to continue. Paths use your Woo permalinks as Shopify redirect paths—ensure they match URLs shoppers will hit on the Shopify domain after cutover.`
      : "Redirects use Woo pathname as Shopify redirect path and your target store URL for the destination. Confirm paths match your live URL strategy.",
  };
}

export async function migrateWooCouponsToShopify(opts: {
  server: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
  shopDomain: string;
  accessToken: string;
  excludedIds: Set<string>;
  maxItems: number;
  onProgress?: ProgressFn;
}): Promise<EtlResult> {
  const wcBase = `${opts.server.replace(/\/$/, "")}/wp-json/wc/v3`;
  const auth = Buffer.from(`${opts.wooConsumerKey}:${opts.wooConsumerSecret}`).toString("base64");
  const authHeader = `Basic ${auth}`;

  const rows: EtlRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let truncated = false;
  let wpTotal = 0;
  let page = 1;
  const perPage = 100;

  while (rows.length < opts.maxItems) {
    const { data, total } = await wooFetchJson(
      wcBase,
      authHeader,
      "coupons",
      `page=${page}&per_page=${perPage}&status=any`,
    );
    if (page === 1) wpTotal = total;
    if (data.length === 0) break;

    for (const row of data) {
      if (rows.length >= opts.maxItems) {
        truncated = true;
        break;
      }
      const o = row as Record<string, unknown>;
      const id = o.id != null ? String(o.id) : "";
      if (!id || opts.excludedIds.has(id)) continue;

      const code = typeof o.code === "string" ? o.code.trim() : "";
      const title = code || `Coupon ${id}`;
      if (!code) {
        rows.push({ source_id: id, title, error: "Coupon has no code." });
        failed++;
        continue;
      }

      const dtype = typeof o.discount_type === "string" ? o.discount_type : "";
      const amount = typeof o.amount === "string" ? parseFloat(o.amount) : typeof o.amount === "number" ? o.amount : 0;

      let valueType: "percentage" | "fixed_amount";
      let value: string;
      if (dtype === "percent") {
        valueType = "percentage";
        value = `-${Math.min(100, Math.max(0, amount))}`;
      } else if (dtype === "fixed_cart" || dtype === "fixed_product") {
        valueType = "fixed_amount";
        value = `-${Math.max(0, amount).toFixed(2)}`;
      } else {
        rows.push({
          source_id: id,
          title,
          error: `Woo discount_type "${dtype}" not mapped (supported: percent, fixed_cart, fixed_product).`,
        });
        failed++;
        opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
        continue;
      }

      const pr = await shopifyAdminJson<{ price_rule?: { id?: number } }>(
        opts.shopDomain,
        opts.accessToken,
        "POST",
        "/price_rules.json",
        {
          price_rule: {
            title: `Woo ${code}`,
            target_type: "line_item",
            target_selection: "all",
            allocation_method: "across",
            value_type: valueType,
            value,
            customer_selection: "all",
            starts_at: new Date().toISOString(),
            ...(Number(o.usage_limit) === 1 ? { once_per_customer: true } : {}),
          },
        },
      );

      if (!pr.ok || !pr.data?.price_rule?.id) {
        rows.push({ source_id: id, title, error: `Price rule ${pr.status}: ${pr.text.slice(0, 400)}` });
        failed++;
        opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
        continue;
      }

      const prid = pr.data.price_rule.id;
      const dc = await shopifyAdminJson<{ discount_code?: { id?: number } }>(
        opts.shopDomain,
        opts.accessToken,
        "POST",
        `/price_rules/${prid}/discount_codes.json`,
        { discount_code: { code } },
      );

      if (!dc.ok || !dc.data?.discount_code?.id) {
        rows.push({
          source_id: id,
          title,
          error: `Discount code ${dc.status}: ${dc.text.slice(0, 400)}`,
        });
        failed++;
      } else {
        rows.push({
          source_id: id,
          title,
          shopify_id: String(dc.data.discount_code.id),
          note: `price_rule ${prid}, code ${code}`,
        });
        created++;
      }
      opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
    }

    if (rows.length >= opts.maxItems) break;
    if (data.length < perPage) break;
    page++;
  }

  return {
    rows,
    summary: { created, skipped, failed },
    truncated,
    hint: truncated ? `Stopped at ${opts.maxItems} coupons (batch cap). Complex Woo rules (products, categories, BOGO) are not mapped.` : undefined,
  };
}

export async function migrateWordPressPagesToShopify(opts: {
  wpOrigin: string;
  wpAuthHeader: string | null;
  shopDomain: string;
  accessToken: string;
  excludedIds: Set<string>;
  maxItems: number;
  skipIfExistsInShopify: boolean;
  onProgress?: ProgressFn;
}): Promise<EtlResult> {
  const base = opts.wpOrigin.replace(/\/$/, "");
  const useAuth = !!opts.wpAuthHeader;
  const statusQs = useAuth ? "status=any" : "status=publish";

  const rows: EtlRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let truncated = false;
  let wpTotal = 0;
  let page = 1;
  const perPage = 50;

  while (rows.length < opts.maxItems) {
    const url = `${base}/wp-json/wp/v2/pages?${statusQs}&page=${page}&per_page=${perPage}&_fields=id,title,status,slug,link,content`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.wpAuthHeader) headers.Authorization = opts.wpAuthHeader;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`WordPress pages ${r.status}: ${t.slice(0, 200)}`);
    }
    const data = (await r.json()) as unknown[];
    const totalHdr = r.headers.get("x-wp-total");
    if (page === 1) wpTotal = totalHdr ? Math.max(0, parseInt(totalHdr, 10)) : data.length;
    if (data.length === 0) break;

    for (const row of data) {
      if (rows.length >= opts.maxItems) {
        truncated = true;
        break;
      }
      const o = row as Record<string, unknown>;
      const id = o.id != null ? String(o.id) : "";
      if (!id || opts.excludedIds.has(id)) continue;

      const titleObj = o.title as { rendered?: string } | undefined;
      const title =
        typeof titleObj?.rendered === "string"
          ? titleObj.rendered.replace(/<[^>]+>/g, "").trim()
          : String(o.slug ?? id);
      const slug = typeof o.slug === "string" ? o.slug.trim().toLowerCase() : `page-${id}`;
      const contentObj = o.content as { rendered?: string } | undefined;
      const bodyHtml = typeof contentObj?.rendered === "string" ? contentObj.rendered : "<p></p>";
      const published = typeof o.status === "string" && o.status === "publish";

      if (opts.skipIfExistsInShopify) {
        const existing = await shopifyPageIdByHandle(opts.shopDomain, opts.accessToken, slug);
        if (existing != null) {
          rows.push({
            source_id: id,
            title,
            shopify_id: String(existing),
            shopify_admin_url: adminPageUrl(opts.shopDomain, existing),
            note: "Page with this handle already exists (skipped)",
          });
          skipped++;
          opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
          continue;
        }
      }

      const res = await shopifyAdminJson<{ page?: { id?: number } }>(opts.shopDomain, opts.accessToken, "POST", "/pages.json", {
        page: {
          title,
          handle: slug,
          body_html: bodyHtml,
          published,
        },
      });

      if (!res.ok || !res.data?.page?.id) {
        rows.push({ source_id: id, title, error: `Shopify ${res.status}: ${res.text.slice(0, 400)}` });
        failed++;
      } else {
        const pid = res.data.page.id;
        rows.push({
          source_id: id,
          title,
          shopify_id: String(pid),
          shopify_admin_url: adminPageUrl(opts.shopDomain, pid),
        });
        created++;
      }
      opts.onProgress?.({ current: rows.length, total: wpTotal, source_id: id, created, skipped, failed });
    }

    if (rows.length >= opts.maxItems) break;
    if (data.length < perPage) break;
    page++;
  }

  return {
    rows,
    summary: { created, skipped, failed },
    truncated,
    hint: truncated
      ? `Stopped at ${opts.maxItems} pages (batch cap). Run again to continue.`
      : !useAuth
        ? "Only published WordPress pages were imported (no WP application password). Add credentials in the wizard for drafts/private."
        : undefined,
  };
}
