/**
 * Standalone job entrypoint: run one incident-watcher cycle.
 * Use from cron or scheduler every 1–2 minutes, or let the in-process control-plane timer run runRecoveryCycle() instead.
 *
 * Run from repo root (so DATABASE_URL from .env is available):
 *   node --import ts-node/esm control-plane/src/jobs/run-incident-watcher.ts
 * Or after build from control-plane dir:
 *   node dist/jobs/run-incident-watcher.js
 */
import "dotenv/config";
import { runIncidentWatcherCycle } from "../autonomous-recovery/incident-watcher.js";

runIncidentWatcherCycle()
  .then((r) => {
    console.log("Watcher cycle done:", r);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Watcher cycle failed:", err);
    process.exit(1);
  });
