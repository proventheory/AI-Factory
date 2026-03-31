/**
 * Self-heal: no-artifacts remediation (no human in the loop).
 *
 * When a run completes (initiative → plan → pipeline → jobs) but has no artifacts,
 * we detect it via API (run status, job_runs, artifacts) and remediate: sync Render
 * worker env from Control Plane and create a new run so the pipeline can succeed.
 *
 * Triggers:
 * 1. GET /v1/runs/:id/artifacts when empty and run had jobs (existing).
 * 2. Background scan: periodically find runs that are terminal, had jobs, zero artifacts.
 *
 * Requires: ENABLE_SELF_HEAL=true, RENDER_API_KEY set.
 */

import { pool, withTransaction } from "./db.js";
import { createRun } from "./scheduler.js";
import { syncWorkerEnvFromControlPlane } from "./render-worker-remediate.js";
import type { Environment, Cohort } from "./types.js";

/** Run IDs we already remediated (avoid loop). Cleared on process restart. */
export const noArtifactsRemediatedRunIds = new Set<string>();

/** Run IDs we already remediated for bad-artifacts (avoid loop). */
export const badArtifactsRemediatedRunIds = new Set<string>();

const SCAN_LIMIT = 5;
const BAD_ARTIFACT_SCAN_LIMIT = 5;
const TERMINAL_STATUSES = ["succeeded", "failed"] as const;

/**
 * Run remediation for one run: sync worker env and create a new run.
 * No-op if already remediated or self-heal disabled.
 */
export async function runNoArtifactsRemediation(runId: string): Promise<void> {
  if (noArtifactsRemediatedRunIds.has(runId)) return;
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const hasKey = !!process.env.RENDER_API_KEY?.trim();
  if (!selfHeal || !hasKey) return;

  try {
    const syncResult = await syncWorkerEnvFromControlPlane();
    if (!syncResult.ok) {
      console.warn("[self-heal] No-artifacts remediation: sync failed:", syncResult.message);
      return;
    }
    noArtifactsRemediatedRunIds.add(runId);
    console.log("[self-heal] No-artifacts remediation: worker env synced for run", runId, syncResult.updated);

    let r: { rows: { plan_id: string; release_id: string; policy_version: string | null; environment: string; cohort: string | null; llm_source?: string }[] };
    try {
      r = await pool.query(
        "SELECT plan_id, release_id, policy_version, environment, cohort, llm_source FROM runs WHERE id = $1",
        [runId]
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "42703") {
        r = await pool.query(
          "SELECT plan_id, release_id, policy_version, environment, cohort FROM runs WHERE id = $1",
          [runId]
        );
      } else {
        throw e;
      }
    }
    if (r.rows.length === 0) return;
    const row = r.rows[0] as { plan_id: string; release_id: string; policy_version: string | null; environment: string; cohort: string | null; llm_source?: string };
    const llmSource = row.llm_source === "openai_direct" ? ("openai_direct" as const) : ("gateway" as const);
    await withTransaction(async (client) => {
      return createRun(client, {
        planId: row.plan_id,
        releaseId: row.release_id,
        policyVersion: row.policy_version ?? "latest",
        environment: row.environment as Environment,
        cohort: row.cohort as Cohort | null,
        rootIdempotencyKey: `self-heal:${runId}:${Date.now()}`,
        llmSource,
      });
    });
  } catch (err) {
    console.warn("[self-heal] No-artifacts remediation error:", (err as Error).message);
  }
}

/**
 * Eligibility only (DB reads). Caller may await remediation to avoid stacking many parallel
 * `runNoArtifactsRemediation` calls that each hold pool connections + hit Render API.
 */
async function isNoArtifactsRemediationEligible(runId: string): Promise<boolean> {
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const hasKey = !!process.env.RENDER_API_KEY?.trim();
  if (!selfHeal || !hasKey) return false;
  if (noArtifactsRemediatedRunIds.has(runId)) return false;

  const run = await pool.query<{ status: string; intent_type: string | null }>(
    `SELECT r.status, i.intent_type
     FROM runs r
     LEFT JOIN plans p ON p.id = r.plan_id
     LEFT JOIN initiatives i ON i.id = p.initiative_id
     WHERE r.id = $1`,
    [runId],
  );
  if (run.rows.length === 0) return false;
  const intent = run.rows[0].intent_type ?? "";
  if (
    run.rows[0].status === "failed" &&
    (intent === "wp_shopify_migration" || intent === "seo_migration_audit")
  ) {
    return false;
  }
  if (!TERMINAL_STATUSES.includes(run.rows[0].status as (typeof TERMINAL_STATUSES)[number])) return false;

  const jobCount = await pool.query<{ c: number }>(
    "SELECT count(*)::int AS c FROM job_runs WHERE run_id = $1",
    [runId]
  );
  if ((jobCount.rows[0]?.c ?? 0) === 0) return false;

  const art = await pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 LIMIT 1", [runId]);
  if (art.rows.length > 0) return false;

  return true;
}

/**
 * If this run is eligible (terminal, had jobs, zero artifacts), trigger remediation in background.
 * Used by GET /v1/runs/:id/artifacts (non-blocking).
 */
export async function triggerNoArtifactsRemediationForRun(runId: string): Promise<void> {
  if (!(await isNoArtifactsRemediationEligible(runId))) return;
  setImmediate(() => {
    void runNoArtifactsRemediation(runId).catch((e) =>
      console.warn("[self-heal] No-artifacts remediation error:", (e as Error).message),
    );
  });
}

/** Same as trigger but awaits remediation — used by periodic scan so we do not burst the DB pool. */
export async function awaitNoArtifactsRemediationForRunIfEligible(runId: string): Promise<void> {
  if (!(await isNoArtifactsRemediationEligible(runId))) return;
  await runNoArtifactsRemediation(runId);
}

/**
 * Scan for runs that are terminal, had job_runs, and have zero artifacts; trigger remediation.
 * Called periodically so we self-heal without any human opening the run (initiative → plan →
 * pipeline → jobs → artifacts cycle should complete without manual intervention).
 */
export async function scanAndRemediateNoArtifactsRuns(): Promise<void> {
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const hasKey = !!process.env.RENDER_API_KEY?.trim();
  if (!selfHeal || !hasKey) return;

  const runs = await pool.query<{ id: string }>(
    `SELECT r.id
     FROM runs r
     WHERE r.status::text = ANY($1::text[])
       AND (SELECT count(*)::int FROM job_runs jr WHERE jr.run_id = r.id) > 0
       AND (SELECT count(*)::int FROM artifacts a WHERE a.run_id = r.id) = 0
     ORDER BY r.ended_at DESC NULLS LAST
     LIMIT $2`,
    [TERMINAL_STATUSES, SCAN_LIMIT]
  );

  for (const row of runs.rows) {
    if (noArtifactsRemediatedRunIds.has(row.id)) continue;
    await awaitNoArtifactsRemediationForRunIfEligible(row.id);
  }
}

/** True if this run should get bad-artifact remediation (same env + DB checks as trigger). */
async function shouldRemediateBadArtifacts(runId: string): Promise<boolean> {
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const hasKey = !!process.env.RENDER_API_KEY?.trim();
  if (!selfHeal || !hasKey) return false;
  if (noArtifactsRemediatedRunIds.has(runId) || badArtifactsRemediatedRunIds.has(runId)) return false;

  const run = await pool.query<{ status: string }>("SELECT status FROM runs WHERE id = $1", [runId]);
  if (run.rows.length === 0) return false;
  if (!TERMINAL_STATUSES.includes(run.rows[0].status as (typeof TERMINAL_STATUSES)[number])) return false;

  const jobCount = await pool.query<{ c: number }>("SELECT count(*)::int AS c FROM job_runs WHERE run_id = $1", [runId]);
  if ((jobCount.rows[0]?.c ?? 0) === 0) return false;

  const arts = await pool.query<{ id: string; metadata_json: Record<string, unknown> | null }>(
    "SELECT id, metadata_json FROM artifacts WHERE run_id = $1 AND artifact_type = 'email_template'",
    [runId]
  );
  if (arts.rows.length === 0) return false;

  let hasBad = false;
  try {
    const failedVer = await pool.query(
      "SELECT 1 FROM artifact_verifications av JOIN artifacts a ON a.id = av.artifact_id WHERE a.run_id = $1 AND av.passed = false LIMIT 1",
      [runId]
    );
    if (failedVer.rows.length > 0) hasBad = true;
  } catch {
    // artifact_verifications table may not exist yet
  }
  if (!hasBad) {
    for (const row of arts.rows) {
      const meta = row.metadata_json;
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const genLen = meta.generated_html_len as number | undefined;
        const content = meta.content as string | undefined;
        const storedLen = typeof content === "string" ? content.length : 0;
        if (typeof genLen === "number" && genLen > 0 && storedLen < genLen * 0.95) hasBad = true;
        if (meta.email_generation_path === "template" && (meta.template_id_used == null || meta.mjml_template_id == null)) hasBad = true;
        if (hasBad) break;
      }
    }
  }

  return hasBad;
}

/**
 * If this run has at least one email_template artifact that is bad (failed verification or heuristic),
 * trigger the same remediation as no-artifacts (sync worker env, create new run).
 */
export async function triggerBadArtifactsRemediationForRun(runId: string): Promise<void> {
  if (!(await shouldRemediateBadArtifacts(runId))) return;
  badArtifactsRemediatedRunIds.add(runId);
  setImmediate(() => {
    void runNoArtifactsRemediation(runId).catch((e) =>
      console.warn("[self-heal] Bad-artifacts remediation error:", (e as Error).message),
    );
  });
}

/**
 * Scan for runs that are terminal, have job_runs, and have at least one email_template artifact
 * that is bad (failed verification or heuristic); trigger remediation.
 */
export async function scanAndRemediateBadArtifactRuns(): Promise<void> {
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const hasKey = !!process.env.RENDER_API_KEY?.trim();
  if (!selfHeal || !hasKey) return;

  let runIds: { id: string }[] = [];
  try {
    const r = await pool.query<{ id: string }>(
      `SELECT r.id FROM runs r
       WHERE r.status::text = ANY($1::text[])
         AND (SELECT count(*)::int FROM job_runs jr WHERE jr.run_id = r.id) > 0
         AND (SELECT count(*)::int FROM artifacts a WHERE a.run_id = r.id AND a.artifact_type = 'email_template') > 0
       ORDER BY r.ended_at DESC NULLS LAST
       LIMIT $2`,
      [TERMINAL_STATUSES, BAD_ARTIFACT_SCAN_LIMIT]
    );
    runIds = r.rows;
  } catch {
    // artifact_verifications or query may fail if schema not migrated
  }

  for (const row of runIds) {
    if (badArtifactsRemediatedRunIds.has(row.id)) continue;
    if (!(await shouldRemediateBadArtifacts(row.id))) continue;
    badArtifactsRemediatedRunIds.add(row.id);
    await runNoArtifactsRemediation(row.id);
  }
}
