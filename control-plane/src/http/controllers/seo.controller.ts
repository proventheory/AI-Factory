import type { Request, Response } from "express";
import { withTransaction } from "../../db.js";
import { runMigrationCrawl } from "../../seo-migration-crawl.js";
import { fetchSitemapProducts, type SitemapType } from "../../sitemap-products.js";
import { productsFromUrl, type ProductsFromUrlType } from "../../products-from-url.js";
import {
  decodeState,
  getGoogleAuthUrl,
  handleOAuthCallback,
  hasGoogleCredentialsForBrand,
  deleteGoogleCredentialsForBrand,
  getAccessTokenForBrand,
} from "../../seo-google-oauth.js";
import {
  hasShopifyCredentialsForBrand,
  getShopifyShopForBrand,
  saveShopifyCredentialsForBrand,
  deleteShopifyCredentialsForBrand,
  getShopifyAccessTokenForBrand,
} from "../../shopify-brand-connector.js";
import { listGa4Properties } from "../../seo-ga4-properties.js";
import { CONTROL_PLANE_BASE, CONSOLE_URL, SEO_GOOGLE_CALLBACK_PATH } from "../constants.js";
import { MAX_LIMIT } from "../lib/pagination.js";

export async function sitemapProducts(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      sitemap_url?: string;
      sitemap_type?: string;
      page?: number;
      limit?: number;
    };
    const sitemap_url = body.sitemap_url;
    const sitemap_type = body.sitemap_type as SitemapType | undefined;
    if (!sitemap_url || !sitemap_type) {
      res.status(400).json({ error: "sitemap_url and sitemap_type are required" });
      return;
    }
    const allowedTypes: SitemapType[] = ["drupal", "ecommerce", "bigcommerce", "shopify"];
    if (!allowedTypes.includes(sitemap_type)) {
      res.status(400).json({
        error: `sitemap_type must be one of: ${allowedTypes.join(", ")}`,
      });
      return;
    }
    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));
    const result = await fetchSitemapProducts({
      sitemap_url,
      sitemap_type,
      page,
      limit,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function productsFromUrlHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      url?: string;
      type?: string;
      sitemap_type?: string;
      limit?: number;
    };
    const url = body.url;
    const type = body.type as ProductsFromUrlType | undefined;
    if (!url || !type) {
      res.status(400).json({ error: "url and type are required" });
      return;
    }
    const allowed: ProductsFromUrlType[] = ["shopify_json", "sitemap_xml"];
    if (!allowed.includes(type)) {
      res.status(400).json({
        error: "type must be one of: shopify_json, sitemap_xml",
      });
      return;
    }
    if (type === "sitemap_xml") {
      const st = body.sitemap_type as SitemapType | undefined;
      const allowedSt: SitemapType[] = ["drupal", "ecommerce", "bigcommerce", "shopify"];
      if (!st || !allowedSt.includes(st)) {
        res.status(400).json({
          error:
            "sitemap_type is required when type is sitemap_xml and must be one of: " +
            allowedSt.join(", "),
        });
        return;
      }
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || 20));
    const result = await productsFromUrl({
      url,
      type,
      sitemap_type: type === "sitemap_xml" ? (body.sitemap_type as SitemapType) : undefined,
      limit,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function seoGscReport(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { site_url?: string; date_range?: string; row_limit?: number; brand_id?: string };
    const site_url = body.site_url ?? "";
    if (!site_url) {
      res.status(400).json({ error: "site_url is required" });
      return;
    }
    let accessToken: string | undefined;
    if (body.brand_id) {
      const token = await withTransaction(async (client) => getAccessTokenForBrand(client, body.brand_id!));
      if (token) accessToken = token.access_token;
    }
    const { fetchGscReport } = await import("../../seo-gsc-ga-client.js");
    const report = await fetchGscReport(site_url, {
      dateRange: body.date_range ?? "last28days",
      rowLimit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
      accessToken,
    });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function seoGa4Report(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { property_id?: string; row_limit?: number; brand_id?: string };
    const rowLimit = Math.min(1000, Math.max(1, Number(body.row_limit) || 500));
    let property_id = body.property_id ?? "";
    let accessToken: string | undefined;

    if (body.brand_id) {
      const row = await withTransaction(async (client) => {
        const token = await getAccessTokenForBrand(client, body.brand_id!);
        const r = await client.query<{ ga4_property_id: string | null }>(
          "SELECT ga4_property_id FROM brand_google_credentials WHERE brand_profile_id = $1",
          [body.brand_id],
        );
        const ga4_property_id = r.rows[0]?.ga4_property_id ?? null;
        return { token, ga4_property_id };
      });
      if (!row.token) {
        res.status(400).json({ error: "Brand has no Google account connected. Connect Google and select a GA4 property on the brand page." });
        return;
      }
      if (!row.ga4_property_id) {
        res.status(400).json({ error: "No GA4 property selected for this brand. Select a GA4 property on the brand page." });
        return;
      }
      property_id = row.ga4_property_id;
      accessToken = row.token.access_token;
    } else if (!property_id) {
      res.status(400).json({ error: "property_id is required, or provide brand_id to use the brand's connected GA4 property." });
      return;
    }

    const { fetchGa4Report } = await import("../../seo-gsc-ga-client.js");
    const report = await fetchGa4Report(property_id, { rowLimit, accessToken });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function seoGoogleAuth(req: Request, res: Response): Promise<void> {
  try {
    const brand_id = req.query.brand_id as string | undefined;
    const initiative_id = req.query.initiative_id as string | undefined;
    const redirect_uri = req.query.redirect_uri as string;
    const doRedirect = req.query.redirect === "1" || req.query.redirect === "true";
    if (!redirect_uri) {
      res.status(400).json({
        error: "redirect_uri is required (e.g. brand or initiative page URL)",
      });
      return;
    }
    if (!brand_id && !initiative_id) {
      res.status(400).json({ error: "brand_id or initiative_id is required" });
      return;
    }
    const callbackUrl = `${CONTROL_PLANE_BASE}${SEO_GOOGLE_CALLBACK_PATH}`;
    const url = await getGoogleAuthUrl(callbackUrl, redirect_uri, {
      brand_id,
      initiative_id,
    });
    if (doRedirect) {
      res.redirect(302, url);
      return;
    }
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** Redirect to Console with OAuth error, or return 400 to avoid redirect loop. Never redirect to our own API. */
function redirectOAuthError(res: Response, error: string): void {
  const encoded = encodeURIComponent(error);
  const consoleUrl = CONSOLE_URL.trim();
  const apiOrigin = CONTROL_PLANE_BASE.toLowerCase();
  const isApiUrl =
    !consoleUrl ||
    consoleUrl.toLowerCase().startsWith(apiOrigin + "/") ||
    consoleUrl.toLowerCase() === apiOrigin ||
    consoleUrl.toLowerCase().includes(SEO_GOOGLE_CALLBACK_PATH);
  if (consoleUrl && !isApiUrl) {
    res.redirect(302, `${consoleUrl}?google_oauth_error=${encoded}`);
    return;
  }
  res.status(400).send(
    `Google OAuth error: ${error}. Set CONSOLE_URL on the control-plane to your Console app URL (e.g. https://your-console.vercel.app), not the API URL.`
  );
}

export async function seoGoogleCallback(req: Request, res: Response): Promise<void> {
  // Bulletproof: if we're already in the "missing code/state" error state, never redirect — return 400 to break any loop.
  if (req.query.error === "missing_code_or_state") {
    res
      .status(400)
      .send(
        "OAuth failed: missing code/state. Clear cookies for this site and try Connect Google again from the brand page. If it persists, check that the Authorized redirect URI in Google Cloud exactly matches this callback URL (no trailing slash)."
      );
    return;
  }

  const code = req.query.code as string;
  const state = req.query.state as string;
  const googleError = req.query.error as string | undefined; // e.g. access_denied when user cancels
  const callbackRedirectUri = `${CONTROL_PLANE_BASE}${SEO_GOOGLE_CALLBACK_PATH}`;

  if (googleError && state) {
    // Google sent an error (e.g. access_denied) but we have state → redirect back to app with error
    try {
      const { redirect_uri } = decodeState(state);
      const sep = redirect_uri.includes("?") ? "&" : "?";
      res.redirect(302, `${redirect_uri}${sep}google_oauth_error=${encodeURIComponent(googleError)}`);
      return;
    } catch {
      // state invalid, fall through to generic error handling
    }
  }

  if (!code || !state) {
    redirectOAuthError(res, googleError ?? "missing_code_or_state");
    return;
  }
  try {
    const result = await withTransaction((client) =>
      handleOAuthCallback(client, code, state, callbackRedirectUri)
    );
    const target = result.redirect_uri || "/";
    const err = result.error
      ? `&error=${encodeURIComponent(result.error)}`
      : "&google_connected=1";
    res.redirect(target.includes("?") ? `${target}${err}` : `${target}?${err.slice(1)}`);
  } catch (e) {
    redirectOAuthError(res, String((e as Error).message));
  }
}

export async function brandProfilesGoogleConnected(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const row = await withTransaction(async (client) => {
      const connected = await hasGoogleCredentialsForBrand(client, id);
      if (!connected) return { connected: false, ga4_property_id: null as string | null };
      const r = await client.query<{ ga4_property_id: string | null }>(
        "SELECT ga4_property_id FROM brand_google_credentials WHERE brand_profile_id = $1",
        [id],
      );
      return { connected: true, ga4_property_id: r.rows[0]?.ga4_property_id ?? null };
    });
    res.json({ connected: row.connected, ga4_property_id: row.ga4_property_id ?? undefined });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "42P01") {
      res.json({ connected: false, ga4_property_id: undefined });
      return;
    }
    if (err?.code === "42703") {
      res.json({ connected: true, ga4_property_id: undefined });
      return;
    }
    res.status(500).json({ error: String(err?.message ?? (e as Error).message) });
  }
}

/** GET /v1/brand_profiles/:id/google_ga4_properties or GET /v1/seo/google_ga4_properties?brand_id= — list GA4 properties for the connected account. */
export async function brandProfilesGoogleGa4Properties(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? req.query.brand_id ?? "");
    const token = await withTransaction((client) => getAccessTokenForBrand(client, id));
    if (!token) {
      res.status(400).json({ error: "Connect Google first for this brand" });
      return;
    }
    const properties = await listGa4Properties(token.access_token);
    res.json({ properties });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg.includes("insufficient") || msg.includes("403") || msg.includes("permission") ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** PATCH /v1/brand_profiles/:id/google_ga4_property — set selected GA4 property for this brand. */
export async function brandProfilesGoogleGa4PropertyPatch(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const property_id = (req.body as { property_id?: string })?.property_id?.trim() ?? null;
    const updated = await withTransaction(async (client) => {
      const has = await hasGoogleCredentialsForBrand(client, id);
      if (!has) return false;
      await client.query(
        "UPDATE brand_google_credentials SET ga4_property_id = $2, updated_at = now() WHERE brand_profile_id = $1",
        [id, property_id || null],
      );
      return true;
    });
    if (!updated) {
      res.status(400).json({ error: "Connect Google first for this brand" });
      return;
    }
    res.json({ ok: true, ga4_property_id: property_id || undefined });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function brandProfilesGoogleCredentialsDelete(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    await withTransaction((client) => deleteGoogleCredentialsForBrand(client, id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/brand_profiles/:id/shopify_connected — whether brand has Shopify credentials and shop_domain. */
export async function brandProfilesShopifyConnected(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const row = await withTransaction(async (client) => {
      const connected = await hasShopifyCredentialsForBrand(client, id);
      if (!connected) return { connected: false, shop_domain: null as string | null };
      const shop = await getShopifyShopForBrand(client, id);
      return { connected: true, shop_domain: shop?.shop_domain ?? null };
    });
    res.json({ connected: row.connected, shop_domain: row.shop_domain ?? undefined });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** PUT /v1/brand_profiles/:id/shopify_credentials — set Shopify connector (shop_domain, client_id, client_secret). */
export async function brandProfilesShopifyCredentialsPut(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const body = req.body as { shop_domain?: string; client_id?: string; client_secret?: string; scopes?: string[] };
    const shop_domain = body.shop_domain?.trim();
    const client_id = body.client_id?.trim();
    const client_secret = body.client_secret?.trim();
    if (!shop_domain || !client_id || !client_secret) {
      res.status(400).json({ error: "shop_domain, client_id, and client_secret are required" });
      return;
    }
    await withTransaction((client) =>
      saveShopifyCredentialsForBrand(client, id, {
        shop_domain,
        client_id,
        client_secret,
        scopes: body.scopes,
      })
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** DELETE /v1/brand_profiles/:id/shopify_credentials — disconnect Shopify for this brand. */
export async function brandProfilesShopifyCredentialsDelete(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    await withTransaction((client) => deleteShopifyCredentialsForBrand(client, id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** SEO migration wizard — Step 1: crawl source site (every live URL, optional link-following for WordPress). */
export async function seoMigrationCrawl(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      source_url?: string;
      use_link_crawl?: boolean;
      max_urls?: number;
      crawl_delay_ms?: number;
      fetch_page_details?: boolean;
    };
    const source_url = body.source_url?.trim();
    if (!source_url || !/^https?:\/\//i.test(source_url)) {
      res.status(400).json({ error: "source_url is required and must be http(s)" });
      return;
    }
    const delayRaw = Number(body.crawl_delay_ms);
    const crawl_delay_ms = Number.isFinite(delayRaw) ? Math.max(0, delayRaw) : 500;
    const result = await runMigrationCrawl({
      source_url,
      use_link_crawl: Boolean(body.use_link_crawl),
      max_urls: Math.min(5000, Math.max(1, Number(body.max_urls) || 2000)),
      crawl_delay_ms,
      fetch_page_details: Boolean(body.fetch_page_details),
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** WooCommerce API: get total count for an endpoint (GET with per_page=1, read X-WP-Total). */
async function wooCount(
  baseUrl: string,
  authHeader: string,
  path: string
): Promise<number> {
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}?per_page=1`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  if (!res.ok) return 0;
  const total = res.headers.get("x-wp-total");
  return total ? Math.max(0, parseInt(total, 10)) : 0;
}

/**
 * WordPress REST API published counts (wp/v2). WooCommerce consumer keys do not authenticate wp/v2;
 * this uses unauthenticated requests, which match public sitemap/crawl counts when the REST API is open.
 */
async function wpPublicPublishedCount(siteOrigin: string, resource: "posts" | "pages" | "tags"): Promise<number> {
  const base = siteOrigin.replace(/\/$/, "");
  const qs = resource === "tags" ? "per_page=1" : "per_page=1&status=publish";
  const url = `${base}/wp-json/wp/v2/${resource}?${qs}`;
  try {
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!res.ok) return 0;
    const total = res.headers.get("x-wp-total");
    return total ? Math.max(0, parseInt(total, 10)) : 0;
  } catch {
    return 0;
  }
}

/** SEO migration wizard — Step 3: Dry run (preview counts from WooCommerce/WP API). */
export async function seoMigrationDryRun(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      woo_server?: string;
      woo_consumer_key?: string;
      woo_consumer_secret?: string;
      entities?: string[];
    };
    const server = (body.woo_server ?? "").trim().replace(/\/$/, "");
    const key = (body.woo_consumer_key ?? "").trim();
    const secret = (body.woo_consumer_secret ?? "").trim();
    if (!server || !key || !secret) {
      res.status(400).json({ error: "woo_server, woo_consumer_key, and woo_consumer_secret are required" });
      return;
    }
    const entities = Array.isArray(body.entities) ? body.entities : ["products", "categories"];
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const authHeader = `Basic ${auth}`;
    const wcBase = `${server}/wp-json/wc/v3`;
    const counts: Record<string, number> = {};
    const wcPaths: Record<string, string> = {
      products: "products",
      categories: "products/categories",
      customers: "customers",
      discounts: "coupons",
      orders: "orders",
    };
    for (const e of entities) {
      if (e === "redirects") {
        continue;
      }
      if (wcPaths[e]) {
        counts[e] = await wooCount(wcBase, authHeader, wcPaths[e]);
        continue;
      }
      if (e === "blogs") {
        counts.blogs = await wpPublicPublishedCount(server, "posts");
        continue;
      }
      if (e === "pages") {
        counts.pages = await wpPublicPublishedCount(server, "pages");
        continue;
      }
      if (e === "blog_tags") {
        counts.blog_tags = await wpPublicPublishedCount(server, "tags");
        continue;
      }
    }
    if (entities.includes("redirects")) {
      let pc = counts.products;
      let cc = counts.categories;
      if (pc == null) pc = await wooCount(wcBase, authHeader, "products");
      if (cc == null) cc = await wooCount(wcBase, authHeader, "products/categories");
      counts.redirects = pc + cc;
    }
    res.json({ counts });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

type MigrationPreviewItem = {
  id: string;
  title: string;
  status: string;
  slug?: string;
  url?: string;
};

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

function wpBasicAuthHeader(user: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${user.replace(/^\s+|\s+$/g, "")}:${appPassword.replace(/\s/g, "")}`, "utf8").toString("base64")}`;
}

/** SEO migration wizard — Step 3: Paginated item preview for granular selection (status, URLs). */
export async function seoMigrationPreviewItems(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      woo_server?: string;
      woo_consumer_key?: string;
      woo_consumer_secret?: string;
      entity?: string;
      page?: number;
      per_page?: number;
      wp_username?: string;
      wp_application_password?: string;
    };
    const server = (body.woo_server ?? "").trim().replace(/\/$/, "");
    const key = (body.woo_consumer_key ?? "").trim();
    const secret = (body.woo_consumer_secret ?? "").trim();
    const entity = (body.entity ?? "").trim();
    const page = Math.max(1, Math.min(500, Number(body.page) || 1));
    const perPage = Math.max(5, Math.min(100, Number(body.per_page) || 50));
    if (!server || !key || !secret) {
      res.status(400).json({ error: "woo_server, woo_consumer_key, and woo_consumer_secret are required" });
      return;
    }
    const allowed = new Set([
      "products",
      "categories",
      "customers",
      "discounts",
      "blogs",
      "pages",
      "blog_tags",
      "redirects",
    ]);
    if (!allowed.has(entity)) {
      res.status(400).json({ error: `entity must be one of: ${[...allowed].join(", ")}` });
      return;
    }
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const authHeader = `Basic ${auth}`;
    const wcBase = `${server}/wp-json/wc/v3`;

    const wpUser = (body.wp_username ?? "").trim();
    const wpPass = (body.wp_application_password ?? "").trim();
    const wpAuth = wpUser && wpPass ? wpBasicAuthHeader(wpUser, wpPass) : null;

    const items: MigrationPreviewItem[] = [];
    let total = 0;
    let scopeNote: string | undefined;

    if (entity === "products") {
      const { data, total: t } = await wooFetchJson(
        wcBase,
        authHeader,
        "products",
        `page=${page}&per_page=${perPage}&status=any`,
      );
      total = t;
      for (const row of data) {
        const o = row as Record<string, unknown>;
        const id = o.id != null ? String(o.id) : "";
        const name = typeof o.name === "string" ? o.name : "";
        const status = typeof o.status === "string" ? o.status : "unknown";
        const slug = typeof o.slug === "string" ? o.slug : undefined;
        const permalink = typeof o.permalink === "string" ? o.permalink : undefined;
        if (id) items.push({ id, title: name || `(product ${id})`, status, slug, url: permalink });
      }
    } else if (entity === "categories") {
      const { data, total: t } = await wooFetchJson(
        wcBase,
        authHeader,
        "products/categories",
        `page=${page}&per_page=${perPage}`,
      );
      total = t;
      for (const row of data) {
        const o = row as Record<string, unknown>;
        const id = o.id != null ? String(o.id) : "";
        const name = typeof o.name === "string" ? o.name : "";
        const slug = typeof o.slug === "string" ? o.slug : undefined;
        const perm = typeof (o as { permalink?: string }).permalink === "string" ? (o as { permalink: string }).permalink : undefined;
        const href = typeof (o as { link?: string }).link === "string" ? (o as { link: string }).link : undefined;
        const url =
          perm ??
          href ??
          (slug ? `${server.replace(/\/$/, "")}/product-category/${encodeURIComponent(slug)}/` : undefined);
        if (id) items.push({ id, title: name || `(category ${id})`, status: "—", slug, url });
      }
    } else if (entity === "customers") {
      const { data, total: t } = await wooFetchJson(wcBase, authHeader, "customers", `page=${page}&per_page=${perPage}`);
      total = t;
      for (const row of data) {
        const o = row as Record<string, unknown>;
        const id = o.id != null ? String(o.id) : "";
        const email =
          typeof o.email === "string"
            ? o.email
            : typeof (o as { username?: string }).username === "string"
              ? (o as { username: string }).username
              : "";
        if (id) items.push({ id, title: email || `Customer ${id}`, status: typeof o.role === "string" ? o.role : "customer" });
      }
    } else if (entity === "discounts") {
      const { data, total: t } = await wooFetchJson(
        wcBase,
        authHeader,
        "coupons",
        `page=${page}&per_page=${perPage}&status=any`,
      );
      total = t;
      for (const row of data) {
        const o = row as Record<string, unknown>;
        const id = o.id != null ? String(o.id) : "";
        const code = typeof o.code === "string" ? o.code : "";
        const status = typeof o.status === "string" ? o.status : "unknown";
        if (id) items.push({ id, title: code || `Coupon ${id}`, status });
      }
    } else if (entity === "blogs" || entity === "pages") {
      const resource = entity === "blogs" ? "posts" : "pages";
      const useAuth = !!wpAuth;
      const statusQs = useAuth ? "status=any" : "status=publish";
      if (!useAuth) {
        scopeNote =
          "Only published content (public REST). Add WordPress username + application password below and reload preview to include drafts/private.";
      }
      const url = `${server}/wp-json/wp/v2/${resource}?${statusQs}&page=${page}&per_page=${perPage}&_fields=id,title,status,slug,link`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (wpAuth) headers.Authorization = wpAuth;
      const r = await fetch(url, { method: "GET", headers });
      if (!r.ok) {
        const text = await r.text();
        res.status(502).json({
          error: `WordPress ${resource} ${r.status}: ${text.slice(0, 200)}`,
          items: [],
          total: 0,
          scope_note: scopeNote,
        });
        return;
      }
      const data = (await r.json()) as unknown[];
      const totalHdr = r.headers.get("x-wp-total");
      total = totalHdr ? Math.max(0, parseInt(totalHdr, 10)) : data.length;
      for (const row of data) {
        const o = row as Record<string, unknown>;
        const id = o.id != null ? String(o.id) : "";
        const titleObj = o.title as { rendered?: string } | undefined;
        const title =
          typeof titleObj?.rendered === "string"
            ? titleObj.rendered.replace(/<[^>]+>/g, "").trim()
            : String(o.slug ?? id);
        const status = typeof o.status === "string" ? o.status : "unknown";
        const slug = typeof o.slug === "string" ? o.slug : undefined;
        const link = typeof o.link === "string" ? o.link : undefined;
        if (id) items.push({ id, title: title || `(${id})`, status, slug, url: link });
      }
    } else if (entity === "blog_tags") {
      const useAuth = !!wpAuth;
      if (!useAuth) {
        scopeNote = "Tags are listed from public REST (all public tags).";
      }
      const url = `${server}/wp-json/wp/v2/tags?page=${page}&per_page=${perPage}&_fields=id,name,slug,link`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (wpAuth) headers.Authorization = wpAuth;
      const r = await fetch(url, { method: "GET", headers });
      if (!r.ok) {
        const text = await r.text();
        res.status(502).json({ error: `WordPress tags ${r.status}: ${text.slice(0, 200)}`, items: [], total: 0 });
        return;
      }
      const data = (await r.json()) as unknown[];
      const totalHdr = r.headers.get("x-wp-total");
      total = totalHdr ? Math.max(0, parseInt(totalHdr, 10)) : data.length;
      for (const row of data) {
        const o = row as Record<string, unknown>;
        const id = o.id != null ? String(o.id) : "";
        const name = typeof o.name === "string" ? o.name : String(id);
        const slug = typeof o.slug === "string" ? o.slug : undefined;
        const link = typeof o.link === "string" ? o.link : undefined;
        if (id) items.push({ id, title: name, status: "tag", slug, url: link });
      }
    } else if (entity === "redirects") {
      scopeNote =
        "Redirect rows are built from product and category permalinks. Uncheck URLs you do not want in the redirect map; items you have not paged through stay included.";
      const per = Math.min(perPage, 100);
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
      total = pt + ct;
      for (const row of prods) {
        const o = row as Record<string, unknown>;
        const id = o.id != null ? String(o.id) : "";
        const name = typeof o.name === "string" ? o.name : "";
        const permalink = typeof o.permalink === "string" ? o.permalink : "";
        const status = typeof o.status === "string" ? o.status : "";
        if (id && permalink)
          items.push({ id: `p:${id}`, title: name || `Product ${id}`, status, url: permalink });
      }
      for (const row of cats) {
        const o = row as Record<string, unknown>;
        const id = o.id != null ? String(o.id) : "";
        const name = typeof o.name === "string" ? o.name : "";
        const slug = typeof o.slug === "string" ? o.slug : undefined;
        const perm = typeof (o as { permalink?: string }).permalink === "string" ? (o as { permalink: string }).permalink : undefined;
        const href = typeof (o as { link?: string }).link === "string" ? (o as { link: string }).link : undefined;
        const link =
          perm ??
          href ??
          (slug ? `${server.replace(/\/$/, "")}/product-category/${encodeURIComponent(slug)}/` : "");
        if (id && link) items.push({ id: `c:${id}`, title: name || `Category ${id}`, status: "category", url: link });
      }
    }

    res.json({ items, total, page, per_page: perPage, scope_note: scopeNote });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** SEO migration wizard — Step 3: Run migration (WooCommerce → Shopify). Shopify is always from the brand connector (Brands → Edit → Shopify). Full ETL not yet implemented. */
export async function seoMigrationRun(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      woo_server?: string;
      woo_consumer_key?: string;
      woo_consumer_secret?: string;
      brand_id?: string;
      entities?: string[];
    };
    const brand_id = body.brand_id?.trim();
    if (!brand_id) {
      res.status(400).json({
        error: "brand_id is required. Connect Shopify for the brand in Brands → Edit brand → Shopify.",
      });
      return;
    }
    const hasShopify = await withTransaction((client) => hasShopifyCredentialsForBrand(client, brand_id));
    if (!hasShopify) {
      res.status(400).json({
        error: "This brand has no Shopify connector. Connect Shopify in Brands → Edit this brand → Shopify (shop domain, Client ID, Client Secret).",
      });
      return;
    }
    res.json({
      message:
        "Full WooCommerce → Shopify migration is not yet implemented. When implemented, AI Factory will use this brand's Shopify connector (tokenized) and push to the Admin API (Matrixify-style).",
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

const KEYWORD_VOLUME_MAX_CHUNK = 400;

export async function seoKeywordVolume(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { keywords?: string[] };
    const keywords = Array.isArray(body.keywords) ? body.keywords.filter((k) => typeof k === "string") : [];
    if (keywords.length === 0) {
      res.status(400).json({ error: "keywords array is required (non-empty)" });
      return;
    }
    const { fetchKeywordVolumes } = await import("../../seo-keyword-volume.js");
    const merged: { keyword: string; monthly_search_volume: number }[] = [];
    let lastError: string | undefined;
    for (let i = 0; i < keywords.length; i += KEYWORD_VOLUME_MAX_CHUNK) {
      const chunk = keywords.slice(i, i + KEYWORD_VOLUME_MAX_CHUNK);
      const result = await fetchKeywordVolumes(chunk);
      merged.push(...(result.volumes ?? []));
      if (result.error) lastError = result.error;
    }
    res.json({ volumes: merged, ...(lastError ? { error: lastError } : {}) });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function seoRankedKeywords(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { urls?: string[]; limit_per_url?: number };
    const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string") : [];
    if (urls.length === 0) {
      res.status(400).json({ error: "urls array is required (non-empty)" });
      return;
    }
    if (urls.length > 500) {
      res.status(400).json({ error: "At most 500 URLs per request" });
      return;
    }
    const { fetchRankedKeywordsForUrls } = await import("../../seo-ranked-keywords.js");
    const result = await fetchRankedKeywordsForUrls(urls, {
      limit_per_url: typeof body.limit_per_url === "number" ? Math.min(1000, Math.max(1, body.limit_per_url)) : undefined,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
