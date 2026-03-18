import "dotenv/config";
import * as Sentry from "@sentry/node";
import { spawnSync } from "child_process";
import path from "path";

/** Validate required env before migrations. Exits if DATABASE_URL missing; logs warnings for self-heal config. */
function validateEnv(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[control-plane] DATABASE_URL is not set. Set it in .env or Render env so the API and migrations can run.");
    process.exit(1);
  }
  if (process.env.ENABLE_SELF_HEAL === "true") {
    if (!process.env.RENDER_API_KEY?.trim()) {
      console.warn("[control-plane] ENABLE_SELF_HEAL=true but RENDER_API_KEY is not set; deploy-failure self-heal will not trigger redeploys.");
    }
    if (!process.env.RENDER_STAGING_SERVICE_IDS?.trim()) {
      console.warn("[control-plane] ENABLE_SELF_HEAL=true but RENDER_STAGING_SERVICE_IDS is not set; set comma-separated api, gateway, runner service IDs. See docs/OPERATIONS_RUNBOOK.md.");
    }
  }
}

/** App root: parent of the directory containing the bundle (dist/). So scripts/ and schemas/ resolve correctly. */
function getAppRoot(): string {
  const bundleDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(process.argv[1] ?? ".");
  return path.join(bundleDir, "..");
}

/** Run DB migrations on startup so schema is always applied (self-heal). Runs scripts/run-migrate.mjs from app root so every deploy applies migrations regardless of Render start command. */
function runMigrationsOnStartup(): void {
  const appRoot = getAppRoot();
  const scriptPath = path.join(appRoot, "scripts", "run-migrate.mjs");
  const result = spawnSync(process.execPath, [scriptPath], {
    env: process.env,
    cwd: appRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error("[control-plane] Migrations failed; exiting.");
    process.exit(result.status ?? 1);
  }
  console.log("[control-plane] Migrations complete.");
}

validateEnv();

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
import { reapStaleLeases, reconcileRunStatuses, reconcileRunningRunsWithNoPendingJobs, reconcileRunningRunsWithStaleQueuedJobs, sweepDelayedRetries } from "./reaper.js";
import { computeDrift, executeRollback, routeRun } from "./release-manager.js";
import { tightenPoliciesOnDrift } from "./policy-auto-tighten.js";
import { scanAndRemediateNoArtifactsRuns, scanAndRemediateBadArtifactRuns } from "./no-artifacts-self-heal.js";
import { scanAndRemediateDeployFailure } from "./deploy-failure-self-heal.js";
import { scanAndRemediateVercelDeployFailure } from "./vercel-redeploy-self-heal.js";
import { computeSchemaDrift } from "./schema-drift.js";
import { runEvalInitiativeScan } from "./eval-initiative-scan.js";

const REAPER_INTERVAL_MS = 30_000;
const DRIFT_CHECK_INTERVAL_MS = 60_000;
const SCHEMA_DRIFT_ALERT_INTERVAL_MS = 10 * 60_000; // 10 minutes — automated schema drift alerts
const NO_ARTIFACTS_SCAN_INTERVAL_MS = 3 * 60_000; // 3 minutes
const DEPLOY_FAILURE_SCAN_INTERVAL_MS = 5 * 60_000; // 5 minutes — Render + Vercel failed deploys
const AUTONOMOUS_RECOVERY_INTERVAL_MS = 2 * 60_000; // 2 minutes — incident watcher → evidence → classify → plan → execute
const EVAL_INITIATIVE_INTERVAL_MS = Number(process.env.EVAL_INITIATIVE_INTERVAL_MS) || 24 * 60 * 60 * 1000; // 24h default

async function startReaperLoop(): Promise<void> {
  try {
    const reconciled = await reconcileRunStatuses(pool);
    if (reconciled > 0) console.log(`[reaper] Startup: reconciled ${reconciled} run(s) to succeeded`);
    const noPending = await reconcileRunningRunsWithNoPendingJobs(pool);
    if (noPending.succeeded > 0 || noPending.failed > 0) {
      console.log(`[reaper] Startup: reconciled ${noPending.succeeded} run(s) to succeeded, ${noPending.failed} to failed (no pending jobs)`);
    }
    const staleQueued = await reconcileRunningRunsWithStaleQueuedJobs(pool);
    if (staleQueued > 0) {
      console.log(`[reaper] Startup: marked ${staleQueued} run(s) failed (stale queued, never claimed)`);
    }
  } catch (err) {
    console.error("[reaper] Startup reconcile error:", err);
  }
  setInterval(async () => {
    try {
      const reaped = await reapStaleLeases(pool);
      if (reaped > 0) console.log(`[reaper] Reclaimed ${reaped} stale leases`);
      const swept = await sweepDelayedRetries(pool);
      if (swept > 0) console.log(`[reaper] Swept ${swept} delayed retry(ies)`);
      const reconciled = await reconcileRunStatuses(pool);
      if (reconciled > 0) console.log(`[reaper] Reconciled ${reconciled} run(s) to succeeded`);
      const noPending = await reconcileRunningRunsWithNoPendingJobs(pool);
      if (noPending.succeeded > 0 || noPending.failed > 0) {
        console.log(`[reaper] Reconciled runs with no pending jobs: ${noPending.succeeded} succeeded, ${noPending.failed} failed`);
      }
      const staleQueued = await reconcileRunningRunsWithStaleQueuedJobs(pool);
      if (staleQueued > 0) {
        console.log(`[reaper] Marked ${staleQueued} run(s) failed (stale queued, never claimed)`);
      }
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
            const tightened = await tightenPoliciesOnDrift(pool, env).catch(() => ({ rulesUpdated: false, capabilityGrantsUpdated: 0 }));
            if (tightened.rulesUpdated || tightened.capabilityGrantsUpdated > 0) {
              console.warn(`[drift] Policy auto-tightening: rules=${tightened.rulesUpdated}, capability_grants=${tightened.capabilityGrantsUpdated}`);
            }
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
      await scanAndRemediateBadArtifactRuns();
    } catch (err) {
      console.error("[self-heal] No-artifacts scan error:", err);
    }
  }, NO_ARTIFACTS_SCAN_INTERVAL_MS);
}

const LOG_INGEST_INTERVAL_MS = 2 * 60_000; // 2 minutes

function startRenderLogIngestLoop(): void {
  if (process.env.ENABLE_RENDER_LOG_INGEST !== "true") return;
  setInterval(async () => {
    try {
      const { runScheduledLogIngest } = await import("./render-log-ingest.js");
      const result = await runScheduledLogIngest();
      if (result.linesInserted > 0) {
        console.log(`[log-ingest] Ingested ${result.linesInserted} lines for ${result.runsTouched} run(s)`);
      }
    } catch (err) {
      console.error("[log-ingest] Error:", err);
    }
  }, LOG_INGEST_INTERVAL_MS);
  console.log("[control-plane] Render log ingest started (every 2 min)");
}

/** Schema drift alert: every 10 min, compare current DB schema to last stored snapshot; if drift, log and record to incident_memory. */
function startSchemaDriftAlertLoop(): void {
  setInterval(async () => {
    try {
      const result = await computeSchemaDrift(pool);
      if (!result.has_drift || !result.diff) return;
      const msg = `Schema drift detected: tables_added=${result.diff.tables_added.length} tables_removed=${result.diff.tables_removed.length} columns_added=${result.diff.columns_added.length} columns_removed=${result.diff.columns_removed.length}`;
      console.warn("[schema-drift]", msg, result.diff);
      try {
        const { recordResolution: incidentRecord } = await import("./incident-memory.js");
        await incidentRecord(pool, "schema_drift", "schema_drift", msg, 0.7);
      } catch (_) {
        // incident_memory table may not exist
      }
    } catch (err) {
      console.error("[schema-drift] Error:", err);
    }
  }, SCHEMA_DRIFT_ALERT_INTERVAL_MS);
  console.log("[control-plane] Schema drift alert loop started (every 10 min)");
}

/** Deploy-failure self-heal: every 5 min, check Render (api/gateway/runner) and Vercel projects; if latest deploy failed/canceled, trigger redeploy. Requires ENABLE_SELF_HEAL, RENDER_API_KEY, RENDER_STAGING_SERVICE_IDS (Render); VERCEL_TOKEN + VERCEL_PROJECT_IDS (Vercel). */
function startDeployFailureScanLoop(): void {
  const run = async () => {
    try {
      await scanAndRemediateDeployFailure();
      await scanAndRemediateVercelDeployFailure();
    } catch (err) {
      console.error("[self-heal] Deploy-failure scan error:", err);
    }
  };
  // Run once after 30s so we don't block startup; then every 5 min
  setTimeout(run, 30_000);
  setInterval(run, DEPLOY_FAILURE_SCAN_INTERVAL_MS);
  console.log("[control-plane] Deploy-failure self-heal scan started (every 5 min)");
}

/** Autonomous recovery: incident watcher → evidence → classify → plan → execute. Requires ENABLE_AUTONOMOUS_RECOVERY=true and incident tables (20250403* migrations). */
function startAutonomousRecoveryLoop(): void {
  if (process.env.ENABLE_AUTONOMOUS_RECOVERY !== "true") return;
  const run = async () => {
    const { runRecoveryCycle } = await import("./autonomous-recovery/index.js");
    try {
      const result = await runRecoveryCycle();
      if (result.watched.opened + result.watched.updated + result.evidence.processed + result.classified + result.planned + result.executed > 0) {
        console.log("[autonomous-recovery] Cycle:", result.watched, "evidence:", result.evidence.processed, "classified:", result.classified, "planned:", result.planned, "executed:", result.executed);
      }
    } catch (err) {
      console.error("[autonomous-recovery] Error:", err);
    }
  };
  setTimeout(run, 45_000); // after deploy-failure first run
  setInterval(run, AUTONOMOUS_RECOVERY_INTERVAL_MS);
  console.log("[control-plane] Autonomous recovery loop started (every 2 min)");
}

function startEvalInitiativeLoop(): void {
  if (process.env.ENABLE_EVAL_INITIATIVE !== "true") return;
  const run = async () => {
    try {
      const result = await runEvalInitiativeScan();
      if (result.initiativesCreated > 0 || result.replaysTriggered > 0) {
        console.log("[eval-initiative] Scan done:", result.initiativesCreated, "initiatives,", result.replaysTriggered, "replays");
      }
    } catch (err) {
      console.error("[eval-initiative] Error:", err);
    }
  };
  setTimeout(run, 60_000); // first run after 1 min
  setInterval(run, EVAL_INITIATIVE_INTERVAL_MS);
  console.log("[control-plane] Eval Initiative scan started (every", Math.round(EVAL_INITIATIVE_INTERVAL_MS / 3600000), "h)");
}

async function main(): Promise<void> {
  console.log("[control-plane] Starting AI Factory Control Plane...");

  // Start HTTP server first so Render health check gets 200 before migrations/reaper (avoids deploy stuck in "Deploying").
  startApi();
  console.log("[control-plane] API started (health check available)");

  runMigrationsOnStartup();

  await startReaperLoop();
  console.log("[control-plane] Lease reaper started");

  await startDriftMonitor();
  console.log("[control-plane] Drift monitor started");

  await startNoArtifactsScanLoop();
  console.log("[control-plane] No-artifacts self-heal scan started");

  startRenderLogIngestLoop();

  startDeployFailureScanLoop();

  startAutonomousRecoveryLoop();

  startEvalInitiativeLoop();

  startSchemaDriftAlertLoop();

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
