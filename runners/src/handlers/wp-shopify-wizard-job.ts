/**
 * WP → Shopify migration wizard: all orchestrated steps run through this job type and write artifacts.
 */

import type pg from "pg";
import type { JobContext } from "../job-context.js";
import {
  migrateWordPressPdfsToShopify,
  resolveWordPressPdfUrlsFromShopify,
  pdfMigrationSummaryAndHint,
} from "../../../control-plane/src/wp-shopify-migration-pdf-shopify.js";
import { executeWpShopifyMigrationDryRun } from "../../../control-plane/src/wp-shopify-migration-dry-run-execute.js";
import { runMigrationCrawl } from "../../../control-plane/src/wp-shopify-migration-crawl.js";
import { executeMigrationPreviewItems } from "../../../control-plane/src/wp-shopify-migration-preview-items-execute.js";
import { executeWizardMigrationRun } from "../../../control-plane/src/wp-shopify-migration-run-execute.js";
import {
  stripWizardJobPayloadFromInitiative,
  type WpShopifyWizardJobPayload,
} from "../../../control-plane/src/wp-shopify-migration-pipeline.js";
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
  const payload = (jobs as Record<string, unknown>)[runId];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`No wizard job payload for run_id=${runId}`);
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
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'data', $5, $6::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, artifactType, uri, JSON.stringify(metadata)],
  );
}

export async function handleWpShopifyWizardJob(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const initiativeId = context.initiative_id;
  if (!initiativeId) throw new Error("wp_shopify_wizard_job requires initiative_id");

  const payload = await loadPayload(client, initiativeId, params.runId);
  const brandId = String(payload.brand_id ?? "").trim();
  if (!brandId) throw new Error("wizard job payload missing brand_id");

  try {
    const kind = String(payload.kind ?? "");

    if (kind === "source_crawl") {
      const source_url = String(payload.source_url ?? "").trim();
      const result = await runMigrationCrawl({
        source_url,
        use_link_crawl: Boolean(payload.use_link_crawl),
        max_urls: Math.min(5000, Math.max(1, Number(payload.max_urls) || 2000)),
        crawl_delay_ms: Number.isFinite(Number(payload.crawl_delay_ms)) ? Math.max(0, Number(payload.crawl_delay_ms)) : 500,
        fetch_page_details: Boolean(payload.fetch_page_details),
      });
      await insertDataArtifact(client, params, "wp_shopify_source_crawl", result as unknown as Record<string, unknown>);
      return;
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

    if (kind === "migration_run_placeholder") {
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

      let shopDomain: string | null = null;
      let shopAccessToken: string | null = null;
      if (entities.includes("pdfs")) {
        const sm = await getShopifyShopForBrand(client, brandId);
        const tp = await getShopifyAccessTokenForBrand(client, brandId);
        if (!sm || !tp?.access_token) {
          throw new Error("Shopify must be connected to migrate PDFs (Brands → Edit brand → Shopify).");
        }
        shopDomain = sm.shop_domain;
        shopAccessToken = tp.access_token;
      }

      const maxRaw = Number(payload.max_files);
      const maxPdfFiles = Number.isFinite(maxRaw) ? Math.min(2000, Math.max(1, maxRaw)) : 500;
      const artifact = await executeWizardMigrationRun({
        server,
        wpAuthHeader: wpAuth,
        shopDomain,
        shopAccessToken,
        entities,
        excludedByEntity,
        maxPdfFiles,
        createRedirects: payload.create_redirects !== false,
        skipIfExistsInShopify: payload.skip_if_exists_in_shopify === true,
      });
      await insertDataArtifact(client, params, "wp_shopify_migration_run", artifact);
      return;
    }

    const shopMeta = await getShopifyShopForBrand(client, brandId);
    const tokenPack = await getShopifyAccessTokenForBrand(client, brandId);
    if (!shopMeta || !tokenPack?.access_token) {
      throw new Error("Could not obtain Shopify access token for this brand");
    }

    if (kind === "pdf_import") {
      const excludedIds = new Set(
        Array.isArray(payload.excluded_ids) ? (payload.excluded_ids as unknown[]).map((x) => String(x)) : [],
      );
      const maxRaw = Number(payload.max_files);
      const maxFiles = Number.isFinite(maxRaw) ? Math.min(2000, Math.max(1, maxRaw)) : 500;
      const createRedirects = payload.create_redirects !== false;
      const result = await migrateWordPressPdfsToShopify({
        wpOrigin: server,
        wpAuthHeader: wpAuth,
        shopDomain: shopMeta.shop_domain,
        accessToken: tokenPack.access_token,
        excludedIds,
        maxFiles,
        createRedirects,
        skipIfExistsInShopify: payload.skip_if_exists_in_shopify === true,
      });
      const { summary, hint } = pdfMigrationSummaryAndHint(result);
      await insertDataArtifact(client, params, "wp_shopify_pdf_import", {
        rows: result.rows,
        redirect_csv: result.redirect_csv,
        truncated: result.truncated,
        summary,
        hint,
      });
      return;
    }

    if (kind === "pdf_resolve") {
      const wordpressIds = Array.isArray(payload.wordpress_ids)
        ? (payload.wordpress_ids as unknown[]).map((x) => String(x))
        : [];
      if (wordpressIds.length === 0) throw new Error("pdf_resolve requires wordpress_ids");
      const createRedirects = payload.create_redirects !== false;
      const result = await resolveWordPressPdfUrlsFromShopify({
        wpOrigin: server,
        wpAuthHeader: wpAuth,
        shopDomain: shopMeta.shop_domain,
        accessToken: tokenPack.access_token,
        wordpressIds,
        createRedirects,
      });
      const { summary, hint } = pdfMigrationSummaryAndHint(result);
      await insertDataArtifact(client, params, "wp_shopify_pdf_resolve", {
        rows: result.rows,
        redirect_csv: result.redirect_csv,
        truncated: result.truncated,
        summary,
        hint,
      });
      return;
    }

    throw new Error(`Unknown wizard job kind: ${kind}`);
  } finally {
    await stripWizardJobPayloadFromInitiative(client, initiativeId, params.runId);
  }
}
