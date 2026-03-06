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

/** Run IDs we already remediated (avoid loop). Cleared on process restart. */
export const noArtifactsRemediatedRunIds = new Set<string>();

const SCAN_LIMIT = 5;
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
        environment: row.environment,
        cohort: row.cohort,
        rootIdempotencyKey: `self-heal:${runId}:${Date.now()}`,
        llmSource,
      });
    });
  } catch (err) {
    console.warn("[self-heal] No-artifacts remediation error:", (err as Error).message);
  }
}

/**
 * If this run is eligible (terminal, had jobs, zero artifacts), trigger remediation in background.
 * Used by GET /v1/runs/:id/artifacts and by the background scan.
 */
export async function triggerNoArtifactsRemediationForRun(runId: string): Promise<void> {
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const hasKey = !!process.env.RENDER_API_KEY?.trim();
  if (!selfHeal || !hasKey) return;
  if (noArtifactsRemediatedRunIds.has(runId)) return;

  const run = await pool.query<{ status: string }>(
    "SELECT status FROM runs WHERE id = $1",
    [runId]
  );
  if (run.rows.length === 0) return;
  if (!TERMINAL_STATUSES.includes(run.rows[0].status as (typeof TERMINAL_STATUSES)[number])) return;

  const jobCount = await pool.query<{ c: number }>(
    "SELECT count(*)::int AS c FROM job_runs WHERE run_id = $1",
    [runId]
  );
  if ((jobCount.rows[0]?.c ?? 0) === 0) return;

  const art = await pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 LIMIT 1", [runId]);
  if (art.rows.length > 0) return;

  setImmediate(() => runNoArtifactsRemediation(runId));
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
     WHERE r.status = ANY($1::text[])
       AND (SELECT count(*)::int FROM job_runs jr WHERE jr.run_id = r.id) > 0
       AND (SELECT count(*)::int FROM artifacts a WHERE a.run_id = r.id) = 0
     ORDER BY r.ended_at DESC NULLS LAST
     LIMIT $2`,
    [TERMINAL_STATUSES, SCAN_LIMIT]
  );

  for (const row of runs.rows) {
    if (noArtifactsRemediatedRunIds.has(row.id)) continue;
    await triggerNoArtifactsRemediationForRun(row.id);
  }
}
