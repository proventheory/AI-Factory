import { pool } from "./db.js";
import { startApi } from "./api.js";
import { reapStaleLeases } from "./reaper.js";
import { computeDrift, executeRollback, routeRun } from "./release-manager.js";
import { checkRunCompletion } from "./scheduler.js";

const REAPER_INTERVAL_MS = 30_000;
const DRIFT_CHECK_INTERVAL_MS = 60_000;

async function startReaperLoop(): Promise<void> {
  setInterval(async () => {
    try {
      const reaped = await reapStaleLeases(pool);
      if (reaped > 0) console.log(`[reaper] Reclaimed ${reaped} stale leases`);
    } catch (err) {
      console.error("[reaper] Error:", err);
    }
  }, REAPER_INTERVAL_MS);
}

async function startDriftMonitor(): Promise<void> {
  setInterval(async () => {
    try {
      for (const env of ["prod", "staging"] as const) {
        const drift = await computeDrift(pool, env);
        if (drift.shouldRollback) {
          console.warn(`[drift] Rollback triggered for ${env}:`, drift);
          const route = await routeRun(pool, env);
          if (route.cohort === "canary") {
            await executeRollback(pool, route.releaseId, env);
            console.warn(`[drift] Rolled back release ${route.releaseId} in ${env}`);
          }
        }
      }
    } catch (err) {
      console.error("[drift] Error:", err);
    }
  }, DRIFT_CHECK_INTERVAL_MS);
}

async function main(): Promise<void> {
  console.log("[control-plane] Starting AI Factory Control Plane...");

  await startReaperLoop();
  console.log("[control-plane] Lease reaper started");

  await startDriftMonitor();
  console.log("[control-plane] Drift monitor started");

  startApi();
  console.log("[control-plane] API started");

  console.log("[control-plane] Ready");
}

main().catch((err) => {
  console.error("[control-plane] Fatal:", err);
  process.exit(1);
});
