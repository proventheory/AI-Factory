/**
 * Deploy vertical kernel — single entry point for deploy, repair, and evolution (deploy_repair).
 * Uses platform kernel only for: runs, job_runs, artifacts, events.
 * All domain state (incidents, repair_plans, repair_recipes, evolution) lives in this vertical.
 *
 * See docs/DEPLOY_VERTICAL_KERNEL.md for boundary and kernel dependencies.
 */

// Autonomous recovery: incident detection → classify → plan → execute → verify → memory
export {
  runRecoveryCycle,
  runIncidentWatcherCycle,
  planRepairForIncident,
  planRepairForAllClassified,
  executeRepairPlan,
  executeAllPlannedPlans,
  classifyAllCollectingEvidence,
  collectEvidenceForIncident,
  collectEvidenceForAllDetected,
  runVerification,
  recordIncidentMemory,
  onIncidentClosed,
  matchFailureSignature,
  shouldSuppressRetries,
  isDeterministicFailure,
} from "../../autonomous-recovery/index.js";
export type { IncidentStatus, FailurePhase, RepairDecision, RepairDecisionLegacy, SignatureMatch, EvidenceBundle } from "../../autonomous-recovery/types.js";

// Deploy-failure self-heal: scan failing deploys, create initiative + run
export { scanAndRemediateDeployFailure } from "../../deploy-failure-self-heal.js";
export { runDeployFailureScanTriggerOnly } from "../../deploy-failure-scan-trigger-only.js";

// Release manager: routing, rollback, canary (deploy-related)
export { routeRun, executeRollback, computeDrift } from "../../release-manager.js";

// Deploy events
export { createDeployEventFromPayload } from "../../deploy-events.js";

// Evolution (deploy_repair domain only)
export { listEvolutionTargets, validatePatch, getEvolutionTarget } from "../../evolution/target-registry.js";
export {
  createMutationProposal,
  getMutationProposal,
  listMutationProposals,
  updateMutationProposalStatus,
} from "../../evolution/mutation-manager.js";
export {
  createExperimentRun,
  getExperimentRun,
  listExperimentRuns,
} from "../../evolution/experiment-orchestrator.js";
export {
  evaluatePromotionDecision,
  recordPromotionDecision,
  evaluateAndRecordPromotion,
} from "../../evolution/promotion-gate.js";

// Incident memory (used by runner job_failures)
export { lookupBySignature, recordResolution } from "../../incident-memory.js";

// Eval initiative scan (failure-cluster replay)
export { runEvalInitiativeScan } from "../../eval-initiative-scan.js";
