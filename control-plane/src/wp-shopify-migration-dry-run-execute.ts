/**
 * Shared WP → Shopify migration dry-run counts (WooCommerce + WordPress REST).
 * Used by the pipeline runner job; logic matches the former synchronous HTTP handler.
 */

import { wpFetchPdfMediaPage } from "./wp-shopify-migration-pdf-shopify.js";

async function wooCount(baseUrl: string, authHeader: string, path: string): Promise<number> {
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}?per_page=1`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  if (!res.ok) return 0;
  const total = res.headers.get("x-wp-total");
  return total ? Math.max(0, parseInt(total, 10)) : 0;
}

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

export type WpShopifyDryRunExecuteParams = {
  server: string;
  key: string;
  secret: string;
  entities: string[];
  wpAuthHeader: string | null;
};

export async function executeWpShopifyMigrationDryRun(params: WpShopifyDryRunExecuteParams): Promise<Record<string, number>> {
  const { server, key, secret, entities, wpAuthHeader } = params;
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
    if (e === "redirects") continue;
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
    if (e === "pdfs") {
      try {
        const { total } = await wpFetchPdfMediaPage(server, wpAuthHeader, 1, 1);
        counts.pdfs = total;
      } catch {
        counts.pdfs = 0;
      }
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
  return counts;
}
