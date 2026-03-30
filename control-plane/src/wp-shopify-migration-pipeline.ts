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

export const WP_SHOPIFY_WIZARD_JOB_TYPE = "wp_shopify_wizard_job" as const;

/** Runner often has no Woo encryption key; hydrate from DB here (same pattern as _prefetched_google_access_token). */
const WOO_HYDRATE_KINDS = new Set([
  "dry_run",
  "migration_preview",
  "migration_run_placeholder",
  "pdf_import",
  "pdf_resolve",
]);

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

function attachPayloadToInitiative(
  existing: unknown,
  runId: string,
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
  return { ...gm, wp_shopify_pipeline_jobs: jobs };
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
        const nextMeta = attachPayloadToInitiative(metaR.rows[0]?.goal_metadata, runId, jobPayload);
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

export async function stripWizardJobPayloadFromInitiative(
  client: pg.PoolClient,
  initiativeId: string,
  runId: string,
): Promise<void> {
  // Single atomic UPDATE avoids SELECT ... FOR UPDATE after holding job_run/artifact locks (runner),
  // which could deadlock with enqueueWpShopifyWizardJob (plans/runs then initiative).
  await client.query(
    `UPDATE initiatives
     SET goal_metadata = CASE
       WHEN goal_metadata IS NULL OR jsonb_typeof(goal_metadata->'wp_shopify_pipeline_jobs') <> 'object'
         THEN goal_metadata
       ELSE jsonb_set(
         goal_metadata,
         '{wp_shopify_pipeline_jobs}',
         (goal_metadata->'wp_shopify_pipeline_jobs') - $2::text
       )
     END
     WHERE id = $1`,
    [initiativeId, runId],
  );
}
