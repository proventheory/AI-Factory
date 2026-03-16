/**
 * Eval Initiative: nightly (or scheduled) scan of failure clusters from incident_memory.
 * Creates initiatives so failures get replayed in sandbox and can produce upgrade PRs.
 *
 * Trigger: setInterval in control-plane index (default every 24h). Requires ENABLE_EVAL_INITIATIVE=true.
 * Flow: query failure_clusters → for each cluster without a recent eval initiative, create initiative
 * (intent_type issue_fix, source_ref eval:{failure_class}) and optionally trigger one subgraph_replay
 * for a representative failed run.
 */

import { pool, withTransaction } from "./db.js";

const EVAL_SOURCE_PREFIX = "eval:";
const EVAL_INITIATIVE_DAYS = 7;
const MAX_CLUSTERS_PER_SCAN = 10;

export async function runEvalInitiativeScan(): Promise<{ initiativesCreated: number; replaysTriggered: number }> {
  if (process.env.ENABLE_EVAL_INITIATIVE !== "true") return { initiativesCreated: 0, replaysTriggered: 0 };

  let initiativesCreated = 0;
  let replaysTriggered = 0;

  try {
    const clusters = await pool.query<{ failure_class: string; count: string; last_seen: string }>(
      `SELECT failure_class, COUNT(*) AS count, MAX(last_seen_at) AS last_seen
       FROM incident_memory
       GROUP BY failure_class
       ORDER BY COUNT(*) DESC, MAX(last_seen_at) DESC
       LIMIT $1`,
      [MAX_CLUSTERS_PER_SCAN],
    );

    if (clusters.rows.length === 0) return { initiativesCreated: 0, replaysTriggered: 0 };

    const since = new Date();
    since.setDate(since.getDate() - EVAL_INITIATIVE_DAYS);

    for (const row of clusters.rows) {
      const failureClass = row.failure_class;
      const sourceRef = `${EVAL_SOURCE_PREFIX}${failureClass}`;

      const existing = await pool.query(
        `SELECT id FROM initiatives WHERE source_ref = $1 AND created_at > $2 LIMIT 1`,
        [sourceRef, since],
      );
      if (existing.rows.length > 0) continue;

      const initId = await withTransaction(async (client) => {
        const ir = await client.query(
          `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state, template_id)
           VALUES ('issue_fix', $1, 'low', $2, 'draft', 'issue_fix') RETURNING id`,
          [`Eval: failure cluster "${failureClass}" (${row.count} incidents)`, sourceRef],
        );
        const id = ir.rows[0]?.id as string;
        if (id) {
          const { compilePlan } = await import("./plan-compiler.js");
          await compilePlan(client, id, { force: true });
        }
        return id;
      });

      if (initId) {
        initiativesCreated++;
        console.log("[eval-initiative] Created initiative for failure cluster:", failureClass, "initId:", initId);
      }

      const runToReplay = await pool.query<{ run_id: string }>(
        `SELECT DISTINCT jr.run_id
         FROM job_runs jr
         JOIN incident_memory im ON im.failure_signature = jr.error_signature AND im.failure_class = $1
         WHERE jr.status = 'failed'
         ORDER BY jr.ended_at DESC NULLS LAST, jr.started_at DESC NULLS LAST
         LIMIT 1`,
        [failureClass],
      ).then((r) => r.rows[0]);

      if (runToReplay?.run_id) {
        try {
          const { createRun } = await import("./scheduler.js");
          const runRow = await pool.query(
            "SELECT plan_id, release_id, policy_version, environment, cohort, llm_source FROM runs WHERE id = $1",
            [runToReplay.run_id],
          ).then((r) => r.rows[0] as { plan_id: string; release_id: string; policy_version: string | null; environment: string; cohort: string | null; llm_source?: string } | undefined);
          if (runRow) {
            await withTransaction(async (client) => {
              return createRun(client, {
                planId: runRow.plan_id,
                releaseId: runRow.release_id,
                policyVersion: runRow.policy_version ?? "latest",
                environment: "sandbox",
                cohort: "control",
                rootIdempotencyKey: `eval_replay:${failureClass}:${Date.now()}`,
                llmSource: runRow.llm_source === "openai_direct" ? "openai_direct" : "gateway",
              });
            });
            replaysTriggered++;
            console.log("[eval-initiative] Triggered sandbox replay for cluster:", failureClass, "run:", runToReplay.run_id);
          }
        } catch (err) {
          console.warn("[eval-initiative] Replay failed for cluster", failureClass, (err as Error).message);
        }
      }
    }
  } catch (err) {
    console.error("[eval-initiative] Scan error:", err);
  }

  return { initiativesCreated, replaysTriggered };
}
