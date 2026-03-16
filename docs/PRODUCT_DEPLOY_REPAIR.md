# Product: AI-Factory Deploy Repair (Phase 5)

The **first product surface** is the deploy vertical packaged as **AI-Factory Deploy Repair**: autonomous detect → classify → repair → verify → evolve for deploy and release failures.

## Success criterion (Phase 5)

One vertical is packaged as a **product surface** (demos, reliability bar, transferability).

## Product choice

**Deploy repair** is the first product because:

- It already has a full vertical (incidents, repair plans, evolution loop).
- It uses the same execution engine (runs, job_runs, artifacts) and can be sold as “the engine that runs our deploy repair.”
- Demos and handoff are easier when the scope is “one vertical” rather than the whole platform.

## Demo story

1. **Setup** — One service (e.g. Render or Vercel) with deploy webhook or health check; AI-Factory control-plane + runner with DATABASE_URL and (optional) RENDER_API_KEY / GITHUB_TOKEN.
2. **Detect** — Repeated deploy or health failures open an incident (incident_watcher).
3. **Classify** — Evidence collector fetches logs; signature matcher classifies (e.g. migration duplicate policy, missing relation).
4. **Repair** — Planner picks a recipe (rollback_then_branch_patch, quarantine_escalate, etc.); executor runs steps (pause retries, rollback, redeploy, or stub for patch/branch).
5. **Verify** — Verifier checks health; on success, incident closes and memory writer records the pattern.
6. **Evolve** — Evolution Loop V1: mutation proposals (e.g. recipe order), experiment runs (replay cohort), fitness scores, promotion decisions. Console: /evolution/mutations, /evolution/experiments, /evolution/scoreboard.

**One-line pitch:** “AI-Factory Deploy Repair detects failing deploys, classifies root cause, runs safe repair (rollback, redeploy, or patch), verifies, and improves over time via the evolution loop.”

## Reliability bar

To present deploy repair as a product, the following bar must be met (or explicitly documented as limits):

| Item | Bar | Status / notes |
|------|-----|----------------|
| **Incident detection** | Repeated failures open an incident; no silent ignore. | incident_watcher + deploy-failure self-heal. |
| **Classification** | Deterministic failures (e.g. migration, boot) are classified; retries suppressed when appropriate. | signature_matcher, policies. |
| **Repair execution** | At least: pause retries, rollback (if last healthy), redeploy, mark quarantined. | repair_executor (Render redeploy wired). |
| **Verification** | Optional verifier before closing incident. | verifier.ts. |
| **Evolution** | Mutation proposals and experiment runs can be created and replayed; promotion decisions recorded. | Evolution Loop V1. |
| **Observability** | Console views for incidents, repair plans, evolution mutations/experiments/scoreboard. | Graph/memory, evolution pages. |
| **Runbook** | Operator can follow a runbook to enable, configure, and interpret. | This doc + OPERATIONS_RUNBOOK.md + EVOLUTION_LOOP_V1.md. |

**Known limits (transparent):** Patch generation and branch creation may be stubbed; production rollout should start with rollback + redeploy only. Evolution replay uses cohort from incidents/repair_attempts (lightweight); “real” replay through full repair flow is a future enhancement.

## Transferability

So the repo is not only founder-leveraged IP, a new operator or acquirer can run and extend deploy repair:

1. **Handoff doc** — This file (PRODUCT_DEPLOY_REPAIR.md) plus [docs/OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md), [docs/EVOLUTION_LOOP_V1.md](EVOLUTION_LOOP_V1.md), [docs/DEPLOY_VERTICAL_KERNEL.md](DEPLOY_VERTICAL_KERNEL.md), and [control-plane/src/autonomous-recovery/README.md](../control-plane/src/autonomous-recovery/README.md).
2. **Environment** — DATABASE_URL, CONTROL_PLANE_URL, (optional) RENDER_API_KEY, GITHUB_TOKEN, LLM gateway or OPENAI_API_KEY. Document in .env.example or OPERATIONS_RUNBOOK.
3. **Runbooks** — When to run incident watcher, how to trigger deploy-failure scan, how to create a mutation proposal and experiment, how to interpret scoreboard and promotion decisions.
4. **Boundary** — Deploy vertical lives under `control-plane/src/verticals/deploy-repair` and `control-plane/src/autonomous-recovery`; kernel is documented in [KERNEL_SUBSTRATE.md](KERNEL_SUBSTRATE.md). New deploy/repair features go in the vertical, not the kernel.

## Summary

| Deliverable | Content |
|------------|---------|
| **Demo story** | Detect → classify → repair → verify → evolve; one-line pitch. |
| **Reliability bar** | Table of required capabilities and current status/limits. |
| **Transferability** | Handoff doc set, env, runbooks, boundary. |

AI-Factory Deploy Repair is the first product surface; a second vertical (SEO) runs on the same engine and can be packaged separately later.
