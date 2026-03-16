# Recovery subsystem

This module implements autonomous incident detection, classification, repair planning, bounded execution, verification, and repair memory.

**Location:** `control-plane/src/autonomous-recovery/` (logically equivalent to `src/recovery/` in the rollout pack; job entrypoints live in `control-plane/src/jobs/`).

## Purpose

The old self-heal loop only retried failed deploys. That works for transient failures but fails for deterministic boot or migration defects.

This subsystem changes the model from:

**detect failed deploy → redeploy**

to:

**detect failure → collect evidence → classify root cause → choose safe repair → verify → recover**

## "Fix itself" in practice

The system **calls the LLM with the real failure logs** and **produces a suggested patch**. The **remaining part** is **applying that patch** (and optionally automating PR creation). Deploy-failure self-heal creates an initiative with `goal_metadata.deploy_failure.logs` and auto-starts an issue_fix run; this subsystem adds incident state, retry suppression, rollback, and a path to run the same LLM-based patch flow from the executor.

## Design principles

1. Availability recovery first
2. Deterministic failures should not loop forever
3. Rollback beats blind retry for boot or migration failures
4. LLMs can reason, but only inside bounded repair policies
5. No direct speculative production schema mutation
6. Candidate repairs must be verified before promotion
7. Every resolved incident should improve future repair behavior

## Core state machine

Incident states:

- detected
- collecting_evidence
- classified
- repair_planned
- repair_running
- candidate_verifying
- recovered
- rolled_back
- quarantined
- escalated
- closed

Typical path for deterministic migration failure:

1. watcher opens incident
2. evidence collector fetches deploy/startup/migration logs
3. classifier matches failure signature
4. planner selects rollback_then_branch_patch
5. executor suppresses retries
6. executor rolls back to last healthy release
7. executor creates repair branch and generates patch
8. executor runs shadow migration
9. executor deploys candidate
10. verifier checks readiness, health, and smoke tests
11. candidate is promoted if healthy
12. memory writer stores the successful pattern

## Modules

| File | Role |
|------|------|
| `incident-watcher.ts` | Polls service health and deploy state. Opens incidents or increments failure streaks. |
| `evidence-collector.ts` | Collects logs, diffs, schema state, and related context. |
| `signature-matcher.ts` | Matches incidents to normalized failure signatures (rules first, LLM second). |
| `signatures.ts` | `matchFailureSignature(text)` → SignatureMatch \| null. |
| `policies.ts` | `shouldSuppressRetries`, `isDeterministicFailure`. |
| `repair-planner.ts` | Selects a repair recipe based on signature, policy, and recovery state. |
| `repair-executor.ts` | Runs repair steps: pause retries, rollback, redeploy, create branch, patch, etc. |
| `verifier.ts` | Confirms boot, health, and smoke readiness before promotion. |
| `memory-writer.ts` | Stores resolved incident summaries and successful recipes. |
| `tools/` | **render**, **repo**, **schema**, **llm** — implement for rollback and branch_patch. |

## Migration bundle order (logical 0020–0032)

This repo uses date-prefixed migrations; the **logical** order for the recovery bundle is:

| Logical | File (this repo) |
|---------|-------------------|
| 0020 | 20250403000000_incidents.sql |
| 0021 | 20250403000001_incident_evidence.sql |
| 0022 | 20250403000002_failure_signatures.sql |
| 0023 | 20250403000003_incident_signature_matches.sql |
| 0024 | 20250403000004_repair_recipes.sql |
| 0025 | 20250403000005_repair_plans.sql |
| 0026 | 20250403000006_repair_attempts.sql |
| 0027 | 20250403000007_verification_runs.sql |
| 0028 | 20250403000008_incident_memories.sql |
| 0029 | 20250403000009_release_recovery_state.sql |
| 0030 | (FKs from incidents/signatures/state are in 000002 and 000009) |
| 0031 | 20250403000010_seed_failure_signatures.sql |
| 0032 | 20250403000011_seed_repair_recipes.sql |
| — | 20250403000012_repair_recipes_rollback_then_branch_patch.sql |

All are listed in order in `scripts/run-migrate.mjs`. A listed migration that is missing on disk causes the runner to throw.

## Current signatures

- boot_failed.migration.duplicate_policy
- boot_failed.migration.missing_relation
- boot_failed.env.missing_secret
- runtime_failed.healthcheck_timeout

## Current repair recipes

- migration_duplicate_policy / migration_missing_relation (branch_patch)
- runtime_healthcheck_retry (retry)
- quarantine_escalate
- (rollback_then_patch_* when seeded with applies_to_signature_id)

## Policy defaults

- Repeated deterministic boot or migration failures suppress retries
- Boot or migration failure with prior healthy release prefers rollback
- Branch patching requires sandbox validation
- Candidate release must pass verification before promotion
- Unclassified or low-confidence incidents quarantine or escalate

## Operational rollout

### Phase 1

Enable:

- incidents
- signatures
- retry suppression
- rollback
- quarantine

Do not enable autonomous patch generation yet.

### Phase 2

Enable:

- create repair branch
- generate patch
- shadow migration
- candidate deploy
- verification

### Phase 3

Enable:

- promotion after successful verification
- memory-based recipe ranking

## First implementation scope (executor)

Wire only these actions first:

- pause_retries
- rollback
- redeploy
- mark_quarantined

Leave as stubs initially:

- create_branch
- generate_patch
- run_shadow_migration
- deploy_candidate
- promote_candidate

## Known safe scope

The initial safe target is **api-staging** and **runner-staging** only.

Do not enable speculative production mutation until staging recovery flows are stable.

## Job entrypoints

- `control-plane/src/jobs/run-incident-watcher.ts` — run every 1–2 min (or from control-plane timer).
- `control-plane/src/jobs/run-incident-worker.ts <incident_id>` — run for one incident (evidence → classify → plan → execute → verify → memory).

See also: [docs/AUTONOMOUS_RECOVERY_SPEC.md](../../../docs/AUTONOMOUS_RECOVERY_SPEC.md), [docs/runbooks/render-staging-failed-deploy-and-duplicate-runner.md](../../../docs/runbooks/render-staging-failed-deploy-and-duplicate-runner.md).
