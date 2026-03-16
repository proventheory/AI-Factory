# Deploy Vertical Kernel (Phase 2)

The **deploy vertical** is the first vertical kernel on the AI-Factory substrate. It owns deploy, release, repair, and evolution-for-deploy_repair. It uses the **platform kernel** only for execution (runs, job_runs, artifacts, events); all deploy/repair domain state lives in the vertical.

## Success criterion (Phase 2)

Deploy-repair logic can be described as a vertical kernel with **minimal kernel dependencies**.

## What the kernel provides (used by this vertical)

| Kernel primitive | How deploy vertical uses it |
|------------------|-----------------------------|
| **runs** | Self-heal creates initiatives and compiles plans; `createRun(planId, …)` starts a run. Deploy-failure self-heal and eval-initiative-scan create runs. |
| **job_runs** | Runner executes nodes (e.g. analyze_repo, write_patch, push_fix). Evolution replay can be enqueued as queued experiment_runs (dedicated queue) or future job_runs with job_type evolution_replay. |
| **artifacts** | Runs produce artifacts (repo_summary, patch, push_fix_result). Lineage is kernel-owned. |
| **events** | run_events, job_events record execution history. |
| **leases / policies / workers** | Release routing, policy gates, worker registry—used for where runs execute, not for deploy domain logic. |

The deploy vertical **does not** add deploy-specific columns to runs or job_runs. It attaches context via initiative `goal_metadata` (e.g. `deploy_failure`) and evolution `experiment_runs` / `mutation_proposals`.

## What the vertical owns (domain state)

All of the following are **deploy vertical** state; they are not part of the platform kernel:

| Area | Tables / concepts | Control-plane modules |
|------|-------------------|------------------------|
| **Incidents & recovery** | incidents, incident_evidence, failure_signatures, incident_signature_matches, repair_plans, repair_attempts, verification_runs, incident_memories, release_recovery_state | autonomous-recovery/*, incident-watcher, incident-worker jobs |
| **Repair library** | repair_recipes (and seeds) | autonomous-recovery/repair-planner, repair-executor; repair-engine.ts (legacy recipe lookup) |
| **Deploy failure self-heal** | Initiatives with goal_metadata.deploy_failure; plans from pipeline_patterns (self_heal, deploy_fix) | deploy-failure-self-heal.ts, deploy-failure-scan-trigger-only.ts |
| **Release / routing** | releases, release routing, canary, rollback | release-manager.ts |
| **Deploy events** | deploy_events (if present), topology/graph for deploy view | deploy-events.ts, graphs/topology-graph |
| **Evolution (deploy_repair only)** | mutation_proposals, experiment_runs, fitness_scores, promotion_decisions, evolution_targets (domain deploy_repair) | evolution/* (target-registry, mutation-manager, experiment-orchestrator, promotion-gate) |
| **Vercel / Render** | External APIs; no domain tables | vercel-redeploy-self-heal.ts, render-worker-remediate.ts |

## Single entry point (vertical facade)

The deploy vertical is exposed as a single facade so that callers (API, jobs, console) depend on the vertical, not scattered modules:

- **`control-plane/src/verticals/deploy-repair/index.ts`** — Re-exports: autonomous-recovery (runRecoveryCycle, planRepairForIncident, executeRepairPlan, etc.), deploy-failure-self-heal (scanAndRemediateDeployFailure), evolution (deploy_repair domain only), release-manager (deploy-related), and documents kernel usage.

Console and API can import from `verticals/deploy-repair` for deploy/repair/evolution features and from kernel/scheduler for run creation and advancement.

## Boundary rules

1. **No deploy domain in kernel schema** — initiatives, plans, and job_types (e.g. self_heal, analyze_repo) are used by the vertical but defined in shared pipeline/config; the kernel does not reference incidents, repair_plans, or evolution_targets.
2. **Vertical calls kernel** — The vertical calls `createRun`, scheduler advances, runner claims job_runs. The kernel never imports from `verticals/deploy-repair` or `autonomous-recovery`.
3. **Evolution stays in vertical** — Evolution Loop V1 for deploy_repair is part of this vertical (evolution_targets domain deploy_repair, mutation targets like repair_recipe_order). Other verticals (e.g. SEO) may get their own evolution domain later.

## Files that implement the deploy vertical (no kernel refactor)

- `control-plane/src/autonomous-recovery/*` — incident detection → classify → plan → execute → verify → memory
- `control-plane/src/deploy-failure-self-heal.ts` — scan failing deploys, create initiative + run
- `control-plane/src/deploy-failure-scan-trigger-only.ts` — trigger-only scan (e.g. from runner)
- `control-plane/src/release-manager.ts` — release routing, rollback, canary (deploy-related surface)
- `control-plane/src/deploy-events.ts` — deploy event ingestion
- `control-plane/src/evolution/*` — evolution loop (deploy_repair domain)
- `control-plane/src/repair-engine.ts` — legacy repair recipe lookup (align with repair_recipes schema)
- `control-plane/src/vercel-redeploy-self-heal.ts` — Vercel deploy self-heal
- `control-plane/src/render-worker-remediate.ts` — Render deploy trigger
- `control-plane/src/jobs/run-incident-watcher.ts`, `run-incident-worker.ts` — job entrypoints for recovery cycle
- `control-plane/src/incident-memory.ts` — incident memory lookup (used by runner/job_failures)
- `control-plane/src/eval-initiative-scan.ts` — eval initiatives (failure-cluster replay)
- `runners/src/handlers/*` — analyze_repo, write_patch, push_fix, evolution_replay (deploy/evolution)
- `runners/src/evolution/*` — fitness, evolution-replay handler

Kernel-only modules (not part of deploy vertical): `scheduler.ts`, `db.ts`, `plan-compiler.ts` (generic), graph base, run/job/artifact persistence, worker registry.
