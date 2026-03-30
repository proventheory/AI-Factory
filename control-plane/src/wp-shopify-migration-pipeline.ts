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

export const WP_SHOPIFY_WIZARD_JOB_TYPE = "wp_shopify_wizard_job" as const;

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

  return withTransaction(async (client) => {
    const initiativeId = await ensureWizardInitiative(client, opts.brandId);
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

    const metaR = await client.query("SELECT goal_metadata FROM initiatives WHERE id = $1 FOR UPDATE", [initiativeId]);
    const nextMeta = attachPayloadToInitiative(metaR.rows[0]?.goal_metadata, runId, opts.payload);
    await client.query("UPDATE initiatives SET goal_metadata = $2::jsonb WHERE id = $1", [
      initiativeId,
      JSON.stringify(nextMeta),
    ]);

    return { run_id: runId, plan_id: planId, initiative_id: initiativeId };
  });
}

export async function stripWizardJobPayloadFromInitiative(
  client: pg.PoolClient,
  initiativeId: string,
  runId: string,
): Promise<void> {
  const metaR = await client.query("SELECT goal_metadata FROM initiatives WHERE id = $1 FOR UPDATE", [initiativeId]);
  const gm = metaR.rows[0]?.goal_metadata;
  if (!gm || typeof gm !== "object" || Array.isArray(gm)) return;
  const rec = gm as Record<string, unknown>;
  const jobs = rec.wp_shopify_pipeline_jobs;
  if (!jobs || typeof jobs !== "object" || Array.isArray(jobs)) return;
  const next = { ...(jobs as Record<string, unknown>) };
  delete next[runId];
  const nextGm = { ...rec, wp_shopify_pipeline_jobs: next };
  await client.query("UPDATE initiatives SET goal_metadata = $2::jsonb WHERE id = $1", [
    initiativeId,
    JSON.stringify(nextGm),
  ]);
}
