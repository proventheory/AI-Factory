/**
 * SEO vertical (GSC, GA4, keywords, sitemaps) and brand integration routes (Google, Shopify, WooCommerce)
 * mounted from `/v1/seo/*` and `/v1/brand_profiles/*`. WP → Shopify wizard lives in wp-shopify-migration.controller.ts.
 */
import type { Request, Response } from "express";
import { withTransaction } from "../../db.js";
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
import {
  hasWooCommerceCredentialsForBrand,
  getWooCommerceStoreUrlForBrand,
  saveWooCommerceCredentialsForBrand,
  deleteWooCommerceCredentialsForBrand,
} from "../../woocommerce-brand-connector.js";
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
      if (!connected) return { connected: false, shop_domain: null as string | null, uses_custom_app_token: false };
      const shop = await getShopifyShopForBrand(client, id);
      const uses_custom_app_token = shop != null && (shop.client_id == null || shop.client_id === "");
      return { connected: true, shop_domain: shop?.shop_domain ?? null, uses_custom_app_token };
    });
    res.json({
      connected: row.connected,
      shop_domain: row.shop_domain ?? undefined,
      ...(row.connected ? { uses_custom_app_token: row.uses_custom_app_token } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** PUT /v1/brand_profiles/:id/shopify_credentials — OAuth (client_id + secret) or custom app (admin_access_token / shpat_). */
export async function brandProfilesShopifyCredentialsPut(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const body = req.body as {
      shop_domain?: string;
      client_id?: string;
      client_secret?: string;
      admin_access_token?: string;
      scopes?: string[];
    };
    const shop_domain = body.shop_domain?.trim();
    const admin_access_token = body.admin_access_token?.trim();
    const client_id = body.client_id?.trim();
    const client_secret = body.client_secret?.trim();
    if (!shop_domain) {
      res.status(400).json({ error: "shop_domain is required" });
      return;
    }
    if (!admin_access_token && (!client_id || !client_secret)) {
      res.status(400).json({
        error:
          "Either admin_access_token (custom app: shpat_ from Develop apps) or both client_id and client_secret (Partner OAuth) is required.",
      });
      return;
    }
    await withTransaction((client) =>
      saveShopifyCredentialsForBrand(client, id, {
        shop_domain,
        ...(admin_access_token
          ? { admin_access_token }
          : { client_id: client_id!, client_secret: client_secret! }),
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

/** GET /v1/brand_profiles/:id/woocommerce_connected — whether brand has WooCommerce REST credentials (store URL only in response). */
export async function brandProfilesWooCommerceConnected(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const row = await withTransaction(async (client) => {
      const connected = await hasWooCommerceCredentialsForBrand(client, id);
      if (!connected) return { connected: false, store_url: null as string | null };
      const meta = await getWooCommerceStoreUrlForBrand(client, id);
      return { connected: true, store_url: meta?.store_url ?? null };
    });
    res.json({
      connected: row.connected,
      ...(row.connected && row.store_url ? { store_url: row.store_url } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** PUT /v1/brand_profiles/:id/woocommerce_credentials — store URL + WooCommerce REST consumer key/secret (encrypted). */
export async function brandProfilesWooCommerceCredentialsPut(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const body = req.body as { store_url?: string; consumer_key?: string; consumer_secret?: string };
    const store_url = body.store_url?.trim();
    const consumer_key = body.consumer_key?.trim();
    const consumer_secret = body.consumer_secret?.trim();
    if (!store_url || !consumer_key || !consumer_secret) {
      res.status(400).json({ error: "store_url, consumer_key, and consumer_secret are required" });
      return;
    }
    await withTransaction((client) =>
      saveWooCommerceCredentialsForBrand(client, id, { store_url, consumer_key, consumer_secret }),
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** DELETE /v1/brand_profiles/:id/woocommerce_credentials — disconnect WooCommerce REST for this brand. */
export async function brandProfilesWooCommerceCredentialsDelete(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    await withTransaction((client) => deleteWooCommerceCredentialsForBrand(client, id));
    res.json({ ok: true });
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
