/**
 * SEO vertical — single entry point for SEO migration audit, GSC/GA4, sitemap, products, Google OAuth.
 * Runs on the same engine (runs, job_runs, artifacts); no domain tables in kernel.
 *
 * See docs/SEO_VERTICAL.md for boundary and kernel usage.
 */

// GSC / GA4 reports
export { fetchGscReport, fetchGa4Report } from "../../seo-gsc-ga-client.js";

// Sitemap and products
export { fetchSitemapProducts } from "../../sitemap-products.js";
export type { SitemapType } from "../../sitemap-products.js";
export { productsFromUrl } from "../../products-from-url.js";
export type { ProductsFromUrlType, ProductsFromUrlOptions } from "../../products-from-url.js";

// Google OAuth (initiative and brand)
export {
  getGoogleAuthUrl,
  handleOAuthCallback,
  getAccessTokenForInitiative,
  hasGoogleCredentials,
  deleteGoogleCredentials,
  hasGoogleCredentialsForBrand,
  deleteGoogleCredentialsForBrand,
  encodeState,
  decodeState,
} from "../../seo-google-oauth.js";
export type { OAuthState } from "../../seo-google-oauth.js";
