/**
 * Wizard "Run migration" — entity-aware execution (PDFs + audit paths; honest status for the rest).
 */

import { migrateWordPressPdfsToShopify, pdfMigrationSummaryAndHint } from "./wp-shopify-migration-pdf-shopify.js";

const SHOPIFY_REST_VERSION = "2024-10";

const ETL_PENDING = new Set([
  "products",
  "categories",
  "customers",
  "redirects",
  "discounts",
  "blogs",
  "pages",
]);

const MAX_TAGS_IN_ARTIFACT = 2500;

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
  if (unsupported.length > 0) {
    parts.push(
      `Not migrated automatically yet: ${unsupported.join(", ")}. Product/collection/customer/blog-post ETL to Shopify Admin is still being built; use exports or a Matrixify-style workflow where needed.`,
    );
  }
  return parts.join(" ").trim() || "Migration run finished.";
}

export async function executeWizardMigrationRun(opts: {
  server: string;
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
  createRedirects: boolean;
  skipIfExistsInShopify: boolean;
}): Promise<Record<string, unknown>> {
  const by_entity: Record<string, unknown> = {};
  const unsupported: string[] = [];
  const uniq = [...new Set(opts.entities.map((x) => String(x).trim()).filter(Boolean))];

  for (const e of uniq) {
    if (e === "pdfs") {
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
      for (const t of forArtifact) {
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
      }

      const baseNote =
        "WordPress tag archive URLs are listed as “from”. When Shopify is connected, we suggest “to” as your storefront’s /blogs/{blog-handle}/tagged/{wordpress-tag-slug} (Shopify only serves that page if at least one post uses that tag—handles may differ if you renamed tags in Shopify). Set the public store URL in the wizard (step 5) and optionally shopify_blog_handle if you have multiple blogs. Merge the CSV into step 6 or edit rows before importing.";
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
    } else if (ETL_PENDING.has(e)) {
      unsupported.push(e);
    } else {
      unsupported.push(e);
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
