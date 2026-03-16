# Autonomous incident-response and release-recovery

This doc describes the **autonomous recovery** subsystem: detect → gather evidence → classify → plan repair → execute (bounded tools) → verify. It turns the self-heal loop from “retry failed deploys” into “incident watcher + evidence + signatures + repair recipes + executor.”

## Goal

- **Current:** Self-heal detects failed deploy and triggers redeploy; deterministic failures (e.g. migration errors) loop forever.
- **Target:** Detect failure → gather evidence (e.g. Render logs) → classify (e.g. `boot_failed.migration.duplicate_policy`) → choose repair recipe (rollback, branch_patch, quarantine) → execute via bounded tools → verify → close incident and optionally write memory.

Design principle: **availability recovery first, code repair second** (rollback before patch).

## "Fix itself" in practice

The system **does** fix itself in this sense: it **calls the LLM with the real failure logs** (from Render deploy/startup/migration) and **produces a suggested patch** (e.g. migration reorder, idempotent policy). The **remaining part** is **applying that patch** (and optionally automating PR creation). Today, the deploy-failure self-heal creates an initiative with `goal_metadata.deploy_failure.logs`, compiles the issue_fix plan, and auto-starts a run so **analyze_repo** and **write_patch** receive those logs and output a diagnosis + patch artifact; a human (or a future **submit_pr** / GitHub API step) applies the patch and merges. The autonomous-recovery tables and workers add incident state, retry suppression, rollback, and a path to run the same LLM-based patch flow from within the executor (generate_patch → create_branch → commit → deploy candidate → verify → promote).

## Tables (migrations 20250403*)

| Table | Purpose |
|-------|--------|
| `incidents` | One row per failure event; status flow: detected → collecting_evidence → classified → repair_planned → repair_running → … → closed |
| `incident_evidence` | Logs and context (deploy_log, startup_log, migration_log, etc.) |
| `failure_signatures` | Normalized fingerprints (e.g. `boot_failed.migration.missing_relation`) |
| `incident_signature_matches` | Which signature matched (rule / llm / hybrid) |
| `repair_recipes` | Approved strategies per signature/class (rollback, branch_patch, quarantine, …) |
| `repair_plans` | Chosen recipe per incident |
| `repair_attempts` | Each executed action (redeploy, rollback, generate_patch, …) |
| `verification_runs` | Post-repair checks (boot, migration, healthcheck, smoke) |
| `incident_memories` | What worked before (successful recipe, patch ref) |
| `release_recovery_state` | Per service/env: current/last healthy/last failed release, retry_suppressed, failure_streak |

## Workers (control-plane)

- **Incident watcher** (`autonomous-recovery/incident-watcher.ts`): Polls Render (via `RENDER_STAGING_SERVICE_IDS`), opens/updates incidents, updates `release_recovery_state`.
- **Evidence collector** (`evidence-collector.ts`): For incidents in `detected`, fetches Render logs, stores in `incident_evidence`, sets status to `collecting_evidence`.
- **Signature matcher** (`signature-matcher.ts`): Rule-based (and optional LLM) classification; writes `incident_signature_matches`, sets `current_signature_id`, `deterministic_failure`, status `classified`.
- **Repair planner** (`repair-planner.ts`): For `classified`, chooses recipe (rollback vs branch_patch vs quarantine), creates `repair_plans`, sets status `repair_planned`, can set `retry_suppressed` on `release_recovery_state`.
- **Repair executor** (`repair-executor.ts`): Runs plans in status `planned`; creates `repair_attempts` and invokes **bounded tools** (redeploy, restart, mark_quarantined; rollback, generate_patch, etc. stubbed for now).
- **Verifier** (`verifier.ts`): Inserts `verification_runs`; scaffold only (no real health check yet).
- **Memory writer** (`memory-writer.ts`): On incident close (recovered/rolled_back), writes `incident_memories`.

## Enabling

1. Run migrations (they are in `scripts/run-migrate.mjs`; control-plane startup runs them).
2. Set **`ENABLE_AUTONOMOUS_RECOVERY=true`** and **`RENDER_API_KEY`** (and optionally **`RENDER_STAGING_SERVICE_IDS`**) on the control-plane.
3. The control-plane runs `runRecoveryCycle()` every 2 minutes: watch → collect evidence → classify → plan → execute.

## Policy / safety

- **Retry suppression:** After classification as deterministic (e.g. migrate failure), `release_recovery_state.retry_suppressed` is set so the deploy-failure self-heal does not keep redeploying the same bad release.
- **Repair recipes:** Only approved strategy types (retry, restart, rollback, branch_patch, quarantine, escalate). No freestyle prod mutation.
- **Executor:** Only allowed action types (redeploy, rollback, generate_patch, create_branch, …). Rollback, branch patch, shadow migration, and promote are **stubbed**; implement when adding Git/Render rollback APIs.

## Seeded data

- **Failure signatures:** `boot_failed.migration.duplicate_policy`, `boot_failed.migration.missing_relation`, `boot_failed.env.missing_secret`, `runtime_failed.healthcheck_timeout`.
- **Repair recipes:** `migration_duplicate_policy`, `migration_missing_relation`, `runtime_healthcheck_retry`, `quarantine_escalate`.

## Minimal viable (Phase 1)

Already in place:

- Incidents + evidence + signatures + matches + recipes + plans + attempts + verification_runs + memories + release_recovery_state.
- Watcher opens incidents and updates recovery state.
- Evidence collector fetches Render logs.
- Rule-based classifier.
- Planner chooses recipe and can suppress retries.
- Executor runs redeploy/restart and mark_quarantined; other actions skipped with “Tool not implemented yet”.

Next steps for full autonomy:

- Implement **rollback** (Render “deploy previous” or redeploy last known good commit).
- Implement **branch_patch** path: create branch, apply LLM-generated patch (or use existing issue_fix run artifact), run shadow migration, deploy candidate, verify, promote.
- Wire **verifier** to real health checks (e.g. GET service health URL or Render deploy status).
- Optionally add **LLM** to classifier for ambiguous logs and to generate patches inside the executor.

See the implementation spec (tables, workers, policy rules, rollout) in the runbook and the autonomous-recovery TypeScript modules under `control-plane/src/autonomous-recovery/`.
