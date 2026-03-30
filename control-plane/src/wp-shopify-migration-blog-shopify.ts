/**
 * WordPress posts → Shopify blog articles (Admin REST).
 * Requires Shopify scopes: read_content, write_content (and read_online_store_pages if your app template bundles it).
 */

const SHOPIFY_API_VERSION = "2024-10";

export type BlogMigrationRow = {
  wordpress_id: string;
  title: string;
  slug?: string;
  wordpress_url?: string;
  shopify_article_id?: string;
  shopify_admin_url?: string;
  note?: string;
  error?: string;
};

export type BlogMigrationResult = {
  rows: BlogMigrationRow[];
  summary: { created: number; skipped: number; failed: number };
  /** Multi-blog hint or resolver note */
  hint?: string;
  truncated: boolean;
  shopify_blog_id?: number;
  shopify_blog_handle?: string;
};

function stripRendered(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function shopHost(shopDomain: string): string {
  return shopDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function shopifyRestJson<T>(
  shopDomain: string,
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
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
    if (text && text.trim()) data = JSON.parse(text) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

type ShopifyBlogRow = { id: number; handle?: string };

export async function fetchShopifyBlogsList(shopDomain: string, accessToken: string): Promise<ShopifyBlogRow[]> {
  const { ok, data, text, status } = await shopifyRestJson<{ blogs?: ShopifyBlogRow[] }>(
    shopDomain,
    accessToken,
    "GET",
    "/blogs.json?limit=250",
  );
  if (!ok) {
    throw new Error(`Shopify blogs list ${status}: ${text.slice(0, 280)}`);
  }
  return Array.isArray(data?.blogs) ? data!.blogs! : [];
}

export async function resolveShopifyBlogIdForPosts(
  shopDomain: string,
  accessToken: string,
  handleOverride: string | null,
): Promise<{ blogId: number; handle: string; note?: string }> {
  const blogs = await fetchShopifyBlogsList(shopDomain, accessToken);
  const withH = blogs
    .map((b) => ({ id: b.id, h: String(b.handle ?? "").trim().toLowerCase() }))
    .filter((b) => b.h);
  if (withH.length === 0) {
    throw new Error("No Shopify blogs returned (check Admin API can read blogs / content scopes).");
  }
  const o = (handleOverride ?? "").trim().toLowerCase();
  if (o) {
    const hit = withH.find((b) => b.h === o);
    if (!hit) {
      throw new Error(`Shopify has no blog with handle "${handleOverride}". Available: ${withH.map((b) => b.h).join(", ")}.`);
    }
    return { blogId: hit.id, handle: hit.h };
  }
  withH.sort((a, b) => a.id - b.id);
  if (withH.length === 1) return { blogId: withH[0].id, handle: withH[0].h };
  return {
    blogId: withH[0].id,
    handle: withH[0].h,
    note: `Multiple blogs (${withH.map((b) => b.h).join(", ")}); using "${withH[0].h}". Pass shopify_blog_handle to target another.`,
  };
}

/** Paginate Shopify articles and return id if handle matches. */
async function findShopifyArticleIdByHandle(
  shopDomain: string,
  accessToken: string,
  blogId: number,
  handle: string,
): Promise<number | null> {
  const want = handle.trim().toLowerCase();
  if (!want) return null;
  let page = 1;
  const limit = 100;
  for (; page <= 50; page++) {
    const { ok, data, text, status } = await shopifyRestJson<{ articles?: { id: number; handle?: string }[] }>(
      shopDomain,
      accessToken,
      "GET",
      `/blogs/${blogId}/articles.json?limit=${limit}&page=${page}&fields=id,handle`,
    );
    if (!ok) {
      throw new Error(`Shopify list articles ${status}: ${text.slice(0, 200)}`);
    }
    const list = data?.articles ?? [];
    for (const a of list) {
      if (String(a.handle ?? "").trim().toLowerCase() === want) return a.id;
    }
    if (list.length < limit) break;
  }
  return null;
}

type WpEmbedded = {
  author?: { name?: string }[];
  "wp:featuredmedia"?: { source_url?: string }[];
  /** Grouped arrays: categories, then tags, etc. */
  "wp:term"?: Array<Array<{ taxonomy?: string; name?: string }>>;
};

type WpPostApi = {
  id: number;
  status?: string;
  slug?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  _embedded?: WpEmbedded;
};

function tagsFromEmbedded(post: WpPostApi): string {
  const raw = post._embedded?.["wp:term"];
  if (!Array.isArray(raw)) return "";
  const names: string[] = [];
  for (const group of raw) {
    if (!Array.isArray(group)) continue;
    for (const t of group) {
      if (t && typeof t === "object" && t.taxonomy === "post_tag" && typeof t.name === "string") {
        names.push(t.name.trim());
      }
    }
  }
  return names.join(", ");
}

function authorFromEmbedded(post: WpPostApi): string {
  const a = post._embedded?.author?.[0];
  return typeof a?.name === "string" && a.name.trim() ? a.name.trim() : "WordPress";
}

function featuredSrc(post: WpPostApi): string | undefined {
  const m = post._embedded?.["wp:featuredmedia"]?.[0];
  return typeof m?.source_url === "string" && m.source_url.trim() ? m.source_url.trim() : undefined;
}

async function wpFetchPost(
  wpOrigin: string,
  wpAuthHeader: string,
  postId: string,
): Promise<WpPostApi | null> {
  const base = wpOrigin.replace(/\/$/, "");
  const url = `${base}/wp-json/wp/v2/posts/${encodeURIComponent(postId)}?context=edit&_embed=author,wp:featuredmedia,wp:term`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: wpAuthHeader },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`WordPress post ${postId} ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as WpPostApi;
}

async function wpListPostIdsPage(
  wpOrigin: string,
  wpAuthHeader: string,
  page: number,
  perPage: number,
): Promise<{ ids: string[]; total: number }> {
  const base = wpOrigin.replace(/\/$/, "");
  const url = `${base}/wp-json/wp/v2/posts?context=edit&status=any&page=${page}&per_page=${perPage}&_fields=id`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: wpAuthHeader },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`WordPress posts list ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: number }[];
  const totalHdr = res.headers.get("x-wp-total");
  const total = totalHdr ? Math.max(0, parseInt(totalHdr, 10)) : (Array.isArray(data) ? data.length : 0);
  const ids = (Array.isArray(data) ? data : []).map((r) => String(r.id ?? "")).filter(Boolean);
  return { ids, total };
}

function adminArticleUrl(shopDomain: string, blogId: number, articleId: number): string {
  const shop = shopHost(shopDomain);
  return `https://${shop}/admin/blogs/${blogId}/articles/${articleId}`;
}

export function blogMigrationSummaryAndHint(result: BlogMigrationResult): { summary: BlogMigrationResult["summary"]; hint?: string } {
  const { created, skipped, failed } = result.summary;
  let hint: string | undefined;
  if (failed > 0) {
    hint = "Some posts failed—check row errors. Common causes: Shopify content scope, oversized HTML, or invalid handle.";
  }
  if (result.truncated) {
    hint = (hint ? `${hint} ` : "") + "Batch limit reached; run again to import more (exclusions apply).";
  }
  return { summary: { created, skipped, failed }, hint };
}

export async function migrateWordPressPostsToShopify(opts: {
  wpOrigin: string;
  wpAuthHeader: string;
  shopDomain: string;
  accessToken: string;
  /** Target Shopify blog handle; if null, first/lowest-id blog. */
  shopifyBlogHandle: string | null;
  excludedIds: Set<string>;
  maxPosts: number;
  skipIfExistsInShopify: boolean;
}): Promise<BlogMigrationResult> {
  const rows: BlogMigrationRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let truncated = false;
  let hitRowLimit = false;
  let hintExtra = "";

  const { blogId, handle: blogHandle, note: blogNote } = await resolveShopifyBlogIdForPosts(
    opts.shopDomain,
    opts.accessToken,
    opts.shopifyBlogHandle,
  );
  if (blogNote) hintExtra = blogNote;

  const perPage = 50;
  let page = 1;
  const maxPosts = Math.min(2000, Math.max(1, opts.maxPosts));

  outer: while (rows.length < maxPosts) {
    const { ids } = await wpListPostIdsPage(opts.wpOrigin, opts.wpAuthHeader, page, perPage);
    if (ids.length === 0) break;

    for (const id of ids) {
      if (rows.length >= maxPosts) {
        hitRowLimit = true;
        break outer;
      }
      if (opts.excludedIds.has(id)) continue;

      const row: BlogMigrationRow = { wordpress_id: id, title: "", slug: undefined, wordpress_url: undefined };
      try {
        const post = await wpFetchPost(opts.wpOrigin, opts.wpAuthHeader, id);
        if (!post) {
          row.error = "not found on WordPress";
          rows.push(row);
          failed++;
          continue;
        }
        const titleRendered = post.title?.rendered ?? "";
        const title = stripRendered(titleRendered) || post.slug || id;
        const slug = typeof post.slug === "string" ? post.slug.trim().toLowerCase() : "";
        const bodyHtml = typeof post.content?.rendered === "string" ? post.content.rendered : "";
        const summaryHtml =
          typeof post.excerpt?.rendered === "string" && post.excerpt.rendered.trim()
            ? post.excerpt.rendered
            : bodyHtml.slice(0, 500);
        const published = post.status === "publish";
        const tags = tagsFromEmbedded(post);
        const author = authorFromEmbedded(post);
        const img = featuredSrc(post);
        row.title = title;
        row.slug = slug || undefined;
        row.wordpress_url = typeof post.link === "string" ? post.link : undefined;

        if (!slug) {
          row.error = "WordPress post has no slug";
          rows.push(row);
          failed++;
          continue;
        }

        if (opts.skipIfExistsInShopify) {
          const existingId = await findShopifyArticleIdByHandle(opts.shopDomain, opts.accessToken, blogId, slug);
          if (existingId != null) {
            row.shopify_article_id = String(existingId);
            row.shopify_admin_url = adminArticleUrl(opts.shopDomain, blogId, existingId);
            row.note = "Already existed in Shopify (skipped)";
            rows.push(row);
            skipped++;
            continue;
          }
        }

        const articlePayload: Record<string, unknown> = {
          title,
          author,
          body_html: bodyHtml || "<p></p>",
          summary_html: summaryHtml || "",
          tags,
          published,
          handle: slug,
        };
        if (img) {
          articlePayload.image = { src: img };
        }

        const { ok, data, text, status } = await shopifyRestJson<{ article?: { id: number; handle?: string }; errors?: string }>(
          opts.shopDomain,
          opts.accessToken,
          "POST",
          `/blogs/${blogId}/articles.json`,
          { article: articlePayload },
        );

        if (!ok) {
          const errMsg = (data as { errors?: unknown })?.errors
            ? JSON.stringify((data as { errors: unknown }).errors).slice(0, 400)
            : text.slice(0, 400);
          if (opts.skipIfExistsInShopify && /handle|taken|already|duplicate/i.test(errMsg)) {
            const existingId = await findShopifyArticleIdByHandle(opts.shopDomain, opts.accessToken, blogId, slug);
            if (existingId != null) {
              row.shopify_article_id = String(existingId);
              row.shopify_admin_url = adminArticleUrl(opts.shopDomain, blogId, existingId);
              row.note = "Matched existing article after create conflict (skipped)";
              rows.push(row);
              skipped++;
              continue;
            }
          }
          row.error = `Shopify ${status}: ${errMsg}`;
          rows.push(row);
          failed++;
          continue;
        }

        const aid = data?.article?.id;
        if (aid == null) {
          row.error = "Shopify returned no article id";
          rows.push(row);
          failed++;
          continue;
        }
        row.shopify_article_id = String(aid);
        row.shopify_admin_url = adminArticleUrl(opts.shopDomain, blogId, aid);
        rows.push(row);
        created++;
        await new Promise((r) => setTimeout(r, 350));
      } catch (e) {
        row.error = String((e as Error).message);
        rows.push(row);
        failed++;
      }
    }

    if (ids.length < perPage) break;
    page++;
  }

  truncated = hitRowLimit;

  return {
    rows,
    summary: { created, skipped, failed },
    truncated,
    shopify_blog_id: blogId,
    shopify_blog_handle: blogHandle,
    ...(hintExtra ? { hint: hintExtra } : {}),
  };
}
