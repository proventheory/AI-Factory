/**
 * Self-heal: deploy-failure remediation (no human in the loop).
 *
 * When any staging service (api, gateway, runner) has latest deploy failed or canceled,
 * trigger a new deploy with cache clear so Render retries the build.
 * If the same commit has already been remediated 2+ times for that service (code bug), create
 * an initiative instead of redeploying again.
 *
 * Trigger: background scan every 5 minutes (see control-plane index).
 * Requires: ENABLE_SELF_HEAL=true, RENDER_API_KEY set.
 * Optional: RENDER_STAGING_SERVICE_IDS=id1,id2,id3 (comma-separated) to monitor api + gateway + runner.
 * If unset, only the worker (RENDER_WORKER_SERVICE_ID or resolved runner) is monitored.
 */

import { pool, withTransaction } from "./db.js";
import {
  getStagingServiceIds,
  listRenderDeploys,
  triggerRenderDeploy,
} from "./render-worker-remediate.js";

/** Deploy IDs we already triggered a redeploy for (avoid loop). Cleared on process restart. */
export const deployFailureRemediatedDeployIds = new Set<string>();

/** Per service+commit count of remediations. Key: `${serviceId}:${commit}`. */
export const deployFailureRemediationCountByCommit = new Map<string, number>();

/** Render API: build_failed = build failed; failed/canceled = other failure. All trigger redeploy. */
const FAILED_STATUSES = ["failed", "canceled", "build_failed"] as const;
const MAX_REDEPLOYS_PER_COMMIT = 2;

/**
 * Check each staging service's latest deploy; if failed/canceled, trigger a new deploy with cache clear
 * unless we've already remediated this deploy or this service+commit 2+ times (then create initiative).
 */
export async function scanAndRemediateDeployFailure(): Promise<void> {
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const hasKey = !!process.env.RENDER_API_KEY?.trim();
  if (!selfHeal || !hasKey) return;

  const serviceIds = await getStagingServiceIds();
  if (serviceIds.length === 0) return;

  for (const serviceId of serviceIds) {
    let deploys: { id: string; status: string; commit?: string }[];
    try {
      deploys = await listRenderDeploys(process.env.RENDER_API_KEY!, serviceId, 1);
    } catch (err) {
      console.warn("[self-heal] Deploy-failure scan: list deploys error for", serviceId, (err as Error).message);
      continue;
    }

    const latest = deploys[0];
    if (!latest?.id) continue;
    if (!FAILED_STATUSES.includes(latest.status as (typeof FAILED_STATUSES)[number])) continue;
    if (deployFailureRemediatedDeployIds.has(latest.id)) continue;

    const commitKey = `${serviceId}:${latest.commit?.trim() || latest.id}`;
    const count = (deployFailureRemediationCountByCommit.get(commitKey) ?? 0) + 1;
    deployFailureRemediationCountByCommit.set(commitKey, count);

    if (count > MAX_REDEPLOYS_PER_COMMIT) {
      deployFailureRemediatedDeployIds.add(latest.id);
      try {
        const ir = await pool.query(
          `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state, template_id)
           VALUES ('issue_fix', $1, 'med', $2, 'draft', 'issue_fix') RETURNING id`,
          [
            `Self-heal: Deploy repeatedly failing (service ${serviceId}, commit ${latest.commit ?? "unknown"})`,
            `deploy:${latest.id}`,
          ]
        );
        const initId = ir.rows[0]?.id;
        if (initId) {
          const { compilePlan } = await import("./plan-compiler.js");
          await withTransaction((client) => compilePlan(client, initId, { force: true }));
          console.log("[self-heal] Deploy-failure: created initiative for repeated failures (no more redeploys):", initId);
        }
      } catch (e) {
        console.warn("[self-heal] Deploy-failure: failed to create initiative:", (e as Error).message);
      }
      continue;
    }

    try {
      await triggerRenderDeploy(process.env.RENDER_API_KEY!, serviceId, true);
      deployFailureRemediatedDeployIds.add(latest.id);
      console.log("[self-heal] Deploy-failure remediation: triggered new deploy (clear cache) for", serviceId, "failed deploy", latest.id);
    } catch (err) {
      deployFailureRemediationCountByCommit.set(commitKey, count - 1);
      console.warn("[self-heal] Deploy-failure remediation: trigger deploy error for", serviceId, (err as Error).message);
    }
  }
}
