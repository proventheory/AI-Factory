/**
 * WP → Shopify migration wizard: all orchestrated steps run through this job type and write artifacts.
 */

import type pg from "pg";
import type { Pool } from "pg";

function createWizardProgressReporter(pool: Pool | undefined, jobRunId: string | undefined) {
  let lastWrite = 0;
  return async (payload: Record<string, unknown>) => {
    if (!pool || !jobRunId?.trim()) return;
    const force = payload.force === true;
    const now = Date.now();
    const hasNumericProgress =
      payload.blogs != null || payload.pdfs != null || payload.blog_tags != null || payload.crawl != null;
    const minGapMs = hasNumericProgress ? 750 : 2000;
    if (!force && now - lastWrite < minGapMs) return;
    lastWrite = now;
    const { force: _f, ...rest } = payload;
    try {
      await pool.query(
        `INSERT INTO job_events (job_run_id, event_type, payload_json) VALUES ($1::uuid, 'wizard_progress', $2::jsonb)`,
        [jobRunId, JSON.stringify(rest)],
      );
    } catch (e) {
      console.warn("[wp_shopify_wizard_job] wizard_progress insert:", (e as Error).message);
    }
  };
}

function pdfProgressToWizardPayload(ev: PdfMigrationProgressEvent): Record<string, unknown> | null {
  if (ev.event === "init") {
    return { phase: "pdfs", pdfs: { current: 0, total: ev.total }, force: true };
  }
  if (ev.event === "item" && ev.step === "start") {
    // So the UI moves while a single PDF is uploading / waiting on Shopify file URL (can be ~2min); complete-only looked “stuck”.
    return { phase: "pdfs", pdfs: { current: ev.current, total: ev.total }, phase_detail: "uploading" };
  }
  if (ev.event === "item" && ev.step === "complete") {
    return { phase: "pdfs", pdfs: { current: ev.current, total: ev.total }, force: true };
  }
  return null;
}
import type { JobContext } from "../job-context.js";
import {
  migrateWordPressPdfsToShopify,
  resolveWordPressPdfUrlsFromShopify,
  pdfMigrationSummaryAndHint,
  type PdfMigrationProgressEvent,
} from "../../../control-plane/src/wp-shopify-migration-pdf-shopify.js";
import { executeWpShopifyMigrationDryRun } from "../../../control-plane/src/wp-shopify-migration-dry-run-execute.js";
import { runMigrationCrawl } from "../../../control-plane/src/wp-shopify-migration-crawl.js";
import { executeMigrationPreviewItems } from "../../../control-plane/src/wp-shopify-migration-preview-items-execute.js";
import { executeWizardMigrationRun } from "../../../control-plane/src/wp-shopify-migration-run-execute.js";
import {
  stripWizardJobPayloadFromInitiative,
  type WpShopifyWizardJobPayload,
} from "../../../control-plane/src/wp-shopify-migration-pipeline.js";

function shopifyPrefetchedFromPayload(payload: WpShopifyWizardJobPayload): { shop_domain: string; access_token: string } | null {
  const tok =
    typeof payload._prefetched_shopify_access_token === "string" ? payload._prefetched_shopify_access_token.trim() : "";
  const dom =
    typeof payload._prefetched_shopify_shop_domain === "string" ? payload._prefetched_shopify_shop_domain.trim() : "";
  if (!tok || !dom) return null;
  return { shop_domain: dom, access_token: tok };
}
import { getWooCommerceCredentialsForBrand } from "../../../control-plane/src/woocommerce-brand-connector.js";
import {
  getShopifyShopForBrand,
  getShopifyAccessTokenForBrand,
} from "../../../control-plane/src/shopify-brand-connector.js";
import { getGoogleAccessTokenFromControlPlaneOrThrow } from "../lib/control-plane-google-token.js";

function wpBasicAuthHeader(user: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${user.replace(/^\s+|\s+$/g, "")}:${appPassword.replace(/\s/g, "")}`, "utf8").toString("base64")}`;
}

async function loadPayload(
  client: pg.PoolClient,
  initiativeId: string,
  runId: string,
  planNodeId: string,
): Promise<WpShopifyWizardJobPayload> {
  const r = await client.query<{ goal_metadata: unknown }>(
    "SELECT goal_metadata FROM initiatives WHERE id = $1",
    [initiativeId],
  );
  const gm = r.rows[0]?.goal_metadata;
  if (!gm || typeof gm !== "object" || Array.isArray(gm)) {
    throw new Error("Initiative goal_metadata missing");
  }
  const jobs = (gm as Record<string, unknown>).wp_shopify_pipeline_jobs;
  if (!jobs || typeof jobs !== "object" || Array.isArray(jobs)) {
    throw new Error("wp_shopify_pipeline_jobs missing on initiative");
  }
  const j = jobs as Record<string, unknown>;
  const byNode = j[planNodeId];
  const byRun = j[runId];
  const payload =
    byNode && typeof byNode === "object" && !Array.isArray(byNode)
      ? byNode
      : byRun && typeof byRun === "object" && !Array.isArray(byRun)
        ? byRun
        : null;
  if (!payload) {
    throw new Error(`No wizard job payload for run_id=${runId} plan_node_id=${planNodeId}`);
  }
  return payload as WpShopifyWizardJobPayload;
}

async function resolveWooFromPayload(
  client: pg.PoolClient,
  brandId: string,
  p: WpShopifyWizardJobPayload,
): Promise<{ server: string; key: string; secret: string }> {
  const ws = String(p.woo_server ?? "").trim();
  const wk = String(p.woo_consumer_key ?? "").trim();
  const wsec = String(p.woo_consumer_secret ?? "").trim();
  if (ws && wk && wsec) {
    return { server: ws.replace(/\/$/, ""), key: wk, secret: wsec };
  }
  const row = await getWooCommerceCredentialsForBrand(client, brandId);
  if (!row) throw new Error("WooCommerce credentials not found for this brand");
  return {
    server: row.store_url.replace(/\/$/, ""),
    key: row.consumer_key,
    secret: row.consumer_secret,
  };
}

async function googleAccessTokenForWizard(
  payload: WpShopifyWizardJobPayload,
  initiativeId: string,
): Promise<string> {
  const pre =
    typeof payload._prefetched_google_access_token === "string"
      ? payload._prefetched_google_access_token.trim()
      : "";
  if (pre) return pre;
  return getGoogleAccessTokenFromControlPlaneOrThrow(initiativeId);
}

async function insertDataArtifact(
  client: pg.PoolClient,
  params: { runId: string; jobRunId: string; planNodeId: string },
  artifactType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const uri = `mem://${artifactType}/${params.runId}/${params.planNodeId}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'build_outputs', $5, $6::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, artifactType, uri, JSON.stringify(metadata)],
  );
}

type WizardJobParams = { runId: string; jobRunId: string; planNodeId: string };

/**
 * Long-running migration: do not hold a pool connection during HTTP (blogs/PDFs). Otherwise heartbeats + parallel jobs exhaust the pool → lease_expired mid-import.
 */
export async function executeWpShopifyMigrationRunJob(
  pool: Pool,
  context: JobContext,
  params: WizardJobParams,
): Promise<void> {
  const initiativeId = context.initiative_id;
  if (!initiativeId) throw new Error("wp_shopify_wizard_job requires initiative_id");

  const reportWizardProgress = createWizardProgressReporter(pool, params.jobRunId);

  const read = await pool.connect();
  let payload: WpShopifyWizardJobPayload;
  try {
    payload = await loadPayload(read, initiativeId, params.runId, params.planNodeId);
  } finally {
    read.release();
  }

  const brandId = String(payload.brand_id ?? "").trim();
  if (!brandId) throw new Error("wizard job payload missing brand_id");

  try {
    const branch = typeof payload._migration_parallel_branch === "string" ? payload._migration_parallel_branch.trim() : "";
    if (branch) {
      void reportWizardProgress({
        migration_branch: branch,
        phase_banner:
          branch === "pdfs"
            ? "PDF branch (parallel runner): Shopify Files…"
            : "Content branch (parallel runner): blogs / tags / ETL notes…",
        force: true,
      });
    }

    const wConn = await pool.connect();
    let server: string;
    let key: string;
    let secret: string;
    try {
      const w = await resolveWooFromPayload(wConn, brandId, payload);
      server = w.server;
      key = w.key;
      secret = w.secret;
    } finally {
      wConn.release();
    }
    const wpUser = String(payload.wp_username ?? "").trim();
    const wpPass = String(payload.wp_application_password ?? "").trim();
    const wpAuth = wpUser && wpPass ? wpBasicAuthHeader(wpUser, wpPass) : null;

    const entitiesRaw = Array.isArray(payload.entities) ? (payload.entities as unknown[]) : [];
    const entities = [...new Set(entitiesRaw.map((e) => String(e).trim()).filter(Boolean))];
    if (entities.length === 0) throw new Error("migration_run requires at least one selected entity");

    const excludedRaw =
      payload.excluded_ids_by_entity && typeof payload.excluded_ids_by_entity === "object" && !Array.isArray(payload.excluded_ids_by_entity)
        ? (payload.excluded_ids_by_entity as Record<string, unknown>)
        : {};
    const excludedByEntity: Record<string, Set<string>> = {};
    for (const [k, v] of Object.entries(excludedRaw)) {
      excludedByEntity[k] = new Set(Array.isArray(v) ? v.map((x) => String(x)) : []);
    }

    const needsShopifyPdfs = entities.includes("pdfs");
    const wantsTagRedirects = entities.includes("blog_tags");
    const needsShopifyBlogs = entities.includes("blogs");
    let shopDomain: string | null = null;
    let shopAccessToken: string | null = null;
    if (needsShopifyPdfs || wantsTagRedirects || needsShopifyBlogs) {
      const pre = shopifyPrefetchedFromPayload(payload);
      if (pre) {
        shopDomain = pre.shop_domain;
        shopAccessToken = pre.access_token;
      } else {
        const sConn = await pool.connect();
        try {
          const sm = await getShopifyShopForBrand(sConn, brandId);
          const tp = await getShopifyAccessTokenForBrand(sConn, brandId);
          if (needsShopifyPdfs || needsShopifyBlogs) {
            if (!sm || !tp?.access_token) {
              throw new Error("Shopify must be connected for PDF or blog post import (Brands → Edit brand → Shopify).");
            }
          }
          shopDomain = sm?.shop_domain ?? null;
          shopAccessToken = tp?.access_token ?? null;
        } finally {
          sConn.release();
        }
      }
    }

    const maxRaw = Number(payload.max_files);
    const maxPdfFiles = Number.isFinite(maxRaw) ? Math.min(2000, Math.max(1, maxRaw)) : 500;
    const targetStoreUrl = typeof payload.target_store_url === "string" ? payload.target_store_url.trim() : "";
    const shopifyBlogHandle = typeof payload.shopify_blog_handle === "string" ? payload.shopify_blog_handle.trim() : "";

    const artifact = await executeWizardMigrationRun({
      server,
      wpAuthHeader: wpAuth,
      shopDomain,
      shopAccessToken,
      targetStoreUrl: targetStoreUrl || null,
      shopifyBlogHandle: shopifyBlogHandle || null,
      entities,
      excludedByEntity,
      maxPdfFiles,
      maxBlogPosts: maxPdfFiles,
      createRedirects: payload.create_redirects !== false,
      skipIfExistsInShopify: payload.skip_if_exists_in_shopify === true,
      onPdfProgress: (ev) => {
        const pl = pdfProgressToWizardPayload(ev);
        if (pl) void reportWizardProgress(pl);
      },
      onBlogProgress: (p) => {
        void reportWizardProgress({
          phase: "blogs",
          blogs: {
            current: p.current,
            total: p.total,
            created: p.created,
            skipped: p.skipped,
            failed: p.failed,
          },
          force: true,
        });
      },
      onWizardProgress: (pl) => {
        void reportWizardProgress(pl);
      },
    });

    const ins = await pool.connect();
    try {
      await insertDataArtifact(ins, params, "wp_shopify_migration_run", artifact);
    } finally {
      ins.release();
    }
  } finally {
    const stripC = await pool.connect();
    try {
      await stripWizardJobPayloadFromInitiative(stripC, initiativeId, params.planNodeId, params.runId);
    } catch (stripErr) {
      console.error(
        "[wp_shopify_wizard_job] stripWizardJobPayloadFromInitiative failed (goal_metadata may retain this run key):",
        stripErr instanceof Error ? stripErr.message : stripErr,
      );
    } finally {
      stripC.release();
    }
  }
}

export async function executeWpShopifyPdfImportJob(pool: Pool, context: JobContext, params: WizardJobParams): Promise<void> {
  const initiativeId = context.initiative_id;
  if (!initiativeId) throw new Error("wp_shopify_wizard_job requires initiative_id");
  const reportWizardProgress = createWizardProgressReporter(pool, params.jobRunId);

  const read = await pool.connect();
  let payload: WpShopifyWizardJobPayload;
  try {
    payload = await loadPayload(read, initiativeId, params.runId, params.planNodeId);
  } finally {
    read.release();
  }
  const brandId = String(payload.brand_id ?? "").trim();
  if (!brandId) throw new Error("wizard job payload missing brand_id");

  try {
    const wConn = await pool.connect();
    let server: string;
    let key: string;
    let secret: string;
    try {
      const w = await resolveWooFromPayload(wConn, brandId, payload);
      server = w.server;
      key = w.key;
      secret = w.secret;
    } finally {
      wConn.release();
    }
    const wpUser = String(payload.wp_username ?? "").trim();
    const wpPass = String(payload.wp_application_password ?? "").trim();
    const wpAuth = wpUser && wpPass ? wpBasicAuthHeader(wpUser, wpPass) : null;

    const preShop = shopifyPrefetchedFromPayload(payload);
    let shopDomainPdf: string;
    let shopAccessTokenPdf: string;
    if (preShop) {
      shopDomainPdf = preShop.shop_domain;
      shopAccessTokenPdf = preShop.access_token;
    } else {
      const sConn = await pool.connect();
      try {
        const shopMeta = await getShopifyShopForBrand(sConn, brandId);
        const tokenPack = await getShopifyAccessTokenForBrand(sConn, brandId);
        if (!shopMeta || !tokenPack?.access_token) {
          throw new Error("Could not obtain Shopify access token for this brand");
        }
        shopDomainPdf = shopMeta.shop_domain;
        shopAccessTokenPdf = tokenPack.access_token;
      } finally {
        sConn.release();
      }
    }

    const excludedIds = new Set(
      Array.isArray(payload.excluded_ids) ? (payload.excluded_ids as unknown[]).map((x) => String(x)) : [],
    );
    const maxRaw = Number(payload.max_files);
    const maxFiles = Number.isFinite(maxRaw) ? Math.min(2000, Math.max(1, maxRaw)) : 500;
    const createRedirects = payload.create_redirects !== false;
    const result = await migrateWordPressPdfsToShopify({
      wpOrigin: server,
      wpAuthHeader: wpAuth,
      shopDomain: shopDomainPdf,
      accessToken: shopAccessTokenPdf,
      excludedIds,
      maxFiles,
      createRedirects,
      skipIfExistsInShopify: payload.skip_if_exists_in_shopify === true,
      onProgress: (ev) => {
        const pl = pdfProgressToWizardPayload(ev);
        if (pl) void reportWizardProgress(pl);
      },
    });
    const { summary, hint } = pdfMigrationSummaryAndHint(result);

    const ins = await pool.connect();
    try {
      await insertDataArtifact(ins, params, "wp_shopify_pdf_import", {
        rows: result.rows,
        redirect_csv: result.redirect_csv,
        truncated: result.truncated,
        summary,
        hint,
      });
    } finally {
      ins.release();
    }
  } finally {
    const stripC = await pool.connect();
    try {
      await stripWizardJobPayloadFromInitiative(stripC, initiativeId, params.planNodeId, params.runId);
    } catch (stripErr) {
      console.error(
        "[wp_shopify_wizard_job] stripWizardJobPayloadFromInitiative failed (goal_metadata may retain this run key):",
        stripErr instanceof Error ? stripErr.message : stripErr,
      );
    } finally {
      stripC.release();
    }
  }
}

export async function executeWpShopifyPdfResolveJob(pool: Pool, context: JobContext, params: WizardJobParams): Promise<void> {
  const initiativeId = context.initiative_id;
  if (!initiativeId) throw new Error("wp_shopify_wizard_job requires initiative_id");

  const read = await pool.connect();
  let payload: WpShopifyWizardJobPayload;
  try {
    payload = await loadPayload(read, initiativeId, params.runId, params.planNodeId);
  } finally {
    read.release();
  }
  const brandId = String(payload.brand_id ?? "").trim();
  if (!brandId) throw new Error("wizard job payload missing brand_id");

  try {
    const wConn = await pool.connect();
    let server: string;
    let key: string;
    let secret: string;
    try {
      const w = await resolveWooFromPayload(wConn, brandId, payload);
      server = w.server;
      key = w.key;
      secret = w.secret;
    } finally {
      wConn.release();
    }
    const wpUser = String(payload.wp_username ?? "").trim();
    const wpPass = String(payload.wp_application_password ?? "").trim();
    const wpAuth = wpUser && wpPass ? wpBasicAuthHeader(wpUser, wpPass) : null;

    const preShop = shopifyPrefetchedFromPayload(payload);
    let shopDomainPdf: string;
    let shopAccessTokenPdf: string;
    if (preShop) {
      shopDomainPdf = preShop.shop_domain;
      shopAccessTokenPdf = preShop.access_token;
    } else {
      const sConn = await pool.connect();
      try {
        const shopMeta = await getShopifyShopForBrand(sConn, brandId);
        const tokenPack = await getShopifyAccessTokenForBrand(sConn, brandId);
        if (!shopMeta || !tokenPack?.access_token) {
          throw new Error("Could not obtain Shopify access token for this brand");
        }
        shopDomainPdf = shopMeta.shop_domain;
        shopAccessTokenPdf = tokenPack.access_token;
      } finally {
        sConn.release();
      }
    }

    const wordpressIds = Array.isArray(payload.wordpress_ids)
      ? (payload.wordpress_ids as unknown[]).map((x) => String(x))
      : [];
    if (wordpressIds.length === 0) throw new Error("pdf_resolve requires wordpress_ids");
    const createRedirects = payload.create_redirects !== false;
    const result = await resolveWordPressPdfUrlsFromShopify({
      wpOrigin: server,
      wpAuthHeader: wpAuth,
      shopDomain: shopDomainPdf,
      accessToken: shopAccessTokenPdf,
      wordpressIds,
      createRedirects,
    });
    const { summary, hint } = pdfMigrationSummaryAndHint(result);

    const ins = await pool.connect();
    try {
      await insertDataArtifact(ins, params, "wp_shopify_pdf_resolve", {
        rows: result.rows,
        redirect_csv: result.redirect_csv,
        truncated: result.truncated,
        summary,
        hint,
      });
    } finally {
      ins.release();
    }
  } finally {
    const stripC = await pool.connect();
    try {
      await stripWizardJobPayloadFromInitiative(stripC, initiativeId, params.planNodeId, params.runId);
    } catch (stripErr) {
      console.error(
        "[wp_shopify_wizard_job] stripWizardJobPayloadFromInitiative failed (goal_metadata may retain this run key):",
        stripErr instanceof Error ? stripErr.message : stripErr,
      );
    } finally {
      stripC.release();
    }
  }
}

export async function handleWpShopifyWizardJob(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string; dbPool?: Pool },
): Promise<void> {
  const initiativeId = context.initiative_id;
  if (!initiativeId) throw new Error("wp_shopify_wizard_job requires initiative_id");

  const reportWizardProgress = createWizardProgressReporter(params.dbPool, params.jobRunId);

  const payload = await loadPayload(client, initiativeId, params.runId, params.planNodeId);
  const brandId = String(payload.brand_id ?? "").trim();
  if (!brandId) throw new Error("wizard job payload missing brand_id");

  try {
    const kind = String(payload.kind ?? "");

    // source_crawl is executed via executeWpShopifySourceCrawlJob (no DB transaction across crawl — avoids idle-in-transaction timeouts).
    if (kind === "source_crawl") {
      throw new Error("source_crawl must run via executeWpShopifySourceCrawlJob");
    }

    if (kind === "seo_gsc_report") {
      const site_url = String(payload.site_url ?? "").trim();
      const accessToken = await googleAccessTokenForWizard(payload, initiativeId);
      const { fetchGscReport } = await import("../../../control-plane/src/seo-gsc-ga-client.js");
      const report = await fetchGscReport(site_url, {
        dateRange: String(payload.date_range ?? "last28days"),
        rowLimit: Math.min(1000, Math.max(1, Number(payload.row_limit) || 500)),
        accessToken,
      });
      await insertDataArtifact(client, params, "wp_shopify_seo_gsc_report", report as unknown as Record<string, unknown>);
      return;
    }

    if (kind === "seo_ga4_report") {
      const rowLimit = Math.min(1000, Math.max(1, Number(payload.row_limit) || 500));
      let property_id = String(payload.property_id ?? "").trim();
      const accessToken = await googleAccessTokenForWizard(payload, initiativeId);
      if (!property_id) {
        const r = await client.query<{ ga4_property_id: string | null }>(
          "SELECT ga4_property_id FROM brand_google_credentials WHERE brand_profile_id = $1",
          [brandId],
        );
        const ga4 = r.rows[0]?.ga4_property_id ?? null;
        if (!ga4) throw new Error("No GA4 property selected for this brand");
        property_id = ga4;
      }
      const { fetchGa4Report } = await import("../../../control-plane/src/seo-gsc-ga-client.js");
      const report = await fetchGa4Report(property_id, { rowLimit, accessToken });
      await insertDataArtifact(client, params, "wp_shopify_seo_ga4_report", report as unknown as Record<string, unknown>);
      return;
    }

    if (kind === "seo_keyword_volume") {
      const keywords = Array.isArray(payload.keywords) ? payload.keywords.map((k) => String(k)) : [];
      const { fetchKeywordVolumes } = await import("../../../control-plane/src/seo-keyword-volume.js");
      const merged: { keyword: string; monthly_search_volume: number }[] = [];
      let lastError: string | undefined;
      const chunk = 400;
      for (let i = 0; i < keywords.length; i += chunk) {
        const part = keywords.slice(i, i + chunk);
        const result = await fetchKeywordVolumes(part);
        merged.push(...(result.volumes ?? []));
        if (result.error) lastError = result.error;
      }
      await insertDataArtifact(client, params, "wp_shopify_seo_keyword_volume", {
        volumes: merged,
        generated_at: new Date().toISOString(),
        ...(lastError ? { error: lastError } : {}),
      });
      return;
    }

    if (kind === "wizard_state_snapshot") {
      const stateJson = payload.state_json;
      const serialized = JSON.stringify(stateJson ?? null);
      if (serialized.length > 450_000) {
        throw new Error("state_json too large for a single artifact (max ~450KB JSON); store smaller summaries in summary.");
      }
      await insertDataArtifact(client, params, "wp_shopify_wizard_snapshot", {
        wizard_step: payload.wizard_step,
        previous_step: payload.previous_step ?? null,
        summary: payload.summary,
        state_json: stateJson ?? null,
        generated_at: new Date().toISOString(),
      });
      return;
    }

    if (kind === "migration_preview") {
      const { server, key, secret } = await resolveWooFromPayload(client, brandId, payload);
      const entity = String(payload.entity ?? "").trim();
      const page = Math.max(1, Math.min(500, Number(payload.page) || 1));
      const perPage = Math.max(5, Math.min(100, Number(payload.per_page) || 50));
      const wpUser = String(payload.wp_username ?? "").trim();
      const wpPass = String(payload.wp_application_password ?? "").trim();
      const prev = await executeMigrationPreviewItems({
        server,
        key,
        secret,
        entity,
        page,
        perPage,
        ...(wpUser && wpPass ? { wp_username: wpUser, wp_application_password: wpPass } : {}),
      });
      await insertDataArtifact(client, params, "wp_shopify_migration_preview", prev as unknown as Record<string, unknown>);
      return;
    }

    const { server, key, secret } = await resolveWooFromPayload(client, brandId, payload);
    const wpUser = String(payload.wp_username ?? "").trim();
    const wpPass = String(payload.wp_application_password ?? "").trim();
    const wpAuth = wpUser && wpPass ? wpBasicAuthHeader(wpUser, wpPass) : null;

    if (kind === "dry_run") {
      const entities = Array.isArray(payload.entities) && payload.entities.length > 0 ? (payload.entities as string[]) : ["products", "categories"];
      const counts = await executeWpShopifyMigrationDryRun({
        server,
        key,
        secret,
        entities,
        wpAuthHeader: wpAuth,
      });
      await insertDataArtifact(client, params, "wp_shopify_migration_dry_run", {
        counts,
        generated_at: new Date().toISOString(),
      });
      return;
    }

    throw new Error(
      `Wizard job kind "${kind}" must run via detached pool entrypoint (migration_run / pdf_import / pdf_resolve) — check runner index dispatch.`,
    );
  } finally {
    try {
      await stripWizardJobPayloadFromInitiative(client, initiativeId, params.planNodeId, params.runId);
    } catch (stripErr) {
      // Do not fail the job after a successful crawl/write: same-tx rollback would drop the artifact.
      console.error(
        "[wp_shopify_wizard_job] stripWizardJobPayloadFromInitiative failed (goal_metadata may retain this run key):",
        stripErr instanceof Error ? stripErr.message : stripErr,
      );
    }
  }
}

/** Peek job kind without requiring an open transaction (used by runner index before choosing crawl path). */
export async function peekWpShopifyWizardKind(
  pool: Pool,
  initiativeId: string,
  runId: string,
  planNodeId: string,
): Promise<string> {
  const c = await pool.connect();
  try {
    const p = await loadPayload(c, initiativeId, runId, planNodeId);
    return String(p.kind ?? "");
  } finally {
    c.release();
  }
}

/**
 * Step 1 source crawl: run HTTP crawl off the DB transaction, then commit artifact in a short transaction.
 * Holding a transaction open during link-following crawls hits Postgres idle-in-transaction timeouts and exhausts the pool.
 */
export async function executeWpShopifySourceCrawlJob(
  pool: Pool,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const initiativeId = context.initiative_id;
  if (!initiativeId) throw new Error("wp_shopify_wizard_job requires initiative_id");

  const read = await pool.connect();
  let payload: WpShopifyWizardJobPayload;
  try {
    payload = await loadPayload(read, initiativeId, params.runId, params.planNodeId);
  } finally {
    read.release();
  }

  const brandId = String(payload.brand_id ?? "").trim();
  if (!brandId) throw new Error("wizard job payload missing brand_id");

  const reportWizardProgress = createWizardProgressReporter(pool, params.jobRunId);

  const source_url = String(payload.source_url ?? "").trim();
  const result = await runMigrationCrawl({
    source_url,
    use_link_crawl: Boolean(payload.use_link_crawl),
    max_urls: Math.min(5000, Math.max(1, Number(payload.max_urls) || 2000)),
    crawl_delay_ms: Number.isFinite(Number(payload.crawl_delay_ms)) ? Math.max(0, Number(payload.crawl_delay_ms)) : 500,
    fetch_page_details: Boolean(payload.fetch_page_details),
    onProgress: (p) => {
      void reportWizardProgress({
        phase: "crawl",
        crawl: { current: p.current, total: p.total, detail: p.phase },
        force: p.current <= 1 || p.phase === "discovery_done" || p.current >= p.total,
      });
    },
  });

  const w = await pool.connect();
  try {
    await w.query("BEGIN");
    await insertDataArtifact(w, params, "wp_shopify_source_crawl", result as unknown as Record<string, unknown>);
    await w.query("COMMIT");
  } catch (e) {
    await w.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    w.release();
  }

  // Strip only after a successful artifact write. Stripping on crawl/insert failure removed the payload
  // before retries, so the next attempt could not load kind/payload and the run failed opaquely.
  try {
    const s = await pool.connect();
    try {
      await s.query("BEGIN");
      await stripWizardJobPayloadFromInitiative(s, initiativeId, params.planNodeId, params.runId);
      await s.query("COMMIT");
    } catch (stripErr) {
      await s.query("ROLLBACK").catch(() => {});
      console.error(
        "[wp_shopify_wizard_job] stripWizardJobPayloadFromInitiative failed (goal_metadata may retain this run key):",
        stripErr instanceof Error ? stripErr.message : stripErr,
      );
    } finally {
      s.release();
    }
  } catch (outerStrip) {
    console.error(
      "[wp_shopify_wizard_job] strip payload outer catch:",
      outerStrip instanceof Error ? outerStrip.message : outerStrip,
    );
  }
}
