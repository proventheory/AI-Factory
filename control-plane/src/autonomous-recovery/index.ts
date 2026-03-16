/**
 * Autonomous incident-response and release-recovery subsystem.
 *
 * Flow: incident_watcher (detect) → evidence_collector → signature_matcher (classify) → repair_planner → repair_executor → verifier → memory_writer.
 *
 * Tables: incidents, incident_evidence, failure_signatures, incident_signature_matches,
 * repair_recipes, repair_plans, repair_attempts, verification_runs, incident_memories, release_recovery_state.
 *
 * To run a full cycle (e.g. from control-plane cron):
 *   await runRecoveryCycle()
 */

import { collectEvidenceForAllDetected } from "./evidence-collector.js";
import { runIncidentWatcherCycle } from "./incident-watcher.js";
import { planRepairForAllClassified } from "./repair-planner.js";
import { executeAllPlannedPlans } from "./repair-executor.js";
import { classifyAllCollectingEvidence } from "./signature-matcher.js";

export type { IncidentStatus, FailurePhase, RepairDecision, RepairDecisionLegacy, SignatureMatch, EvidenceBundle } from "./types.js";
export { matchFailureSignature } from "./signatures.js";
export { shouldSuppressRetries, isDeterministicFailure } from "./policies.js";
export { runIncidentWatcherCycle } from "./incident-watcher.js";
export { collectEvidenceForIncident, collectEvidenceForAllDetected } from "./evidence-collector.js";
export { classifyIncident, classifyAllCollectingEvidence } from "./signature-matcher.js";
export { chooseRepairPlan, planRepairForIncident, planRepairForAllClassified } from "./repair-planner.js";
export { executeRepairPlan, executeAllPlannedPlans } from "./repair-executor.js";
export { runVerification } from "./verifier.js";
export { recordIncidentMemory, onIncidentClosed } from "./memory-writer.js";

/**
 * Run one full recovery cycle: watch → collect evidence → classify → plan → execute (planned only).
 * Call every 1–2 min; executor runs planned plans in the same cycle (or split to a separate worker).
 */
export async function runRecoveryCycle(): Promise<{
  watched: { opened: number; updated: number };
  evidence: { processed: number };
  classified: number;
  planned: number;
  executed: number;
}> {
  const watched = await runIncidentWatcherCycle();
  const evidence = await collectEvidenceForAllDetected();
  const { classified } = await classifyAllCollectingEvidence();
  const { planned } = await planRepairForAllClassified();
  const executed = await executeAllPlannedPlans().then((r) => r.executed);

  return { watched, evidence, classified, planned, executed };
}
