import "dotenv/config";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN?.trim()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
    integrations: [Sentry.expressIntegration()],
  });
}

import { pool } from "./db.js";
import { startApi } from "./api.js";
import { reapStaleLeases } from "./reaper.js";
import { computeDrift, executeRollback, routeRun } from "./release-manager.js";
import { scanAndRemediateNoArtifactsRuns } from "./no-artifacts-self-heal.js";

const REAPER_INTERVAL_MS = 30_000;
const DRIFT_CHECK_INTERVAL_MS = 60_000;
const NO_ARTIFACTS_SCAN_INTERVAL_MS = 3 * 60_000; // 3 minutes

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

async function startNoArtifactsScanLoop(): Promise<void> {
  setInterval(async () => {
    try {
      await scanAndRemediateNoArtifactsRuns();
    } catch (err) {
      console.error("[self-heal] No-artifacts scan error:", err);
    }
  }, NO_ARTIFACTS_SCAN_INTERVAL_MS);
}

async function main(): Promise<void> {
  console.log("[control-plane] Starting AI Factory Control Plane...");

  await startReaperLoop();
  console.log("[control-plane] Lease reaper started");

  await startDriftMonitor();
  console.log("[control-plane] Drift monitor started");

  await startNoArtifactsScanLoop();
  console.log("[control-plane] No-artifacts self-heal scan started");

  startApi();
  console.log("[control-plane] API started");

  console.log("[control-plane] Ready");
}

main().catch((err) => {
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.captureException(err);
    void Sentry.close(2000).then(() => process.exit(1));
  } else {
    console.error("[control-plane] Fatal:", err);
    process.exit(1);
  }
});
