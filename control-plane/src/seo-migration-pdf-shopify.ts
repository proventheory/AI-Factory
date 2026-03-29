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
  const cdnUrl = file?.url;
  if (!cdnUrl) {
    throw new Error(`Shopify fileCreate returned no URL (status ${file?.fileStatus ?? "unknown"})`);
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
};

export type PdfMigrationResult = {
  rows: PdfMigrationRowResult[];
  redirect_csv: string;
  truncated: boolean;
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
 */
export async function migrateWordPressPdfsToShopify(opts: {
  wpOrigin: string;
  wpAuthHeader: string | null;
  shopDomain: string;
  accessToken: string;
  excludedIds: Set<string>;
  maxFiles: number;
  createRedirects: boolean;
}): Promise<PdfMigrationResult> {
  const { wpOrigin, wpAuthHeader, shopDomain, accessToken, excludedIds, maxFiles, createRedirects } = opts;
  const perPage = 50;
  let page = 1;
  let totalPages = 1;
  const rows: PdfMigrationRowResult[] = [];
  const csvLines: string[] = ["Redirect from,Redirect to"];
  let truncated = false;
  let processed = 0;

  outer: while (page <= totalPages) {
    const { rows: batch, totalPages: tp } = await wpFetchPdfMediaPage(wpOrigin, wpAuthHeader, page, perPage);
    totalPages = tp;
    for (const raw of batch) {
      const id = String(raw.id);
      if (excludedIds.has(id)) continue;
      if (processed >= maxFiles) {
        truncated = true;
        break outer;
      }
      processed += 1;

      const sourceUrl = typeof raw.source_url === "string" ? raw.source_url : "";
      const titleRendered =
        typeof raw.title?.rendered === "string"
          ? raw.title.rendered.replace(/<[^>]+>/g, "").trim()
          : "";
      const slug = typeof raw.slug === "string" ? raw.slug : "";
      const title = titleRendered || slug || `attachment-${id}`;

      if (!sourceUrl) {
        rows.push({ wordpress_id: id, title, source_url: "", error: "Missing source_url from WordPress" });
        continue;
      }

      const filename = basenameFromSourceUrl(sourceUrl, slug || title || id);

      try {
        const buffer = await fetchPdfBuffer(sourceUrl, wpAuthHeader);
        if (buffer.length > 50 * 1024 * 1024) {
          rows.push({
            wordpress_id: id,
            title,
            source_url: sourceUrl,
            error: "File larger than 50MB (skipped)",
          });
          continue;
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
            continue;
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
      } catch (e) {
        rows.push({
          wordpress_id: id,
          title,
          source_url: sourceUrl,
          error: (e as Error).message,
        });
      }
    }
    page += 1;
  }

  return {
    rows,
    redirect_csv: csvLines.join("\n"),
    truncated,
  };
}
