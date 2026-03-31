/**
 * HTTP handlers for /v1/wp-shopify-migration/* (wizard crawl, dry run, preview, run, PDF import, etc.).
 */

import type { Request, Response } from "express";
import { withTransaction } from "../../db.js";
import { hasShopifyCredentialsForBrand } from "../../shopify-brand-connector.js";
import { enqueueWpShopifyWizardJob } from "../../wp-shopify-migration-pipeline.js";
import { parseWizardJobPayload } from "../../wp-shopify-migration-wizard-parse.js";

/** WP → Shopify migration wizard — Step 1: enqueue source crawl (`wp_shopify_wizard_job` → artifact `wp_shopify_source_crawl`). Requires brand_id. */
export async function wpShopifyMigrationCrawl(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const env = body.environment;
    const environment = env === "staging" || env === "prod" ? env : "sandbox";
    const payload = parseWizardJobPayload({ ...body, kind: "source_crawl" });
    const out = await enqueueWpShopifyWizardJob({ brandId: payload.brand_id, environment, payload });
    res.json({
      ...out,
      message: "Crawl queued. Poll GET /v1/runs/:run_id; artifact type wp_shopify_source_crawl contains urls and stats.",
    });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("required") || msg.includes("http") || msg.includes("brand_id")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

/** Unified orchestration entry: any wizard pipeline action (steps 1–9). POST body must include `kind` and `brand_id`. */
export async function wpShopifyMigrationWizardJob(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const env = body.environment;
    const environment = env === "staging" || env === "prod" ? env : "sandbox";
    const payload = parseWizardJobPayload(body);
    const out = await enqueueWpShopifyWizardJob({ brandId: payload.brand_id, environment, payload });
    res.status(201).json({
      ...out,
      kind: payload.kind,
      message: `Wizard job ${payload.kind} queued. Poll GET /v1/runs/:run_id for completion and artifacts.`,
    });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("required") || msg.includes("Unknown") || msg.includes("must be") || msg.includes("At most")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

/** WP → Shopify migration wizard — Step 3: Dry run (preview counts). Enqueues `wp_shopify_wizard_job`; poll GET /v1/runs/:run_id and read artifact `wp_shopify_migration_dry_run`. */
export async function wpShopifyMigrationDryRun(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const env = body.environment;
    const environment = env === "staging" || env === "prod" ? env : "sandbox";
    const payload = parseWizardJobPayload({ ...body, kind: "dry_run" });
    const out = await enqueueWpShopifyWizardJob({ brandId: payload.brand_id, environment, payload });
    res.json({
      ...out,
      message:
        "Dry run queued. Poll GET /v1/runs/:run_id until status is succeeded or failed; artifact type wp_shopify_migration_dry_run contains counts.",
    });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("required") || msg.includes("Unknown")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

/** WP → Shopify migration wizard — Step 3: Paginated preview (pipeline). Poll artifact `wp_shopify_migration_preview`. */
export async function wpShopifyMigrationPreviewItems(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const env = body.environment;
    const environment = env === "staging" || env === "prod" ? env : "sandbox";
    const payload = parseWizardJobPayload({ ...body, kind: "migration_preview" });
    const out = await enqueueWpShopifyWizardJob({ brandId: payload.brand_id, environment, payload });
    res.json({
      ...out,
      message: "Preview queued. Poll GET /v1/runs/:run_id; artifact type wp_shopify_migration_preview has items, total, page, per_page, scope_note.",
    });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("required") || msg.includes("entity") || msg.includes("Unknown")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

/** WP → Shopify migration wizard — Step 3 / launch: enqueue entity-aware migration run (`wp_shopify_migration_run` artifact: PDFs, blog tag export, pending ETL notes). */
export async function wpShopifyMigrationRun(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const env = body.environment;
    const environment = env === "staging" || env === "prod" ? env : "sandbox";
    const payload = parseWizardJobPayload({ ...body, kind: "migration_run_placeholder" });
    const out = await enqueueWpShopifyWizardJob({ brandId: payload.brand_id, environment, payload });
    res.json({
      ...out,
      message:
        "Migration run queued. Poll GET /v1/runs/:run_id; artifact wp_shopify_migration_run contains per-entity results and any pending ETL notes.",
    });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("required") || msg.includes("Unknown")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

/** WP → Shopify migration — enqueue PDF import as `wp_shopify_wizard_job` (artifact `wp_shopify_pdf_import`). Poll GET /v1/runs/:run_id. */
export async function wpShopifyMigrationMigratePdfs(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    if (body.stream_progress === true) {
      res.status(400).json({
        error:
          "stream_progress is no longer supported. PDF import runs on the pipeline runner; omit stream_progress and poll GET /v1/runs/:run_id for artifact wp_shopify_pdf_import.",
      });
      return;
    }
    const payload = parseWizardJobPayload({ ...body, kind: "pdf_import" });
    const hasShopify = await withTransaction((client) => hasShopifyCredentialsForBrand(client, payload.brand_id));
    if (!hasShopify) {
      res.status(400).json({
        error: "This brand has no Shopify connector. Connect Shopify in Brands → Edit this brand → Shopify.",
      });
      return;
    }
    const env = body.environment;
    const environment = env === "staging" || env === "prod" ? env : "sandbox";
    const out = await enqueueWpShopifyWizardJob({ brandId: payload.brand_id, environment, payload });
    res.json({
      ...out,
      message:
        "PDF import queued. Poll GET /v1/runs/:run_id until succeeded or failed; artifact type wp_shopify_pdf_import contains rows and redirect_csv.",
    });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("required") || msg.includes("Unknown")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

/** WP → Shopify migration — enqueue PDF URL resolve (no upload) as `wp_shopify_wizard_job` (artifact `wp_shopify_pdf_resolve`). */
export async function wpShopifyMigrationResolvePdfUrls(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    if (body.stream_progress === true) {
      res.status(400).json({
        error:
          "stream_progress is no longer supported. Resolve runs on the pipeline runner; poll GET /v1/runs/:run_id for artifact wp_shopify_pdf_resolve.",
      });
      return;
    }
    const payload = parseWizardJobPayload({ ...body, kind: "pdf_resolve" });
    const hasShopify = await withTransaction((client) => hasShopifyCredentialsForBrand(client, payload.brand_id));
    if (!hasShopify) {
      res.status(400).json({
        error: "This brand has no Shopify connector. Connect Shopify in Brands → Edit this brand → Shopify.",
      });
      return;
    }
    const env = body.environment;
    const environment = env === "staging" || env === "prod" ? env : "sandbox";
    const out = await enqueueWpShopifyWizardJob({ brandId: payload.brand_id, environment, payload });
    res.json({
      ...out,
      message:
        "PDF resolve queued. Poll GET /v1/runs/:run_id until succeeded or failed; artifact type wp_shopify_pdf_resolve contains rows and redirect_csv.",
    });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("required") || msg.includes("wordpress_ids") || msg.includes("At most") || msg.includes("Unknown")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}
