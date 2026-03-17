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
} from "../../seo-google-oauth.js";
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
    const body = req.body as { site_url?: string; date_range?: string; row_limit?: number };
    const site_url = body.site_url ?? "";
    if (!site_url) {
      res.status(400).json({ error: "site_url is required" });
      return;
    }
    const { fetchGscReport } = await import("../../seo-gsc-ga-client.js");
    const report = await fetchGscReport(site_url, {
      dateRange: body.date_range ?? "last28days",
      rowLimit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
    });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function seoGa4Report(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { property_id?: string; row_limit?: number };
    const property_id = body.property_id ?? "";
    if (!property_id) {
      res.status(400).json({ error: "property_id is required" });
      return;
    }
    const { fetchGa4Report } = await import("../../seo-gsc-ga-client.js");
    const report = await fetchGa4Report(property_id, {
      rowLimit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
    });
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
    return res
      .status(400)
      .send(
        "OAuth failed: missing code/state. Clear cookies for this site and try Connect Google again from the brand page. If it persists, check that the Authorized redirect URI in Google Cloud exactly matches this callback URL (no trailing slash)."
      );
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
    const connected = await withTransaction((client) =>
      hasGoogleCredentialsForBrand(client, id)
    );
    res.json({ connected: !!connected });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "42P01") {
      res.json({ connected: false });
      return;
    }
    res.status(500).json({ error: String(err?.message ?? (e as Error).message) });
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
    const result = await runMigrationCrawl({
      source_url,
      use_link_crawl: Boolean(body.use_link_crawl),
      max_urls: Math.min(5000, Math.max(1, Number(body.max_urls) || 2000)),
      crawl_delay_ms: Math.max(0, Number(body.crawl_delay_ms) ?? 500),
      fetch_page_details: Boolean(body.fetch_page_details),
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
