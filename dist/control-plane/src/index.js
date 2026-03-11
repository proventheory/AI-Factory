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
import { reapStaleLeases, reconcileRunStatuses, reconcileRunningRunsWithNoPendingJobs, reconcileRunningRunsWithStaleQueuedJobs } from "./reaper.js";
import { computeDrift, executeRollback, routeRun } from "./release-manager.js";
import { scanAndRemediateNoArtifactsRuns, scanAndRemediateBadArtifactRuns } from "./no-artifacts-self-heal.js";
import { startProcessFailedRunsLoop } from "./process-failed-runs.js";
const REAPER_INTERVAL_MS = 30_000;
const DRIFT_CHECK_INTERVAL_MS = 60_000;
const NO_ARTIFACTS_SCAN_INTERVAL_MS = 3 * 60_000; // 3 minutes
async function startReaperLoop() {
    try {
        const reconciled = await reconcileRunStatuses(pool);
        if (reconciled > 0)
            console.log(`[reaper] Startup: reconciled ${reconciled} run(s) to succeeded`);
        const noPending = await reconcileRunningRunsWithNoPendingJobs(pool);
        if (noPending.succeeded > 0 || noPending.failed > 0) {
            console.log(`[reaper] Startup: reconciled ${noPending.succeeded} run(s) to succeeded, ${noPending.failed} to failed (no pending jobs)`);
        }
        const staleQueued = await reconcileRunningRunsWithStaleQueuedJobs(pool);
        if (staleQueued > 0) {
            console.log(`[reaper] Startup: marked ${staleQueued} run(s) failed (stale queued, never claimed)`);
        }
    }
    catch (err) {
        console.error("[reaper] Startup reconcile error:", err);
    }
    setInterval(async () => {
        try {
            const reaped = await reapStaleLeases(pool);
            if (reaped > 0)
                console.log(`[reaper] Reclaimed ${reaped} stale leases`);
            const reconciled = await reconcileRunStatuses(pool);
            if (reconciled > 0)
                console.log(`[reaper] Reconciled ${reconciled} run(s) to succeeded`);
            const noPending = await reconcileRunningRunsWithNoPendingJobs(pool);
            if (noPending.succeeded > 0 || noPending.failed > 0) {
                console.log(`[reaper] Reconciled runs with no pending jobs: ${noPending.succeeded} succeeded, ${noPending.failed} failed`);
            }
            const staleQueued = await reconcileRunningRunsWithStaleQueuedJobs(pool);
            if (staleQueued > 0) {
                console.log(`[reaper] Marked ${staleQueued} run(s) failed (stale queued, never claimed)`);
            }
        }
        catch (err) {
            console.error("[reaper] Error:", err);
        }
    }, REAPER_INTERVAL_MS);
}
async function startDriftMonitor() {
    setInterval(async () => {
        try {
            for (const env of ["prod", "staging"]) {
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
        }
        catch (err) {
            console.error("[drift] Error:", err);
        }
    }, DRIFT_CHECK_INTERVAL_MS);
}
async function startNoArtifactsScanLoop() {
    setInterval(async () => {
        try {
            await scanAndRemediateNoArtifactsRuns();
            await scanAndRemediateBadArtifactRuns();
        }
        catch (err) {
            console.error("[self-heal] No-artifacts scan error:", err);
        }
    }, NO_ARTIFACTS_SCAN_INTERVAL_MS);
}
const LOG_INGEST_INTERVAL_MS = 2 * 60_000; // 2 minutes
function startRenderLogIngestLoop() {
    if (process.env.ENABLE_RENDER_LOG_INGEST !== "true")
        return;
    setInterval(async () => {
        try {
            const { runScheduledLogIngest } = await import("./render-log-ingest.js");
            const result = await runScheduledLogIngest();
            if (result.linesInserted > 0) {
                console.log(`[log-ingest] Ingested ${result.linesInserted} lines for ${result.runsTouched} run(s)`);
            }
        }
        catch (err) {
            console.error("[log-ingest] Error:", err);
        }
    }, LOG_INGEST_INTERVAL_MS);
    console.log("[control-plane] Render log ingest started (every 2 min)");
}
async function main() {
    console.log("[control-plane] Starting AI Factory Control Plane...");
    await startReaperLoop();
    console.log("[control-plane] Lease reaper started");
    await startDriftMonitor();
    console.log("[control-plane] Drift monitor started");
    await startNoArtifactsScanLoop();
    console.log("[control-plane] No-artifacts self-heal scan started");
    startProcessFailedRunsLoop();
    startRenderLogIngestLoop();
    startApi();
    console.log("[control-plane] API started");
    console.log("[control-plane] Ready");
}
main().catch((err) => {
    if (process.env.SENTRY_DSN?.trim()) {
        Sentry.captureException(err);
        void Sentry.close(2000).then(() => process.exit(1));
    }
    else {
        console.error("[control-plane] Fatal:", err);
        process.exit(1);
    }
});
//# sourceMappingURL=index.js.map