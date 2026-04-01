/**
 * Wizard "Run migration" — entity-aware execution (PDFs + audit paths; honest status for the rest).
 */

import {
  migrateWordPressPdfsToShopify,
  pdfMigrationSummaryAndHint,
  type PdfMigrationProgressEvent,
} from "./wp-shopify-migration-pdf-shopify.js";
import { migrateWordPressPostsToShopify, blogMigrationSummaryAndHint } from "./wp-shopify-migration-blog-shopify.js";
import {
  migrateWooProductsToShopify,
  migrateWooCategoriesToShopify,
  migrateWooCustomersToShopify,
  migrateWooPermalinkRedirectsToShopify,
  migrateWooCouponsToShopify,
  migrateWordPressPagesToShopify,
} from "./wp-shopify-migration-woo-etl-shopify.js";

const SHOPIFY_REST_VERSION = "2024-10";

const MAX_TAGS_IN_ARTIFACT = 2500;

type WizardEtlProgressPayload = {
  current: number;
  total: number;
  source_id?: string;
  created: number;
  skipped: number;
  failed: number;
};

const SUPPORTED_MIGRATION_ENTITIES = new Set([
  "products",
  "categories",
  "customers",
  "redirects",
  "discounts",
  "pages",
  "blogs",
  "blog_tags",
  "pdfs",
]);

const ENTITY_LABEL: Record<string, string> = {
  blogs: "Blog posts",
  blog_tags: "Blog tags",
  pdfs: "PDFs",
  products: "Products",
  categories: "Categories",
  customers: "Customers",
  redirects: "Redirects",
  discounts: "Discounts",
  pages: "Pages",
};

function entityBannerLine(entityId: string, kind: "start_supported" | "unsupported"): string {
  const label = ENTITY_LABEL[entityId] ?? entityId;
  if (kind === "start_supported") {
    if (entityId === "blogs") return `${label}: importing…`;
    if (entityId === "pdfs") return `${label}: uploading…`;
    if (entityId === "blog_tags") return `${label}: building redirect CSV…`;
    if (entityId === "products") return `${label}: importing to Shopify…`;
    if (entityId === "categories") return `${label}: creating collections…`;
    if (entityId === "customers") return `${label}: importing customers…`;
    if (entityId === "redirects") return `${label}: creating URL redirects…`;
    if (entityId === "discounts") return `${label}: creating discount codes…`;
    if (entityId === "pages") return `${label}: importing pages…`;
    return `${label}…`;
  }
  return `${label}: skipped`;
}

/**
 * Order: content + catalog before heavy PDFs; categories before products so collections exist first
 * (product→collection collects are not wired yet, but operators expect collections early).
 */
function sortEntitiesForMigrationOrder(entities: string[]): string[] {
  const priority = [
    "blogs",
    "blog_tags",
    "pages",
    "categories",
    "products",
    "customers",
    "redirects",
    "discounts",
    "pdfs",
  ];
  const want = new Set(entities.map((x) => String(x).trim()).filter(Boolean));
  const out: string[] = [];
  for (const p of priority) {
    if (want.has(p)) out.push(p);
  }
  for (const e of entities) {
    const t = String(e).trim();
    if (t && !priority.includes(t)) out.push(t);
  }
  return out;
}

export type WpTagBrief = { id: string; name: string; slug?: string; link?: string };

function slugifyFromName(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "tag";
}

/** Public storefront origin, e.g. https://stigmathc.com */
function normalizeStorefrontOrigin(input: string | null | undefined, shopDomainFallback: string | null): string | null {
  const t = (input ?? "").trim();
  if (t) {
    const u = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
    try {
      const parsed = new URL(u);
      return `${parsed.protocol}//${parsed.host}`.replace(/\/$/, "");
    } catch {
      return null;
    }
  }
  if (shopDomainFallback) {
    const host = shopDomainFallback.replace(/^https?:\/\//, "").replace(/\/+$/, "").split("/")[0];
    return host ? `https://${host}` : null;
  }
  return null;
}

function tagHandleForRedirect(t: WpTagBrief): string {
  const slug = (t.slug ?? "").trim().toLowerCase();
  if (slug) return slug;
  return slugifyFromName(t.name);
}

/** Path segment for Shopify tagged URL (handles are usually lowercase slug-like). */
function encodeTagPathSegment(handle: string): string {
  if (/^[a-z0-9][a-z0-9_-]*$/i.test(handle)) return handle;
  return encodeURIComponent(handle);
}

function buildShopifyTaggedDestination(publicOrigin: string, blogHandle: string, tagHandle: string): string {
  const base = publicOrigin.replace(/\/$/, "");
  const seg = encodeTagPathSegment(tagHandle);
  return `${base}/blogs/${blogHandle}/tagged/${seg}`;
}

type ShopifyBlogRow = { id: number; handle?: string; title?: string };

async function fetchShopifyBlogs(shopDomain: string, accessToken: string): Promise<ShopifyBlogRow[]> {
  const shop = shopDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = `https://${shop}/admin/api/${SHOPIFY_REST_VERSION}/blogs.json?limit=250`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "X-Shopify-Access-Token": accessToken },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify blogs list ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = JSON.parse(text) as { blogs?: ShopifyBlogRow[] };
  return Array.isArray(data.blogs) ? data.blogs : [];
}

async function resolveShopifyBlogHandleForTags(opts: {
  shopDomain: string;
  accessToken: string;
  override: string | null;
}): Promise<{ handle: string; note?: string }> {
  const o = (opts.override ?? "").trim().toLowerCase();
  if (o) return { handle: o };
  const blogs = await fetchShopifyBlogs(opts.shopDomain, opts.accessToken);
  const withHandle = blogs.map((b) => ({ ...b, h: String(b.handle ?? "").trim().toLowerCase() })).filter((b) => b.h);
  if (withHandle.length === 0) {
    throw new Error("Shopify returned no blogs (check Admin API scopes include read_content or equivalent for blogs).");
  }
  withHandle.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  if (withHandle.length === 1) return { handle: withHandle[0].h };
  const note = `Multiple Shopify blogs (${withHandle.map((b) => b.h).join(", ")}); using "${withHandle[0].h}". Set shopify_blog_handle on the migration run to pick another.`;
  return { handle: withHandle[0].h, note };
}

export async function fetchAllWordPressTags(
  wpOrigin: string,
  wpAuthHeader: string | null,
  options?: { maxTags?: number },
): Promise<WpTagBrief[]> {
  const base = wpOrigin.replace(/\/$/, "");
  const perPage = 100;
  const maxTags = options?.maxTags ?? 50_000;
  const out: WpTagBrief[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = `${base}/wp-json/wp/v2/tags?page=${page}&per_page=${perPage}&_fields=id,name,slug,link`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (wpAuthHeader) headers.Authorization = wpAuthHeader;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`WordPress tags ${r.status}: ${t.slice(0, 200)}`);
    }
    const data = (await r.json()) as unknown[];
    const tp = parseInt(r.headers.get("x-wp-totalpages") || "1", 10);
    totalPages = Number.isFinite(tp) ? Math.max(1, tp) : 1;
    for (const row of data) {
      const o = row as Record<string, unknown>;
      const id = o.id != null ? String(o.id) : "";
      const name = typeof o.name === "string" ? o.name : id;
      if (!id) continue;
      out.push({
        id,
        name,
        ...(typeof o.slug === "string" ? { slug: o.slug } : {}),
        ...(typeof o.link === "string" ? { link: o.link } : {}),
      });
      if (out.length >= maxTags) return out;
    }
    page++;
  } while (page <= totalPages && out.length < maxTags);
  return out;
}

export function buildMigrationRunUserMessage(byEntity: Record<string, unknown>, unsupported: string[]): string {
  const parts: string[] = [];
  const pdf = byEntity.pdfs as { summary?: { uploaded?: number; failed?: number }; hint?: string } | undefined;
  if (pdf?.summary) {
    parts.push(
      `PDFs: uploaded ${pdf.summary.uploaded ?? 0}, failed ${pdf.summary.failed ?? 0}.${pdf.hint ? ` ${pdf.hint}` : ""}`,
    );
  }
  const blogs = byEntity.blogs as {
    summary?: { created?: number; skipped?: number; failed?: number };
    hint?: string;
    truncated?: boolean;
  } | undefined;
  if (blogs?.summary && typeof blogs.summary === "object") {
    const s = blogs.summary;
    parts.push(
      `Blog posts: created ${s.created ?? 0}, skipped ${s.skipped ?? 0}, failed ${s.failed ?? 0}.${blogs.truncated ? " (batch limit reached—run again to continue.)" : ""}${blogs.hint ? ` ${blogs.hint}` : ""}`.trim(),
    );
  }
  const tags = byEntity.blog_tags as {
    count?: number;
    note?: string;
    list_truncated?: boolean;
    tag_archive_urls_in_redirect_csv?: number;
  } | undefined;
  if (tags && typeof tags.count === "number") {
    const nCsv = typeof tags.tag_archive_urls_in_redirect_csv === "number" ? tags.tag_archive_urls_in_redirect_csv : 0;
    const csvHint = nCsv > 0 ? ` ${nCsv} tag archive URL(s) included in redirect_csv for the redirect map.` : "";
    parts.push(
      `Blog tags: saved ${tags.count} WordPress tag(s) on this run for your records.${tags.list_truncated ? " (artifact truncates the tag list at 2500 rows.)" : ""}${csvHint} ${tags.note ?? ""}`.trim(),
    );
  }

  const etlLine = (
    label: string,
    b: { summary?: { created?: number; skipped?: number; failed?: number }; truncated?: boolean; hint?: string } | undefined,
  ): void => {
    if (!b?.summary || typeof b.summary !== "object") return;
    const s = b.summary;
    parts.push(
      `${label}: created ${s.created ?? 0}, skipped ${s.skipped ?? 0}, failed ${s.failed ?? 0}.${b.truncated ? " (batch limit—run again.)" : ""}${b.hint ? ` ${b.hint}` : ""}`.trim(),
    );
  };

  etlLine("Products", byEntity.products as { summary?: { created?: number; skipped?: number; failed?: number }; truncated?: boolean; hint?: string });
  etlLine(
    "Categories",
    byEntity.categories as { summary?: { created?: number; skipped?: number; failed?: number }; truncated?: boolean; hint?: string },
  );
  etlLine(
    "Customers",
    byEntity.customers as { summary?: { created?: number; skipped?: number; failed?: number }; truncated?: boolean; hint?: string },
  );
  etlLine(
    "Redirects",
    byEntity.redirects as { summary?: { created?: number; skipped?: number; failed?: number }; truncated?: boolean; hint?: string },
  );
  etlLine(
    "Discounts",
    byEntity.discounts as { summary?: { created?: number; skipped?: number; failed?: number }; truncated?: boolean; hint?: string },
  );
  etlLine(
    "Pages",
    byEntity.pages as { summary?: { created?: number; skipped?: number; failed?: number }; truncated?: boolean; hint?: string },
  );

  if (unsupported.length > 0) {
    parts.push(`Skipped unknown entity keys: ${unsupported.join(", ")}.`);
  }
  return parts.join(" ").trim() || "Migration run finished.";
}

export async function executeWizardMigrationRun(opts: {
  server: string;
  /** WooCommerce REST consumer key (with server, used for /wc/v3 catalog + coupons). */
  wooConsumerKey: string;
  wooConsumerSecret: string;
  wpAuthHeader: string | null;
  shopDomain: string | null;
  shopAccessToken: string | null;
  /** Public storefront URL (e.g. https://stigmathc.com) for suggested tag redirect destinations. */
  targetStoreUrl: string | null;
  /** When set, use this Shopify blog handle for /blogs/{handle}/tagged/... */
  shopifyBlogHandle: string | null;
  entities: string[];
  excludedByEntity: Record<string, Set<string>>;
  maxPdfFiles: number;
  /** Same cap as PDF batch size (from wizard max_files). */
  maxBlogPosts: number;
  createRedirects: boolean;
  skipIfExistsInShopify: boolean;
  onPdfProgress?: (e: PdfMigrationProgressEvent) => void;
  onBlogProgress?: (p: {
    current: number;
    total: number;
    wordpress_id?: string;
    created: number;
    skipped: number;
    failed: number;
  }) => void;
  /** Phase banners (customers/products/…) and coarse blog_tags progress; same shape as job_events wizard_progress. */
  onWizardProgress?: (payload: Record<string, unknown>) => void | Promise<void>;
}): Promise<Record<string, unknown>> {
  if (!opts.wooConsumerKey?.trim() || !opts.wooConsumerSecret?.trim()) {
    throw new Error("WooCommerce REST credentials are required for migration run (brand connector or payload).");
  }
  const by_entity: Record<string, unknown> = {};
  const unsupported: string[] = [];
  const uniq = sortEntitiesForMigrationOrder([...new Set(opts.entities.map((x) => String(x).trim()).filter(Boolean))]);
  const report = opts.onWizardProgress;
  const maxCatalog = opts.maxBlogPosts;

  for (const e of uniq) {
    if (!SUPPORTED_MIGRATION_ENTITIES.has(e)) {
      void report?.({ phase_banner: entityBannerLine(e, "unsupported"), entity_phase: e, entity_status: "unsupported", force: true });
      unsupported.push(e);
      continue;
    }

    const needsShopifyAdmin =
      e === "products" ||
      e === "categories" ||
      e === "customers" ||
      e === "redirects" ||
      e === "discounts" ||
      e === "pages" ||
      e === "pdfs" ||
      e === "blogs";
    if (needsShopifyAdmin && (!opts.shopDomain || !opts.shopAccessToken)) {
      throw new Error(
        `Shopify must be connected to import ${ENTITY_LABEL[e] ?? e} (Brands → Edit brand → Shopify, with Admin API scopes for products, content, redirects, and discounts as needed).`,
      );
    }

    void report?.({ phase_banner: entityBannerLine(e, "start_supported"), entity_phase: e, entity_status: "running", force: true });

    if (e === "blogs") {
      if (!opts.shopDomain || !opts.shopAccessToken) {
        throw new Error("Shopify must be connected to import blog posts (Brands → Edit brand → Shopify).");
      }
      const excluded = opts.excludedByEntity.blogs ?? new Set<string>();
      const result = await migrateWordPressPostsToShopify({
        wpOrigin: opts.server,
        wpAuthHeader: opts.wpAuthHeader,
        shopDomain: opts.shopDomain,
        accessToken: opts.shopAccessToken,
        shopifyBlogHandle: opts.shopifyBlogHandle,
        excludedIds: excluded,
        maxPosts: opts.maxBlogPosts,
        skipIfExistsInShopify: opts.skipIfExistsInShopify,
        onProgress: opts.onBlogProgress,
      });
      const { summary, hint } = blogMigrationSummaryAndHint(result);
      by_entity.blogs = {
        summary,
        rows: result.rows,
        truncated: result.truncated,
        shopify_blog_id: result.shopify_blog_id,
        shopify_blog_handle: result.shopify_blog_handle,
        ...(result.wordpress_posts_source ? { wordpress_posts_source: result.wordpress_posts_source } : {}),
        ...(result.sample_error?.trim() ? { sample_error: result.sample_error.trim() } : {}),
        ...(hint?.trim() ? { hint: hint.trim() } : {}),
      };
    } else if (e === "products") {
      const excluded = opts.excludedByEntity.products ?? new Set<string>();
      const result = await migrateWooProductsToShopify({
        server: opts.server,
        wooConsumerKey: opts.wooConsumerKey,
        wooConsumerSecret: opts.wooConsumerSecret,
        shopDomain: opts.shopDomain!,
        accessToken: opts.shopAccessToken!,
        excludedIds: excluded,
        maxItems: maxCatalog,
        skipIfExistsInShopify: opts.skipIfExistsInShopify,
        onProgress: (p: WizardEtlProgressPayload) => {
          void report?.({
            phase: "products",
            products: {
              current: p.current,
              total: p.total,
              created: p.created,
              skipped: p.skipped,
              failed: p.failed,
            },
            force: true,
          });
        },
      });
      by_entity.products = {
        summary: result.summary,
        rows: result.rows,
        truncated: result.truncated,
        ...(result.hint?.trim() ? { hint: result.hint.trim() } : {}),
      };
    } else if (e === "categories") {
      const excluded = opts.excludedByEntity.categories ?? new Set<string>();
      const result = await migrateWooCategoriesToShopify({
        server: opts.server,
        wooConsumerKey: opts.wooConsumerKey,
        wooConsumerSecret: opts.wooConsumerSecret,
        shopDomain: opts.shopDomain!,
        accessToken: opts.shopAccessToken!,
        excludedIds: excluded,
        maxItems: maxCatalog,
        skipIfExistsInShopify: opts.skipIfExistsInShopify,
        onProgress: (p: WizardEtlProgressPayload) => {
          void report?.({
            phase: "categories",
            categories: {
              current: p.current,
              total: p.total,
              created: p.created,
              skipped: p.skipped,
              failed: p.failed,
            },
            force: true,
          });
        },
      });
      by_entity.categories = {
        summary: result.summary,
        rows: result.rows,
        truncated: result.truncated,
        ...(result.hint?.trim() ? { hint: result.hint.trim() } : {}),
      };
    } else if (e === "customers") {
      const excluded = opts.excludedByEntity.customers ?? new Set<string>();
      const result = await migrateWooCustomersToShopify({
        server: opts.server,
        wooConsumerKey: opts.wooConsumerKey,
        wooConsumerSecret: opts.wooConsumerSecret,
        shopDomain: opts.shopDomain!,
        accessToken: opts.shopAccessToken!,
        excludedIds: excluded,
        maxItems: maxCatalog,
        skipIfExistsInShopify: opts.skipIfExistsInShopify,
        onProgress: (p: WizardEtlProgressPayload) => {
          void report?.({
            phase: "customers",
            customers: {
              current: p.current,
              total: p.total,
              created: p.created,
              skipped: p.skipped,
              failed: p.failed,
            },
            force: true,
          });
        },
      });
      by_entity.customers = {
        summary: result.summary,
        rows: result.rows,
        truncated: result.truncated,
        ...(result.hint?.trim() ? { hint: result.hint.trim() } : {}),
      };
    } else if (e === "redirects") {
      const excluded = opts.excludedByEntity.redirects ?? new Set<string>();
      const origin = normalizeStorefrontOrigin(opts.targetStoreUrl, opts.shopDomain);
      if (!origin) {
        throw new Error(
          "Redirects need a public target store URL (wizard step 5) or a connected Shopify shop domain to build destination URLs.",
        );
      }
      const result = await migrateWooPermalinkRedirectsToShopify({
        server: opts.server,
        wooConsumerKey: opts.wooConsumerKey,
        wooConsumerSecret: opts.wooConsumerSecret,
        shopDomain: opts.shopDomain!,
        accessToken: opts.shopAccessToken!,
        excludedIds: excluded,
        maxItems: maxCatalog,
        targetStoreOrigin: origin,
        onProgress: (p: WizardEtlProgressPayload) => {
          void report?.({
            phase: "redirects",
            redirects: {
              current: p.current,
              total: p.total,
              created: p.created,
              skipped: p.skipped,
              failed: p.failed,
            },
            force: true,
          });
        },
      });
      by_entity.redirects = {
        summary: result.summary,
        rows: result.rows,
        truncated: result.truncated,
        ...(result.hint?.trim() ? { hint: result.hint.trim() } : {}),
      };
    } else if (e === "discounts") {
      const excluded = opts.excludedByEntity.discounts ?? new Set<string>();
      const result = await migrateWooCouponsToShopify({
        server: opts.server,
        wooConsumerKey: opts.wooConsumerKey,
        wooConsumerSecret: opts.wooConsumerSecret,
        shopDomain: opts.shopDomain!,
        accessToken: opts.shopAccessToken!,
        excludedIds: excluded,
        maxItems: maxCatalog,
        onProgress: (p: WizardEtlProgressPayload) => {
          void report?.({
            phase: "discounts",
            discounts: {
              current: p.current,
              total: p.total,
              created: p.created,
              skipped: p.skipped,
              failed: p.failed,
            },
            force: true,
          });
        },
      });
      by_entity.discounts = {
        summary: result.summary,
        rows: result.rows,
        truncated: result.truncated,
        ...(result.hint?.trim() ? { hint: result.hint.trim() } : {}),
      };
    } else if (e === "pages") {
      const excluded = opts.excludedByEntity.pages ?? new Set<string>();
      const result = await migrateWordPressPagesToShopify({
        wpOrigin: opts.server,
        wpAuthHeader: opts.wpAuthHeader,
        shopDomain: opts.shopDomain!,
        accessToken: opts.shopAccessToken!,
        excludedIds: excluded,
        maxItems: maxCatalog,
        skipIfExistsInShopify: opts.skipIfExistsInShopify,
        onProgress: (p: WizardEtlProgressPayload) => {
          void report?.({
            phase: "pages",
            pages: {
              current: p.current,
              total: p.total,
              created: p.created,
              skipped: p.skipped,
              failed: p.failed,
            },
            force: true,
          });
        },
      });
      by_entity.pages = {
        summary: result.summary,
        rows: result.rows,
        truncated: result.truncated,
        ...(result.hint?.trim() ? { hint: result.hint.trim() } : {}),
      };
    } else if (e === "pdfs") {
      if (!opts.shopDomain || !opts.shopAccessToken) {
        throw new Error("Shopify must be connected to migrate PDFs (Brands → Edit brand → Shopify).");
      }
      const excluded = opts.excludedByEntity.pdfs ?? new Set<string>();
      const result = await migrateWordPressPdfsToShopify({
        wpOrigin: opts.server,
        wpAuthHeader: opts.wpAuthHeader,
        shopDomain: opts.shopDomain,
        accessToken: opts.shopAccessToken,
        excludedIds: excluded,
        maxFiles: opts.maxPdfFiles,
        createRedirects: opts.createRedirects,
        skipIfExistsInShopify: opts.skipIfExistsInShopify,
        onProgress: opts.onPdfProgress,
      });
      const { summary, hint } = pdfMigrationSummaryAndHint(result);
      by_entity.pdfs = {
        summary,
        hint,
        rows: result.rows,
        redirect_csv: result.redirect_csv,
        truncated: result.truncated,
      };
    } else if (e === "blog_tags") {
      const tags = await fetchAllWordPressTags(opts.server, opts.wpAuthHeader);
      const excluded = opts.excludedByEntity.blog_tags ?? new Set<string>();
      const filtered = tags.filter((t) => !excluded.has(t.id));
      const listTruncated = filtered.length > MAX_TAGS_IN_ARTIFACT;
      const forArtifact = filtered.slice(0, MAX_TAGS_IN_ARTIFACT);
      void report?.({ blog_tags: { current: 0, total: forArtifact.length }, force: true });
      const wordpress_tags = forArtifact.map((t) => ({
        id: t.id,
        name: t.name,
        ...(t.slug ? { slug: t.slug } : {}),
        ...(t.link ? { link: t.link } : {}),
      }));

      let suggestedBlogHandle: string | null = null;
      let suggestionMetaNote = "";
      let publicOrigin: string | null = null;
      if (opts.shopDomain && opts.shopAccessToken) {
        try {
          const resolved = await resolveShopifyBlogHandleForTags({
            shopDomain: opts.shopDomain,
            accessToken: opts.shopAccessToken,
            override: opts.shopifyBlogHandle,
          });
          suggestedBlogHandle = resolved.handle;
          if (resolved.note) suggestionMetaNote = resolved.note;
          publicOrigin = normalizeStorefrontOrigin(opts.targetStoreUrl, opts.shopDomain);
        } catch (err) {
          suggestionMetaNote = `Could not resolve Shopify blog handle for tag URLs: ${String((err as Error).message)}`;
        }
      } else if (opts.targetStoreUrl?.trim()) {
        suggestionMetaNote =
          "Connect Shopify for this brand to discover the blog handle and pre-fill /blogs/{handle}/tagged/{slug} in the CSV (target store URL alone is not enough).";
      }

      const csvLines = ["Redirect from,Redirect to,Status"];
      let tagUrlRows = 0;
      const tagProgressEvery = 40;
      for (let ti = 0; ti < forArtifact.length; ti++) {
        const t = forArtifact[ti];
        const u = t.link?.trim();
        if (!u) continue;
        const tagHandle = tagHandleForRedirect(t);
        const to =
          publicOrigin && suggestedBlogHandle
            ? buildShopifyTaggedDestination(publicOrigin, suggestedBlogHandle, tagHandle)
            : "";
        const toCell = to ? `"${to.replace(/"/g, '""')}"` : '""';
        csvLines.push(`"${u.replace(/"/g, '""')}",${toCell},301`);
        tagUrlRows++;
        if (ti % tagProgressEvery === 0 || ti === forArtifact.length - 1) {
          void report?.({ blog_tags: { current: ti + 1, total: forArtifact.length } });
        }
      }

      const baseNote =
        "Recommended order: migrate blog posts into Shopify first (posts carry tags—Shopify has no separate “tag import”). Then run this tag export / redirect CSV so “to” URLs match tags that actually exist on articles. WordPress tag archive URLs are listed as “from”. When Shopify is connected, we suggest “to” as /blogs/{blog-handle}/tagged/{wordpress-tag-slug} (that URL only works once at least one post uses that tag; handles may differ if tags were renamed in Shopify). Set the public store URL in the wizard (step 5) and optionally shopify_blog_handle if you have multiple blogs. Merge the CSV into step 6 or edit rows before importing.";
      const note = [suggestionMetaNote, baseNote].filter(Boolean).join(" ");

      by_entity.blog_tags = {
        status: "recorded",
        count: filtered.length,
        excluded_count: excluded.size,
        wordpress_tags,
        list_truncated: listTruncated,
        redirect_csv: csvLines.join("\n"),
        tag_archive_urls_in_redirect_csv: tagUrlRows,
        ...(suggestedBlogHandle ? { shopify_blog_handle_used: suggestedBlogHandle } : {}),
        ...(publicOrigin ? { tag_redirect_target_base: publicOrigin } : {}),
        ...(suggestionMetaNote ? { tag_redirect_hint: suggestionMetaNote } : {}),
        note,
      };
    }
  }

  const message = buildMigrationRunUserMessage(by_entity, unsupported);
  return {
    message,
    entities: uniq,
    by_entity,
    unsupported,
    generated_at: new Date().toISOString(),
  };
}
