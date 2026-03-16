/**
 * Standalone job entrypoint: run the full recovery pipeline for one incident.
 * Collect evidence → classify → plan → execute. Enqueue when watcher creates a new incident.
 *
 * Run from repo root:
 *   node --import ts-node/esm control-plane/src/jobs/run-incident-worker.ts <incident_id>
 * Or after build from control-plane dir:
 *   node dist/jobs/run-incident-worker.js <incident_id>
 */
import "dotenv/config";
import {
  collectEvidenceForIncident,
  classifyIncident,
  planRepairForIncident,
  executeRepairPlan,
} from "../autonomous-recovery/index.js";
import { pool } from "../db.js";

const incidentId = process.argv[2];
if (!incidentId) {
  console.error("Usage: run-incident-worker.ts <incident_id>");
  process.exit(1);
}

async function run(): Promise<void> {
  await collectEvidenceForIncident(incidentId);

  const { signatureKey, confidence } = await classifyIncident(incidentId);
  console.log("Classified:", { incidentId, signatureKey, confidence });

  const { planId } = await planRepairForIncident(incidentId);
  if (!planId) {
    console.log("No plan created for incident", incidentId);
    return;
  }

  await executeRepairPlan(planId);
  console.log("Executed plan", planId, "for incident", incidentId);
}

run()
  .then(() => {
    pool.end().catch(() => {});
    process.exit(0);
  })
  .catch((err) => {
    console.error("Incident worker failed:", err);
    pool.end().catch(() => {});
    process.exit(1);
  });
