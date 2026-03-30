/**
 * Wizard "Run migration" — entity-aware execution (PDFs + audit paths; honest status for the rest).
 */

import { migrateWordPressPdfsToShopify, pdfMigrationSummaryAndHint } from "./wp-shopify-migration-pdf-shopify.js";

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
      const csvLines = ["Redirect from,Redirect to,Status"];
      let tagUrlRows = 0;
      for (const t of forArtifact) {
        const u = t.link?.trim();
        if (!u) continue;
        csvLines.push(`"${u.replace(/"/g, '""')}","",301`);
        tagUrlRows++;
      }
      by_entity.blog_tags = {
        status: "recorded",
        count: filtered.length,
        excluded_count: excluded.size,
        wordpress_tags,
        list_truncated: listTruncated,
        redirect_csv: csvLines.join("\n"),
        tag_archive_urls_in_redirect_csv: tagUrlRows,
        note:
          "WordPress exposes a canonical tag archive URL per tag (see link on each row). Shopify has no standalone tag index like many WP themes—tags apply to articles— but you can 301 those old URLs to any destination now (blog hub, collection, /blogs/news/tagged/{handle}, etc.). Use redirect_csv or merge into the wizard redirect map; blog post ETL is not required to plan tag URL redirects.",
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
