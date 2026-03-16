/**
 * Deploy-failure scan: trigger-only (no DB, no initiative).
 * Used by the runner so when api-staging is down, the runner can still trigger
 * redeploys for api/gateway/runner. Same env as control-plane: ENABLE_SELF_HEAL,
 * RENDER_API_KEY, RENDER_STAGING_SERVICE_IDS (or RENDER_WORKER_SERVICE_ID).
 */

import {
  getStagingServiceIds,
  listRenderDeploys,
  triggerRenderDeploy,
} from "./render-worker-remediate.js";

const FAILED_STATUSES = ["failed", "canceled", "build_failed"] as const;

/** Deploy IDs we already triggered (in-memory). Avoids re-triggering every 5 min for same deploy. */
const triggeredDeployIds = new Set<string>();

/**
 * List staging services' latest deploy; if failed/canceled/build_failed, trigger redeploy (clear cache).
 * No DB, no initiative. Safe to run from runner or any process with RENDER_API_KEY + service IDs.
 */
export async function runDeployFailureScanTriggerOnly(): Promise<void> {
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
      console.warn("[runner self-heal] Deploy-failure scan: list deploys error for", serviceId, (err as Error).message);
      continue;
    }

    const latest = deploys[0];
    if (!latest?.id) continue;
    if (!FAILED_STATUSES.includes(latest.status as (typeof FAILED_STATUSES)[number])) continue;
    if (triggeredDeployIds.has(latest.id)) continue;

    try {
      await triggerRenderDeploy(process.env.RENDER_API_KEY!, serviceId, true);
      triggeredDeployIds.add(latest.id);
      console.log("[runner self-heal] Deploy-failure: triggered new deploy (clear cache) for", serviceId, "failed deploy", latest.id);
    } catch (err) {
      console.warn("[runner self-heal] Deploy-failure: trigger error for", serviceId, (err as Error).message);
    }
  }
}
