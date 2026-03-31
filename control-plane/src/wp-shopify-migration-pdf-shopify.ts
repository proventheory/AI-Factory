/**
 * WordPress media (PDF) → Shopify Files (Admin GraphQL) + optional URL redirects.
 * Requires Shopify custom app scopes including write_files and (for redirects) read_online_store_navigation or write_online_store_navigation — urlRedirectCreate uses Online Store scope.
 */

const SHOPIFY_API_VERSION = "2024-10";

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

async function shopifyGraphql<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const shop = shopDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json: GraphqlResponse<T>;
  try {
    json = JSON.parse(text) as GraphqlResponse<T>;
  } catch {
    throw new Error(`Shopify GraphQL invalid JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!res.ok) {
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!json.data) {
    throw new Error("Shopify GraphQL returned no data");
  }
  return json.data;
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, "").replace(/\.\./g, "").trim() || "file.pdf";
  return base.length > 180 ? base.slice(0, 180) : base;
}

function basenameFromSourceUrl(sourceUrl: string, fallback: string): string {
  try {
    const u = new URL(sourceUrl);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    if (seg && seg.toLowerCase().endsWith(".pdf")) return sanitizeFilename(seg);
  } catch {
    // ignore
  }
  return fallback.toLowerCase().endsWith(".pdf") ? sanitizeFilename(fallback) : sanitizeFilename(`${fallback}.pdf`);
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Shopify processes GenericFile asynchronously: UPLOADED/PROCESSING then READY with a public `url`. */
async function fetchGenericFileNode(
  shopDomain: string,
  accessToken: string,
  fileGid: string,
): Promise<{ url: string | null; fileStatus: string | null }> {
  const q = `
    query PdfMigrationFile($id: ID!) {
      node(id: $id) {
        ... on GenericFile {
          url
          fileStatus
        }
      }
    }
  `;
  const data = await shopifyGraphql<{
    node: { url: string | null; fileStatus: string | null } | null;
  }>(shopDomain, accessToken, q, { id: fileGid });
  const n = data.node;
  return { url: n?.url?.trim() ? n.url : null, fileStatus: n?.fileStatus ?? null };
}

async function waitForShopifyGenericFileUrl(
  shopDomain: string,
  accessToken: string,
  fileGid: string,
  initialStatus: string | null,
): Promise<string> {
  const maxMs = 120_000;
  const intervalMs = 1_500;
  const deadline = Date.now() + maxMs;
  let lastStatus = initialStatus;
  await sleepMs(400);
  while (Date.now() < deadline) {
    const { url, fileStatus } = await fetchGenericFileNode(shopDomain, accessToken, fileGid);
    lastStatus = fileStatus;
    if (url) return url;
    if (fileStatus === "FAILED") {
      throw new Error("Shopify file processing FAILED (GenericFile never received a public URL)");
    }
    await sleepMs(intervalMs);
  }
  throw new Error(
    `Timed out after ${maxMs / 1000}s waiting for Shopify file URL (last status: ${lastStatus ?? "unknown"}). File may still appear in Admin → Content → Files.`,
  );
}

/** Path starting with / for Shopify UrlRedirect (online store). */
export function redirectPathFromWordPressUrl(wordpressFileUrl: string): string | null {
  try {
    const u = new URL(wordpressFileUrl);
    const path = u.pathname || "/";
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return null;
  }
}

async function stagedUploadAndCreateFile(
  shopDomain: string,
  accessToken: string,
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const mimeType = "application/pdf";
  const fileSize = String(buffer.length);

  const stagedMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const stagedData = await shopifyGraphql<{
    stagedUploadsCreate: {
      stagedTargets: { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }[];
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(shopDomain, accessToken, stagedMutation, {
    input: [
      {
        resource: "FILE",
        filename,
        mimeType,
        httpMethod: "POST",
        fileSize,
      },
    ],
  });

  const su = stagedData.stagedUploadsCreate;
  if (su.userErrors?.length) {
    throw new Error(su.userErrors.map((e) => e.message).join("; "));
  }
  const target = su.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl) {
    throw new Error("Shopify stagedUploadsCreate returned no target");
  }

  const form = new FormData();
  for (const p of target.parameters ?? []) {
    form.append(p.name, p.value);
  }
  form.append("file", new Blob([buffer], { type: mimeType }), filename);

  const up = await fetch(target.url, { method: "POST", body: form });
  if (!up.ok) {
    const t = await up.text();
    throw new Error(`Staged upload failed ${up.status}: ${t.slice(0, 200)}`);
  }

  const createMutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on GenericFile {
            id
            url
            fileStatus
          }
        }
        userErrors { field message }
      }
    }
  `;

  const createData = await shopifyGraphql<{
    fileCreate: {
      files: { id: string; url: string | null; fileStatus: string | null }[];
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(shopDomain, accessToken, createMutation, {
    files: [
      {
        contentType: "FILE",
        originalSource: target.resourceUrl,
        filename,
        duplicateResolutionMode: "APPEND_UUID",
      },
    ],
  });

  const fc = createData.fileCreate;
  if (fc.userErrors?.length) {
    throw new Error(fc.userErrors.map((e) => e.message).join("; "));
  }
  const file = fc.files?.[0];
  const gid = file?.id;
  let cdnUrl = file?.url?.trim() ? file.url : null;
  if (!cdnUrl && gid) {
    cdnUrl = await waitForShopifyGenericFileUrl(shopDomain, accessToken, gid, file?.fileStatus ?? null);
  }
  if (!cdnUrl) {
    throw new Error(`Shopify fileCreate returned no file id or URL (status ${file?.fileStatus ?? "unknown"})`);
  }
  return cdnUrl;
}

async function createShopifyUrlRedirect(
  shopDomain: string,
  accessToken: string,
  path: string,
  target: string,
): Promise<void> {
  const mutation = `
    mutation urlRedirectCreate($urlRedirect: UrlRedirectInput!) {
      urlRedirectCreate(urlRedirect: $urlRedirect) {
        urlRedirect { id path target }
        userErrors { field message }
      }
    }
  `;
  const data = await shopifyGraphql<{
    urlRedirectCreate: {
      urlRedirect: { id: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(shopDomain, accessToken, mutation, {
    urlRedirect: { path, target },
  });
  const ur = data.urlRedirectCreate;
  if (ur.userErrors?.length) {
    const msg = ur.userErrors.map((e) => e.message).join("; ");
    if (/already exists|taken|duplicate/i.test(msg)) return;
    throw new Error(msg);
  }
}

type WpMediaRow = {
  id: number;
  slug?: string;
  status?: string;
  source_url?: string;
  link?: string;
  mime_type?: string;
  title?: { rendered?: string };
};

export type PdfMigrationRowResult = {
  wordpress_id: string;
  title: string;
  source_url: string;
  shopify_file_url?: string;
  redirect_path?: string;
  redirect_created?: boolean;
  error?: string;
  /** e.g. linked existing Shopify file instead of uploading */
  note?: string;
};

export type PdfMigrationResult = {
  rows: PdfMigrationRowResult[];
  redirect_csv: string;
  truncated: boolean;
};

export function pdfMigrationSummaryAndHint(result: PdfMigrationResult): {
  summary: { uploaded: number; failed: number; warnings: number; truncated: boolean };
  hint: string;
} {
  const uploaded = result.rows.filter((r) => r.shopify_file_url).length;
  const failed = result.rows.filter((r) => r.error && !r.shopify_file_url).length;
  const warnings = result.rows.filter((r) => r.shopify_file_url && r.error).length;
  return {
    summary: { uploaded, failed, warnings, truncated: result.truncated },
    hint:
      "When the console sends wordpress_ids (step-3 PDF preview), the runner imports that exact ordered list so row counts align with in-scope attachments (still capped at max_files, default 2000). Uploaded in summary = rows with a Shopify file URL. If counts still differ, check reconciliation cards, Truncated, exclusions, or re-run after a worker restart. Ensure the Shopify custom app includes the write_files scope. Shopify may return file status UPLOADED before the CDN URL exists; the server waits (polls) until the URL is ready. Use “Fetch URLs from Shopify” (no upload) for rows that uploaded but had no URL yet, or enable skip-if-exists before import to link existing Shopify files without fileCreate. For automatic URL redirects from old paths, add online store navigation redirect permissions (e.g. write_online_store_navigation). You can import redirect_csv in Shopify Admin if redirects were not created via API. If this run was truncated, open PDFs → Details and exclude WordPress media IDs that already uploaded, then run again.",
  };
}

/** Streamed to the console as NDJSON while `migrateWordPressPdfsToShopify` runs. */
export type PdfMigrationProgressEvent =
  | { event: "init"; total: number; pdf_total_in_wordpress: number; max_files: number }
  | {
      event: "item";
      current: number;
      total: number;
      wordpress_id: string;
      title: string;
      step: "start" | "complete";
      shopify_file_url?: string;
      error?: string;
    };

/** Paginated WordPress media rows (application/pdf only). Used by preview API. */
export async function wpFetchPdfMediaPage(
  wpOrigin: string,
  wpAuthHeader: string | null,
  page: number,
  perPage: number,
): Promise<{ rows: WpMediaRow[]; total: number; totalPages: number }> {
  const base = wpOrigin.replace(/\/$/, "");
  const url = `${base}/wp-json/wp/v2/media?mime_type=application%2Fpdf&page=${page}&per_page=${perPage}&_fields=id,title,source_url,slug,status,link`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (wpAuthHeader) headers.Authorization = wpAuthHeader;
  const r = await fetch(url, { method: "GET", headers });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`WordPress media ${r.status}: ${text.slice(0, 240)}`);
  }
  const rows = (await r.json()) as WpMediaRow[];
  const totalHdr = r.headers.get("x-wp-total");
  const total = totalHdr ? Math.max(0, parseInt(totalHdr, 10)) : (Array.isArray(rows) ? rows.length : 0);
  const totalPages = Math.max(1, parseInt(r.headers.get("x-wp-totalpages") || "1", 10));
  return { rows: Array.isArray(rows) ? rows : [], total, totalPages };
}

function isTransientWpFetchError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return (
    /WordPress media (500|502|503|504|429)/.test(m) ||
    /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|socket/i.test(m) ||
    /timeout/i.test(m)
  );
}

/** Same as wpFetchPdfMediaPage but retries transient WP / network failures so long PDF imports do not abort mid-pagination. */
export async function wpFetchPdfMediaPageWithRetry(
  wpOrigin: string,
  wpAuthHeader: string | null,
  page: number,
  perPage: number,
  options?: { maxAttempts?: number },
): Promise<{ rows: WpMediaRow[]; total: number; totalPages: number }> {
  const maxAttempts = Math.max(1, Math.min(12, options?.maxAttempts ?? 8));
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await wpFetchPdfMediaPage(wpOrigin, wpAuthHeader, page, perPage);
    } catch (e) {
      lastErr = e;
      if (!isTransientWpFetchError(e) || attempt === maxAttempts) throw e;
      const waitMs = Math.min(45_000, 2000 * 2 ** (attempt - 1));
      await sleepMs(waitMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type ShopifyPdfIndexEntry = { id: string; url: string | null; fileStatus: string | null };

function indexKeysForGenericFile(url: string | null, alt: string | null): string[] {
  const keys = new Set<string>();
  const al = (alt || "").trim();
  if (al) keys.add(al.toLowerCase());
  if (url) {
    try {
      const seg = new URL(url).pathname.split("/").filter(Boolean).pop();
      if (seg) {
        try {
          keys.add(decodeURIComponent(seg).toLowerCase());
        } catch {
          keys.add(seg.toLowerCase());
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...keys].filter(Boolean);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lookupShopifyPdfInIndex(index: Map<string, ShopifyPdfIndexEntry>, filename: string): ShopifyPdfIndexEntry | null {
  const key = filename.trim().toLowerCase();
  if (index.has(key)) return index.get(key)!;
  const noExt = key.replace(/\.pdf$/i, "");
  if (noExt) {
    const re = new RegExp(`^${escapeRegex(noExt)}(_[a-z0-9-]+)?\\.pdf$`, "i");
    for (const [k, v] of index) {
      if (re.test(k)) return v;
    }
  }
  return null;
}

type PdfIndexFilesQueryData = {
  files: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: {
      node:
        | {
            __typename: string;
            id: string;
            url: string | null;
            fileStatus: string | null;
            alt: string | null;
            mimeType: string | null;
          }
        | null;
    }[];
  };
};

/** Walk Shopify Files (recent first) and index Generic PDFs by likely basenames for dedupe / resolve. */
export async function buildShopifyPdfBasenameIndex(
  shopDomain: string,
  accessToken: string,
  maxPages = 60,
): Promise<Map<string, ShopifyPdfIndexEntry>> {
  const index = new Map<string, ShopifyPdfIndexEntry>();
  const q = `
    query PdfIndexFiles($first: Int!, $after: String) {
      files(first: $first, after: $after, reverse: true) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            __typename
            ... on GenericFile {
              id
              url
              fileStatus
              alt
              mimeType
            }
          }
        }
      }
    }
  `;
  let after: string | null = null;
  for (let p = 0; p < maxPages; p++) {
    const data: PdfIndexFilesQueryData = await shopifyGraphql<PdfIndexFilesQueryData>(
      shopDomain,
      accessToken,
      q,
      { first: 100, after },
    );
    for (const e of data.files.edges) {
      const n = e.node;
      if (!n || n.__typename !== "GenericFile") continue;
      if (n.mimeType && !n.mimeType.toLowerCase().includes("pdf")) continue;
      const entry: ShopifyPdfIndexEntry = { id: n.id, url: n.url?.trim() ? n.url : null, fileStatus: n.fileStatus };
      const keys = indexKeysForGenericFile(n.url, n.alt);
      for (const k of keys) {
        if (!index.has(k)) index.set(k, entry);
      }
    }
    if (!data.files.pageInfo.hasNextPage || !data.files.pageInfo.endCursor) break;
    after = data.files.pageInfo.endCursor;
  }
  return index;
}

async function resolveUrlFromIndexEntry(
  shopDomain: string,
  accessToken: string,
  entry: ShopifyPdfIndexEntry,
): Promise<string> {
  if (entry.url?.trim()) return entry.url;
  return waitForShopifyGenericFileUrl(shopDomain, accessToken, entry.id, entry.fileStatus);
}

/** Fetch one WordPress media object by ID (any mime). */
export async function wpFetchMediaById(
  wpOrigin: string,
  wpAuthHeader: string | null,
  mediaId: number,
): Promise<WpMediaRow | null> {
  const base = wpOrigin.replace(/\/$/, "");
  const url = `${base}/wp-json/wp/v2/media/${mediaId}?_fields=id,title,source_url,slug,status,link,mime_type`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (wpAuthHeader) headers.Authorization = wpAuthHeader;
  const r = await fetch(url, { method: "GET", headers });
  if (r.status === 404) return null;
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`WordPress media ${mediaId}: ${r.status} ${text.slice(0, 200)}`);
  }
  return (await r.json()) as WpMediaRow;
}

/**
 * For WordPress media IDs, find matching PDFs already in Shopify Files (by filename / alt / URL path) and return CDN URLs — no upload.
 */
export async function resolveWordPressPdfUrlsFromShopify(opts: {
  wpOrigin: string;
  wpAuthHeader: string | null;
  shopDomain: string;
  accessToken: string;
  wordpressIds: string[];
  createRedirects: boolean;
  onProgress?: (e: PdfMigrationProgressEvent) => void;
}): Promise<PdfMigrationResult> {
  const { wpOrigin, wpAuthHeader, shopDomain, accessToken, wordpressIds, createRedirects, onProgress } = opts;
  const rows: PdfMigrationRowResult[] = [];
  const csvLines: string[] = ["Redirect from,Redirect to"];
  const index = await buildShopifyPdfBasenameIndex(shopDomain, accessToken, 120);
  const total = Math.max(1, wordpressIds.length);
  onProgress?.({
    event: "init",
    total,
    pdf_total_in_wordpress: wordpressIds.length,
    max_files: wordpressIds.length,
  });
  let current = 0;
  for (const wid of wordpressIds) {
    current += 1;
    const idNum = parseInt(wid, 10);
    if (!Number.isFinite(idNum)) {
      rows.push({
        wordpress_id: wid,
        title: "",
        source_url: "",
        error: "Invalid WordPress media ID",
      });
      onProgress?.({
        event: "item",
        current,
        total,
        wordpress_id: wid,
        title: "",
        step: "complete",
        error: "Invalid WordPress media ID",
      });
      continue;
    }
    onProgress?.({
      event: "item",
      current,
      total,
      wordpress_id: wid,
      title: `Media ${wid}`,
      step: "start",
    });
    try {
      const raw = await wpFetchMediaById(wpOrigin, wpAuthHeader, idNum);
      if (!raw) {
        rows.push({ wordpress_id: wid, title: "", source_url: "", error: "WordPress media not found" });
        onProgress?.({
          event: "item",
          current,
          total,
          wordpress_id: wid,
          title: "",
          step: "complete",
          error: "WordPress media not found",
        });
        continue;
      }
      const sourceUrl = typeof raw.source_url === "string" ? raw.source_url : "";
      const titleRendered =
        typeof raw.title?.rendered === "string" ? raw.title.rendered.replace(/<[^>]+>/g, "").trim() : "";
      const slug = typeof raw.slug === "string" ? raw.slug : "";
      const title = titleRendered || slug || `attachment-${wid}`;
      if (!sourceUrl) {
        rows.push({ wordpress_id: wid, title, source_url: "", error: "Missing source_url from WordPress" });
        onProgress?.({
          event: "item",
          current,
          total,
          wordpress_id: wid,
          title,
          step: "complete",
          error: "Missing source_url from WordPress",
        });
        continue;
      }
      const mime = (raw as { mime_type?: string }).mime_type || "";
      if (mime && !mime.includes("pdf")) {
        rows.push({
          wordpress_id: wid,
          title,
          source_url: sourceUrl,
          error: `Not a PDF in WordPress (mime: ${mime || "unknown"})`,
        });
        onProgress?.({
          event: "item",
          current,
          total,
          wordpress_id: wid,
          title,
          step: "complete",
          error: `Not a PDF (mime: ${mime || "unknown"})`,
        });
        continue;
      }
      const filename = basenameFromSourceUrl(sourceUrl, slug || title || wid);
      const hit = lookupShopifyPdfInIndex(index, filename);
      if (!hit) {
        rows.push({
          wordpress_id: wid,
          title,
          source_url: sourceUrl,
          error: "No matching PDF found in Shopify Files (index recent uploads; run again or widen search).",
        });
        onProgress?.({
          event: "item",
          current,
          total,
          wordpress_id: wid,
          title,
          step: "complete",
          error: "No matching Shopify file",
        });
        continue;
      }
      const shopifyUrl = await resolveUrlFromIndexEntry(shopDomain, accessToken, hit);
      const redirectPath = redirectPathFromWordPressUrl(sourceUrl);
      let redirectCreated = false;
      if (createRedirects && redirectPath) {
        try {
          await createShopifyUrlRedirect(shopDomain, accessToken, redirectPath, shopifyUrl);
          redirectCreated = true;
        } catch (re) {
          rows.push({
            wordpress_id: wid,
            title,
            source_url: sourceUrl,
            shopify_file_url: shopifyUrl,
            redirect_path: redirectPath,
            redirect_created: false,
            note: "Resolved existing Shopify file (no upload)",
            error: `URL resolved; redirect failed: ${(re as Error).message}`,
          });
          csvLines.push(`"${redirectPath.replace(/"/g, '""')}","${shopifyUrl.replace(/"/g, '""')}"`);
          onProgress?.({
            event: "item",
            current,
            total,
            wordpress_id: wid,
            title,
            step: "complete",
            shopify_file_url: shopifyUrl,
            error: `Redirect failed: ${(re as Error).message}`,
          });
          continue;
        }
      }
      if (createRedirects && redirectPath) {
        csvLines.push(`"${redirectPath.replace(/"/g, '""')}","${shopifyUrl.replace(/"/g, '""')}"`);
      }
      rows.push({
        wordpress_id: wid,
        title,
        source_url: sourceUrl,
        shopify_file_url: shopifyUrl,
        redirect_path: redirectPath ?? undefined,
        redirect_created: redirectCreated,
        note: "Resolved existing Shopify file (no upload)",
      });
      onProgress?.({
        event: "item",
        current,
        total,
        wordpress_id: wid,
        title,
        step: "complete",
        shopify_file_url: shopifyUrl,
      });
    } catch (e) {
      const msg = (e as Error).message;
      rows.push({ wordpress_id: wid, title: "", source_url: "", error: msg });
      onProgress?.({
        event: "item",
        current,
        total,
        wordpress_id: wid,
        title: "",
        step: "complete",
        error: msg,
      });
    }
  }
  return { rows, redirect_csv: csvLines.join("\n"), truncated: false };
}

async function fetchPdfBuffer(sourceUrl: string, wpAuthHeader: string | null): Promise<Buffer> {
  const headers: Record<string, string> = {};
  if (wpAuthHeader) headers.Authorization = wpAuthHeader;
  const r = await fetch(sourceUrl, { method: "GET", headers, redirect: "follow" });
  if (!r.ok) {
    throw new Error(`Download ${sourceUrl}: HTTP ${r.status}`);
  }
  const mime = r.headers.get("content-type") || "";
  if (!mime.includes("pdf") && !mime.includes("octet-stream")) {
    // Some servers omit pdf; still allow if URL ends with .pdf
    if (!sourceUrl.toLowerCase().includes(".pdf")) {
      throw new Error(`Unexpected content-type: ${mime || "unknown"}`);
    }
  }
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Upload selected PDFs from WordPress media library to Shopify Files; optionally add URL redirects on the Shopify store.
 * When `wordpressIdsInOrder` is set, only those attachment IDs are processed in that order (same list as step-3 PDF preview / in-scope).
 */
export async function migrateWordPressPdfsToShopify(opts: {
  wpOrigin: string;
  wpAuthHeader: string | null;
  shopDomain: string;
  accessToken: string;
  excludedIds: Set<string>;
  maxFiles: number;
  createRedirects: boolean;
  /** If true, index recent Shopify Files and skip upload when a matching PDF already exists. */
  skipIfExistsInShopify?: boolean;
  onProgress?: (e: PdfMigrationProgressEvent) => void;
  /** WordPress media IDs to import (after exclusions), in preview order — matches dry-run in-scope PDFs. */
  wordpressIdsInOrder?: string[];
}): Promise<PdfMigrationResult> {
  const {
    wpOrigin,
    wpAuthHeader,
    shopDomain,
    accessToken,
    excludedIds,
    maxFiles,
    createRedirects,
    skipIfExistsInShopify = false,
    onProgress,
    wordpressIdsInOrder,
  } = opts;

  const rows: PdfMigrationRowResult[] = [];
  const csvLines: string[] = ["Redirect from,Redirect to"];
  let truncated = false;

  const shopifyPdfIndex = skipIfExistsInShopify
    ? await buildShopifyPdfBasenameIndex(shopDomain, accessToken, 100)
    : null;

  async function ingestWordPressPdfAttachment(
    raw: WpMediaRow,
    processed: number,
    progressTotal: number,
  ): Promise<void> {
    const id = String(raw.id);
    const sourceUrl = typeof raw.source_url === "string" ? raw.source_url : "";
    const titleRendered =
      typeof raw.title?.rendered === "string"
        ? raw.title.rendered.replace(/<[^>]+>/g, "").trim()
        : "";
    const slug = typeof raw.slug === "string" ? raw.slug : "";
    const title = titleRendered || slug || `attachment-${id}`;

    if (!sourceUrl) {
      rows.push({ wordpress_id: id, title, source_url: "", error: "Missing source_url from WordPress" });
      onProgress?.({
        event: "item",
        current: processed,
        total: progressTotal,
        wordpress_id: id,
        title,
        step: "complete",
        error: "Missing source_url from WordPress",
      });
      return;
    }

    const filename = basenameFromSourceUrl(sourceUrl, slug || title || id);

    onProgress?.({
      event: "item",
      current: processed,
      total: progressTotal,
      wordpress_id: id,
      title,
      step: "start",
    });

    try {
      if (shopifyPdfIndex) {
        const hit = lookupShopifyPdfInIndex(shopifyPdfIndex, filename);
        if (hit) {
          try {
            const shopifyUrl = await resolveUrlFromIndexEntry(shopDomain, accessToken, hit);
            const redirectPath = redirectPathFromWordPressUrl(sourceUrl);
            let redirectCreated = false;
            if (createRedirects && redirectPath) {
              try {
                await createShopifyUrlRedirect(shopDomain, accessToken, redirectPath, shopifyUrl);
                redirectCreated = true;
              } catch (re) {
                rows.push({
                  wordpress_id: id,
                  title,
                  source_url: sourceUrl,
                  shopify_file_url: shopifyUrl,
                  redirect_path: redirectPath,
                  redirect_created: false,
                  note: "Matched existing Shopify file (no upload)",
                  error: `URL linked; redirect failed: ${(re as Error).message}`,
                });
                csvLines.push(`"${redirectPath.replace(/"/g, '""')}","${shopifyUrl.replace(/"/g, '""')}"`);
                onProgress?.({
                  event: "item",
                  current: processed,
                  total: progressTotal,
                  wordpress_id: id,
                  title,
                  step: "complete",
                  shopify_file_url: shopifyUrl,
                  error: `URL linked; redirect failed: ${(re as Error).message}`,
                });
                return;
              }
            }
            if (createRedirects && redirectPath) {
              csvLines.push(`"${redirectPath.replace(/"/g, '""')}","${shopifyUrl.replace(/"/g, '""')}"`);
            }
            rows.push({
              wordpress_id: id,
              title,
              source_url: sourceUrl,
              shopify_file_url: shopifyUrl,
              redirect_path: redirectPath ?? undefined,
              redirect_created: redirectCreated,
              note: "Matched existing Shopify file (no upload)",
            });
            onProgress?.({
              event: "item",
              current: processed,
              total: progressTotal,
              wordpress_id: id,
              title,
              step: "complete",
              shopify_file_url: shopifyUrl,
            });
            return;
          } catch {
            /* no usable URL yet — fall through to upload */
          }
        }
      }
      const buffer = await fetchPdfBuffer(sourceUrl, wpAuthHeader);
      if (buffer.length > 50 * 1024 * 1024) {
        rows.push({
          wordpress_id: id,
          title,
          source_url: sourceUrl,
          error: "File larger than 50MB (skipped)",
        });
        onProgress?.({
          event: "item",
          current: processed,
          total: progressTotal,
          wordpress_id: id,
          title,
          step: "complete",
          error: "File larger than 50MB (skipped)",
        });
        return;
      }
      const shopifyUrl = await stagedUploadAndCreateFile(shopDomain, accessToken, buffer, filename);
      const redirectPath = redirectPathFromWordPressUrl(sourceUrl);
      let redirectCreated = false;
      if (createRedirects && redirectPath) {
        try {
          await createShopifyUrlRedirect(shopDomain, accessToken, redirectPath, shopifyUrl);
          redirectCreated = true;
        } catch (re) {
          rows.push({
            wordpress_id: id,
            title,
            source_url: sourceUrl,
            shopify_file_url: shopifyUrl,
            redirect_path: redirectPath,
            redirect_created: false,
            error: `Uploaded; redirect failed: ${(re as Error).message}`,
          });
          csvLines.push(`"${redirectPath.replace(/"/g, '""')}","${shopifyUrl.replace(/"/g, '""')}"`);
          onProgress?.({
            event: "item",
            current: processed,
            total: progressTotal,
            wordpress_id: id,
            title,
            step: "complete",
            shopify_file_url: shopifyUrl,
            error: `Uploaded; redirect failed: ${(re as Error).message}`,
          });
          return;
        }
      }
      if (createRedirects && redirectPath) {
        csvLines.push(`"${redirectPath.replace(/"/g, '""')}","${shopifyUrl.replace(/"/g, '""')}"`);
      }
      rows.push({
        wordpress_id: id,
        title,
        source_url: sourceUrl,
        shopify_file_url: shopifyUrl,
        redirect_path: redirectPath ?? undefined,
        redirect_created: redirectCreated,
      });
      onProgress?.({
        event: "item",
        current: processed,
        total: progressTotal,
        wordpress_id: id,
        title,
        step: "complete",
        shopify_file_url: shopifyUrl,
      });
    } catch (e) {
      const msg = (e as Error).message;
      rows.push({
        wordpress_id: id,
        title,
        source_url: sourceUrl,
        error: msg,
      });
      onProgress?.({
        event: "item",
        current: processed,
        total: progressTotal,
        wordpress_id: id,
        title,
        step: "complete",
        error: msg,
      });
    }
  }

  if (wordpressIdsInOrder?.length) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const x of wordpressIdsInOrder) {
      const s = String(x).trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      if (excludedIds.has(s)) continue;
      ordered.push(s);
    }
    const limit = Math.min(2000, maxFiles);
    const capped = ordered.slice(0, limit);
    truncated = ordered.length > capped.length;
    const progressTotal = Math.max(1, capped.length);
    onProgress?.({
      event: "init",
      total: progressTotal,
      pdf_total_in_wordpress: capped.length,
      max_files: limit,
    });
    let processed = 0;
    for (const idStr of capped) {
      processed += 1;
      const idNum = parseInt(idStr, 10);
      if (!Number.isFinite(idNum)) {
        rows.push({ wordpress_id: idStr, title: "", source_url: "", error: "Invalid WordPress media ID" });
        onProgress?.({
          event: "item",
          current: processed,
          total: progressTotal,
          wordpress_id: idStr,
          title: "",
          step: "complete",
          error: "Invalid WordPress media ID",
        });
        continue;
      }
      let raw: WpMediaRow | null;
      try {
        raw = await wpFetchMediaById(wpOrigin, wpAuthHeader, idNum);
      } catch (e) {
        const msg = (e as Error).message;
        rows.push({ wordpress_id: idStr, title: "", source_url: "", error: msg });
        onProgress?.({
          event: "item",
          current: processed,
          total: progressTotal,
          wordpress_id: idStr,
          title: "",
          step: "complete",
          error: msg,
        });
        continue;
      }
      if (!raw) {
        rows.push({ wordpress_id: idStr, title: "", source_url: "", error: "WordPress media not found" });
        onProgress?.({
          event: "item",
          current: processed,
          total: progressTotal,
          wordpress_id: idStr,
          title: "",
          step: "complete",
          error: "WordPress media not found",
        });
        continue;
      }
      const mime = raw.mime_type || "";
      if (mime && !mime.includes("pdf")) {
        const t =
          (typeof raw.title?.rendered === "string" ? raw.title.rendered.replace(/<[^>]+>/g, "").trim() : "") ||
          (typeof raw.slug === "string" ? raw.slug : "") ||
          `attachment-${idStr}`;
        const su = typeof raw.source_url === "string" ? raw.source_url : "";
        rows.push({
          wordpress_id: idStr,
          title: t,
          source_url: su,
          error: "WordPress attachment is not application/pdf",
        });
        onProgress?.({
          event: "item",
          current: processed,
          total: progressTotal,
          wordpress_id: idStr,
          title: t,
          step: "complete",
          error: "WordPress attachment is not application/pdf",
        });
        continue;
      }
      await ingestWordPressPdfAttachment(raw, processed, progressTotal);
    }
    return {
      rows,
      redirect_csv: csvLines.join("\n"),
      truncated,
    };
  }

  const perPage = 50;
  let page = 1;
  let totalPages = 1;
  let processed = 0;

  const { total: pdfTotalInWordpress } = await wpFetchPdfMediaPage(wpOrigin, wpAuthHeader, 1, 1);
  const progressTotal = Math.min(maxFiles, Math.max(1, pdfTotalInWordpress));
  onProgress?.({
    event: "init",
    total: progressTotal,
    pdf_total_in_wordpress: pdfTotalInWordpress,
    max_files: maxFiles,
  });

  outer: while (page <= totalPages) {
    const { rows: batch, totalPages: tp } = await wpFetchPdfMediaPageWithRetry(wpOrigin, wpAuthHeader, page, perPage);
    totalPages = tp;
    for (const raw of batch) {
      const id = String(raw.id);
      if (excludedIds.has(id)) continue;
      if (processed >= maxFiles) {
        truncated = true;
        break outer;
      }
      processed += 1;
      await ingestWordPressPdfAttachment(raw, processed, progressTotal);
    }
    page += 1;
  }

  return {
    rows,
    redirect_csv: csvLines.join("\n"),
    truncated,
  };
}
