/**
 * WP → Shopify migration — paginated preview items (WooCommerce + WordPress REST).
 * Shared by HTTP handler and pipeline runner job `migration_preview`.
 */

import { wpFetchPdfMediaPage } from "./wp-shopify-migration-pdf-shopify.js";

export type MigrationPreviewItem = {
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

export type MigrationPreviewExecuteParams = {
  server: string;
  key: string;
  secret: string;
  entity: string;
  page: number;
  perPage: number;
  wp_username?: string;
  wp_application_password?: string;
};

export type MigrationPreviewExecuteResult = {
  items: MigrationPreviewItem[];
  total: number;
  page: number;
  per_page: number;
  scope_note?: string;
};

export async function executeMigrationPreviewItems(params: MigrationPreviewExecuteParams): Promise<MigrationPreviewExecuteResult> {
  const { server, key, secret, entity, page, perPage } = params;
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const authHeader = `Basic ${auth}`;
  const wcBase = `${server}/wp-json/wc/v3`;

  const wpUser = (params.wp_username ?? "").trim();
  const wpPass = (params.wp_application_password ?? "").trim();
  const wpAuth = wpUser && wpPass ? wpBasicAuthHeader(wpUser, wpPass) : null;

  const items: MigrationPreviewItem[] = [];
  let total = 0;
  let scopeNote: string | undefined;

  if (entity === "products") {
    const { data, total: t } = await wooFetchJson(wcBase, authHeader, "products", `page=${page}&per_page=${perPage}&status=any`);
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
      throw new Error(`WordPress ${resource} ${r.status}: ${text.slice(0, 200)}`);
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
      throw new Error(`WordPress tags ${r.status}: ${text.slice(0, 200)}`);
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
  } else if (entity === "pdfs") {
    if (!wpAuth) {
      scopeNote =
        "Listing PDFs visible via public REST. Add WordPress username + application password above and reopen Details to include private / draft media.";
    }
    const { rows: pdfRows, total: pdfTotal } = await wpFetchPdfMediaPage(server, wpAuth, page, perPage);
    total = pdfTotal;
    for (const raw of pdfRows) {
      const id = raw.id != null ? String(raw.id) : "";
      const titleObj = raw.title as { rendered?: string } | undefined;
      const title =
        typeof titleObj?.rendered === "string"
          ? titleObj.rendered.replace(/<[^>]+>/g, "").trim()
          : typeof raw.slug === "string"
            ? raw.slug
            : id;
      const status = typeof raw.status === "string" ? raw.status : "inherit";
      const slug = typeof raw.slug === "string" ? raw.slug : undefined;
      const fileUrl = typeof raw.source_url === "string" ? raw.source_url : undefined;
      if (id) items.push({ id, title: title || `PDF ${id}`, status, slug, url: fileUrl });
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
      if (id && permalink) items.push({ id: `p:${id}`, title: name || `Product ${id}`, status, url: permalink });
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
  } else {
    throw new Error(`Unknown entity: ${entity}`);
  }

  return { items, total, page, per_page: perPage, scope_note: scopeNote };
}
