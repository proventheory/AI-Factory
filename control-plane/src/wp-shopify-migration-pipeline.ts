/**
 * Enqueue WP → Shopify wizard work as a real plan/run/job (runner executes wp_shopify_wizard_job).
 * Per-run payload lives under initiatives.goal_metadata.wp_shopify_pipeline_jobs[run_id] so concurrent runs do not clobber.
 */

import { v4 as uuid } from "uuid";
import type pg from "pg";
import { pool, withTransaction } from "./db.js";
import { compilePlanFromDraft } from "./plan-compiler.js";
import { createRun } from "./scheduler.js";
import { routeRun } from "./release-manager.js";
import { WP_SHOPIFY_MIGRATION_INTENT } from "./lib/intent-type.js";
import { getAccessTokenForInitiative } from "./seo-google-oauth.js";
import { getWooCommerceCredentialsForBrand } from "./woocommerce-brand-connector.js";
import { getShopifyAccessTokenForBrand, getShopifyShopForBrand } from "./shopify-brand-connector.js";

export const WP_SHOPIFY_WIZARD_JOB_TYPE = "wp_shopify_wizard_job" as const;

/**
 * SEO DAG jobs (seo_source_inventory, seo_target_inventory, …) read URLs from initiatives.goal_metadata.
 * The wizard historically stored URLs only on per-run payloads and artifacts, so a compiled wp_shopify_migration
 * plan could start with empty goal_metadata → four root jobs fail the same way. Merge any known URLs whenever
 * we enqueue wizard work so template runs and snapshots stay aligned with the console.
 */
export async function mergeSeoGoalMetadataFromWizardPayload(
  client: pg.PoolClient,
  initiativeId: string,
  brandId: string,
  payload: WpShopifyWizardJobPayload,
): Promise<void> {
  const p = payload as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  const su = String(p.source_url ?? "").trim();
  if (su && /^https?:\/\//i.test(su)) patch.source_url = su.replace(/\/$/, "");

  const gscDirect = String(p.gsc_site_url ?? "").trim();
  if (gscDirect && /^https?:\/\//i.test(gscDirect)) patch.gsc_site_url = gscDirect.replace(/\/$/, "");

  const site = String(p.site_url ?? "").trim();
  if (site && /^https?:\/\//i.test(site)) patch.gsc_site_url = site.replace(/\/$/, "");

  const ts = String(p.target_store_url ?? "").trim();
  if (ts && /^https?:\/\//i.test(ts)) patch.target_url = ts.replace(/\/$/, "");

  const ga4 = String(p.property_id ?? p.ga4_property_id ?? "").trim();
  if (ga4) patch.ga4_property_id = ga4;

  const woo = String(p.woo_server ?? "").trim();
  if (woo && /^https?:\/\//i.test(woo)) {
    const normalized = woo.replace(/\/$/, "");
    if (!patch.source_url) patch.source_url = normalized;
  }

  if (!patch.target_url && brandId) {
    try {
      const sm = await getShopifyShopForBrand(client, brandId);
      const dom = sm?.shop_domain?.trim();
      if (dom) {
        const host = dom.replace(/^https?:\/\//, "").replace(/\/+$/, "");
        patch.target_url = `https://${host}`;
      }
    } catch {
      /* non-fatal */
    }
  }

  if (!patch.ga4_property_id && brandId) {
    try {
      const r = await client.query<{ ga4_property_id: string | null }>(
        "SELECT ga4_property_id FROM brand_google_credentials WHERE brand_profile_id = $1 LIMIT 1",
        [brandId],
      );
      const g = r.rows[0]?.ga4_property_id?.trim();
      if (g) patch.ga4_property_id = g;
    } catch {
      /* table/column may be absent in older DBs */
    }
  }

  if (Object.keys(patch).length === 0) return;

  await client.query(
    `UPDATE initiatives
     SET goal_metadata = coalesce(goal_metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [initiativeId, JSON.stringify(patch)],
  );
}

/**
 * Update initiative goal_metadata URLs for SEO/template alignment **without** creating a pipeline run.
 * The debounced wizard UI was enqueueing wizard_state_snapshot on every field change → dozens of runs,
 * starving the runner so crawls stayed "running" and snapshots failed in bursts.
 */
export async function syncWpShopifyInitiativeGoalMetadataFromUrls(opts: {
  brandId: string;
  source_url?: string;
  target_store_url?: string;
  gsc_site_url?: string;
  ga4_property_id?: string;
}): Promise<{ initiative_id: string }> {
  return withTransaction(async (client) => {
    const initiativeId = await ensureWizardInitiative(client, opts.brandId);
    await client.query("SELECT id FROM initiatives WHERE id = $1 FOR UPDATE", [initiativeId]);
    const payload: WpShopifyWizardJobPayload = {
      kind: "wizard_state_snapshot",
      brand_id: opts.brandId,
      wizard_step: 1,
      summary: {},
    };
    const o = payload as Record<string, unknown>;
    if (opts.source_url?.trim()) o.source_url = opts.source_url.trim();
    if (opts.target_store_url?.trim()) o.target_store_url = opts.target_store_url.trim();
    if (opts.gsc_site_url?.trim()) o.gsc_site_url = opts.gsc_site_url.trim();
    if (opts.ga4_property_id?.trim()) o.ga4_property_id = opts.ga4_property_id.trim();
    await mergeSeoGoalMetadataFromWizardPayload(client, initiativeId, opts.brandId, payload);
    return { initiative_id: initiativeId };
  });
}

/** Runner often has no Woo encryption key; hydrate from DB here (same pattern as _prefetched_google_access_token). */
const WOO_HYDRATE_KINDS = new Set([
  "dry_run",
  "migration_preview",
  "migration_run_placeholder",
  "pdf_import",
  "pdf_resolve",
]);

function wizardPayloadNeedsShopifyPrefetch(payload: WpShopifyWizardJobPayload): boolean {
  if (payload.kind === "pdf_import" || payload.kind === "pdf_resolve") return true;
  if (payload.kind === "migration_run_placeholder") {
    const raw = Array.isArray(payload.entities) ? payload.entities : [];
    const entities = raw.map((e) => String(e).trim()).filter(Boolean);
    return entities.some((e) => e === "pdfs" || e === "blog_tags" || e === "blogs");
  }
  return false;
}

/**
 * Runner often has no SHOPIFY_CONNECTOR_ENCRYPTION_KEY; decrypt on the API at enqueue time (same idea as Woo hydrate).
 * Stripped with the rest of wp_shopify_pipeline_jobs[run_id] after the job finishes.
 */
async function hydrateShopifyCredentialsInWizardPayload(
  client: pg.PoolClient,
  brandId: string,
  payload: WpShopifyWizardJobPayload,
): Promise<WpShopifyWizardJobPayload> {
  if (!wizardPayloadNeedsShopifyPrefetch(payload)) return payload;
  const sm = await getShopifyShopForBrand(client, brandId);
  const tp = await getShopifyAccessTokenForBrand(client, brandId);
  if (!sm?.shop_domain?.trim() || !tp?.access_token?.trim()) {
    throw new Error(
      "Shopify is not connected for this brand, or the Admin API token could not be loaded. In the console: Brands → Edit brand → Shopify. On the Control Plane API, set SHOPIFY_CONNECTOR_ENCRYPTION_KEY (or WOO_COMMERCE_CONNECTOR_ENCRYPTION_KEY with the same secret) so stored tokens can be decrypted.",
    );
  }
  return {
    ...payload,
    _prefetched_shopify_access_token: tp.access_token,
    _prefetched_shopify_shop_domain: sm.shop_domain,
  };
}

async function hydrateWooCredentialsInWizardPayload(
  client: pg.PoolClient,
  brandId: string,
  payload: WpShopifyWizardJobPayload,
): Promise<WpShopifyWizardJobPayload> {
  if (!WOO_HYDRATE_KINDS.has(payload.kind)) return payload;
  const ws = String(payload.woo_server ?? "").trim();
  const wk = String(payload.woo_consumer_key ?? "").trim();
  const wsec = String(payload.woo_consumer_secret ?? "").trim();
  if (ws && wk && wsec) return payload;
  const row = await getWooCommerceCredentialsForBrand(client, brandId);
  if (!row) {
    throw new Error(
      "WooCommerce credentials not found for this brand. In the console: Brands → Edit brand → WooCommerce.",
    );
  }
  return {
    ...payload,
    woo_server: row.store_url,
    woo_consumer_key: row.consumer_key,
    woo_consumer_secret: row.consumer_secret,
  };
}

/** All wizard actions that create a pipeline run under the brand's WP → Shopify initiative. */
export const WIZARD_JOB_KINDS = new Set([
  "dry_run",
  "pdf_import",
  "pdf_resolve",
  "source_crawl",
  "seo_gsc_report",
  "seo_ga4_report",
  "seo_keyword_volume",
  "migration_preview",
  "migration_run_placeholder",
  "wizard_state_snapshot",
]);

export type WpShopifyWizardJobPayload = Record<string, unknown> & {
  kind: string;
  brand_id: string;
  /** Set only by the control plane at enqueue time; runner uses this so it does not call back for OAuth. */
  _prefetched_google_access_token?: string;
  _prefetched_google_expires_in?: number;
  /** Decrypted on the API at enqueue; avoids requiring SHOPIFY_CONNECTOR_ENCRYPTION_KEY on the runner for PDF/blog/tag steps. */
  _prefetched_shopify_access_token?: string;
  _prefetched_shopify_shop_domain?: string;
};

async function ensureWizardInitiative(client: pg.PoolClient, brandId: string): Promise<string> {
  const r = await client.query(
    `SELECT id FROM initiatives
     WHERE brand_profile_id = $1 AND intent_type IN ('wp_shopify_migration', 'seo_migration_audit')
     ORDER BY created_at DESC LIMIT 1`,
    [brandId],
  );
  if (r.rows[0]) return r.rows[0].id as string;
  const ins = await client.query(
    `INSERT INTO initiatives (id, intent_type, title, risk_level, brand_profile_id, goal_metadata)
     VALUES (gen_random_uuid(), $1, $2, 'low', $3, '{}'::jsonb) RETURNING id`,
    [WP_SHOPIFY_MIGRATION_INTENT, "WP → Shopify (wizard)", brandId],
  );
  return ins.rows[0].id as string;
}

/**
 * Store under both run id (legacy / debugging) and plan node id so the runner can load and strip by plan_node_id.
 * Parallel migration runs omit run id and only use per-node keys.
 */
function attachPayloadToInitiative(
  existing: unknown,
  runId: string,
  planNodeId: string,
  payload: WpShopifyWizardJobPayload,
): Record<string, unknown> {
  const gm =
    existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  const jobsRaw = gm.wp_shopify_pipeline_jobs;
  const jobs =
    jobsRaw && typeof jobsRaw === "object" && !Array.isArray(jobsRaw)
      ? { ...(jobsRaw as Record<string, unknown>) }
      : {};
  jobs[runId] = payload;
  jobs[planNodeId] = payload;
  return { ...gm, wp_shopify_pipeline_jobs: jobs };
}

/** Store payload under plan node id so parallel root jobs on one run each get their own slice (e.g. blogs vs PDFs). */
function attachPayloadToInitiativeByPlanNode(
  existing: unknown,
  planNodeId: string,
  payload: WpShopifyWizardJobPayload,
): Record<string, unknown> {
  const gm =
    existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  const jobsRaw = gm.wp_shopify_pipeline_jobs;
  const jobs =
    jobsRaw && typeof jobsRaw === "object" && !Array.isArray(jobsRaw)
      ? { ...(jobsRaw as Record<string, unknown>) }
      : {};
  jobs[planNodeId] = payload;
  return { ...gm, wp_shopify_pipeline_jobs: jobs };
}

/** When both PDFs and other entities are selected, run two queued jobs (two runners can claim in parallel). */
export function splitWpShopifyMigrationEntitiesForParallelRun(entities: unknown): {
  split: boolean;
  withoutPdf: string[];
} {
  const list = Array.isArray(entities) ? entities.map((e) => String(e).trim()).filter(Boolean) : [];
  const uniq = [...new Set(list)];
  const hasPdf = uniq.includes("pdfs");
  const withoutPdf = uniq.filter((e) => e !== "pdfs");
  return { split: hasPdf && withoutPdf.length > 0, withoutPdf };
}

/**
 * Enqueue migration_run only. If the user selected PDFs plus any other entity, compiles two root plan nodes
 * (content branch vs PDF branch) so different runners can execute concurrently.
 */
export async function enqueueWpShopifyWizardMigrationRun(opts: {
  brandId: string;
  payload: WpShopifyWizardJobPayload;
  environment?: "sandbox" | "staging" | "prod";
  llmSource?: "gateway" | "openai_direct";
}): Promise<{ run_id: string; plan_id: string; initiative_id: string; parallel_migration_jobs: boolean }> {
  if (opts.payload.kind !== "migration_run_placeholder") {
    throw new Error("enqueueWpShopifyWizardMigrationRun: expected kind migration_run_placeholder");
  }
  const { split, withoutPdf } = splitWpShopifyMigrationEntitiesForParallelRun(opts.payload.entities);
  if (!split) {
    const base = await enqueueWpShopifyWizardJob(opts);
    return { ...base, parallel_migration_jobs: false };
  }

  const environment = opts.environment ?? "sandbox";
  const llmSource = opts.llmSource === "openai_direct" ? "openai_direct" : "gateway";

  let releaseId: string;
  try {
    const route = await routeRun(pool, environment);
    releaseId = route.releaseId;
  } catch (routeErr) {
    const msg = (routeErr as Error).message;
    if (!msg.includes("No promoted release")) throw routeErr;
    const ins = await pool.query(
      `INSERT INTO releases (id, status, percent_rollout, policy_version) VALUES ($1, 'promoted', 100, 'latest') RETURNING id`,
      [uuid()],
    );
    releaseId = (ins.rows[0] as { id: string }).id;
  }

  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await withTransaction(async (client) => {
        const initiativeId = await ensureWizardInitiative(client, opts.brandId);
        await client.query("SELECT id FROM initiatives WHERE id = $1 FOR UPDATE", [initiativeId]);

        let jobPayload: WpShopifyWizardJobPayload = opts.payload;
        jobPayload = await hydrateWooCredentialsInWizardPayload(client, opts.brandId, jobPayload);
        jobPayload = await hydrateShopifyCredentialsInWizardPayload(client, opts.brandId, jobPayload);
        await mergeSeoGoalMetadataFromWizardPayload(client, initiativeId, opts.brandId, jobPayload);

        const baseJson = JSON.stringify(jobPayload);
        const payloadRest: WpShopifyWizardJobPayload = {
          ...(JSON.parse(baseJson) as WpShopifyWizardJobPayload),
          entities: withoutPdf,
          _migration_parallel_branch: "without_pdfs",
        };
        const payloadPdf: WpShopifyWizardJobPayload = {
          ...(JSON.parse(baseJson) as WpShopifyWizardJobPayload),
          entities: ["pdfs"],
          _migration_parallel_branch: "pdfs",
        };

        const nodeKeyRest = `wiz_mig_${uuid()}`;
        const nodeKeyPdf = `wiz_mig_${uuid()}`;
        const { planId, nodeIds } = await compilePlanFromDraft(
          client,
          initiativeId,
          {
            nodes: [
              { node_key: nodeKeyRest, job_type: WP_SHOPIFY_WIZARD_JOB_TYPE, agent_role: "engineer" },
              { node_key: nodeKeyPdf, job_type: WP_SHOPIFY_WIZARD_JOB_TYPE, agent_role: "engineer" },
            ],
            edges: [],
          },
          { force: true },
        );
        const planNodeRest = nodeIds.get(nodeKeyRest);
        const planNodePdf = nodeIds.get(nodeKeyPdf);
        if (!planNodeRest || !planNodePdf) throw new Error("Plan compile did not return both node ids");

        const runId = await createRun(client, {
          planId,
          releaseId,
          policyVersion: "latest",
          environment,
          cohort: "control",
          rootIdempotencyKey: `wp-shopify-migration-parallel:${planNodeRest}:${planNodePdf}:${uuid()}`,
          llmSource,
        });

        const metaR = await client.query("SELECT goal_metadata FROM initiatives WHERE id = $1", [initiativeId]);
        let nextMeta = attachPayloadToInitiativeByPlanNode(metaR.rows[0]?.goal_metadata, planNodeRest, payloadRest);
        nextMeta = attachPayloadToInitiativeByPlanNode(nextMeta, planNodePdf, payloadPdf);
        await client.query("UPDATE initiatives SET goal_metadata = $2::jsonb WHERE id = $1", [
          initiativeId,
          JSON.stringify(nextMeta),
        ]);

        return {
          run_id: runId,
          plan_id: planId,
          initiative_id: initiativeId,
          parallel_migration_jobs: true,
        };
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "40P01" && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("enqueueWpShopifyWizardMigrationRun: exhausted deadlock retries");
}

export async function enqueueWpShopifyWizardJob(opts: {
  brandId: string;
  payload: WpShopifyWizardJobPayload;
  environment?: "sandbox" | "staging" | "prod";
  llmSource?: "gateway" | "openai_direct";
}): Promise<{ run_id: string; plan_id: string; initiative_id: string }> {
  const environment = opts.environment ?? "sandbox";
  const llmSource = opts.llmSource === "openai_direct" ? "openai_direct" : "gateway";

  let releaseId: string;
  try {
    const route = await routeRun(pool, environment);
    releaseId = route.releaseId;
  } catch (routeErr) {
    const msg = (routeErr as Error).message;
    if (!msg.includes("No promoted release")) throw routeErr;
    const ins = await pool.query(
      `INSERT INTO releases (id, status, percent_rollout, policy_version) VALUES ($1, 'promoted', 100, 'latest') RETURNING id`,
      [uuid()],
    );
    releaseId = (ins.rows[0] as { id: string }).id;
  }

  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await withTransaction(async (client) => {
        const initiativeId = await ensureWizardInitiative(client, opts.brandId);
        // Lock initiative before plans/runs so we match lock ordering with the runner's finally block
        // (stripWizardJobPayloadFromInitiative updates this row). Otherwise concurrent GSC+GA4 enqueues
        // while a job finishes can deadlock (40P01).
        await client.query("SELECT id FROM initiatives WHERE id = $1 FOR UPDATE", [initiativeId]);

        let jobPayload: WpShopifyWizardJobPayload = opts.payload;
        if (opts.payload.kind === "seo_gsc_report" || opts.payload.kind === "seo_ga4_report") {
          const tok = await getAccessTokenForInitiative(client, initiativeId);
          if (!tok?.access_token) {
            throw new Error(
              "Google is not connected for this brand, or token refresh failed. In the console: Brands → connect Google (GSC/GA4). On the API: set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_ENCRYPTION_KEY, and CONTROL_PLANE_URL to this service’s public URL (for OAuth redirect).",
            );
          }
          jobPayload = {
            ...opts.payload,
            _prefetched_google_access_token: tok.access_token,
            _prefetched_google_expires_in: tok.expires_in,
          };
        }

        jobPayload = await hydrateWooCredentialsInWizardPayload(client, opts.brandId, jobPayload);
        jobPayload = await hydrateShopifyCredentialsInWizardPayload(client, opts.brandId, jobPayload);
        await mergeSeoGoalMetadataFromWizardPayload(client, initiativeId, opts.brandId, jobPayload);

        const nodeKey = `wiz_${uuid()}`;
        const { planId, nodeIds } = await compilePlanFromDraft(
          client,
          initiativeId,
          {
            nodes: [{ node_key: nodeKey, job_type: WP_SHOPIFY_WIZARD_JOB_TYPE, agent_role: "engineer" }],
            edges: [],
          },
          { force: true },
        );
        const planNodeId = nodeIds.get(nodeKey);
        if (!planNodeId) throw new Error("Plan compile did not return node id");

        const runId = await createRun(client, {
          planId,
          releaseId,
          policyVersion: "latest",
          environment,
          cohort: "control",
          rootIdempotencyKey: `wp-shopify-wizard:${planNodeId}:${uuid()}`,
          llmSource,
        });

        const metaR = await client.query("SELECT goal_metadata FROM initiatives WHERE id = $1", [initiativeId]);
        const nextMeta = attachPayloadToInitiative(metaR.rows[0]?.goal_metadata, runId, planNodeId, jobPayload);
        await client.query("UPDATE initiatives SET goal_metadata = $2::jsonb WHERE id = $1", [
          initiativeId,
          JSON.stringify(nextMeta),
        ]);

        return { run_id: runId, plan_id: planId, initiative_id: initiativeId };
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "40P01" && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("enqueueWpShopifyWizardJob: exhausted deadlock retries");
}

/**
 * Remove this job’s payload from goal_metadata. Prefer plan_node_id (matches attachPayloadToInitiative dual-key and parallel runs).
 * When old data only had run_id, pass runId as fallbackKey so it is cleared too.
 */
export async function stripWizardJobPayloadFromInitiative(
  client: pg.PoolClient,
  initiativeId: string,
  planNodeId: string,
  fallbackRunId?: string,
): Promise<void> {
  await client.query(
    `UPDATE initiatives
     SET goal_metadata = CASE
       WHEN goal_metadata IS NULL OR jsonb_typeof(goal_metadata->'wp_shopify_pipeline_jobs') <> 'object'
         THEN goal_metadata
         ELSE jsonb_set(
         goal_metadata,
         '{wp_shopify_pipeline_jobs}',
         CASE
           WHEN $3::text IS NOT NULL AND btrim($3::text) <> '' THEN
             (goal_metadata->'wp_shopify_pipeline_jobs') - $2::text - btrim($3::text)
           ELSE
             (goal_metadata->'wp_shopify_pipeline_jobs') - $2::text
         END
       )
     END
     WHERE id = $1`,
    [initiativeId, planNodeId, fallbackRunId ?? null],
  );
}
