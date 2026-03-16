# Kernel Substrate (Phase 3)

The **platform kernel** is the minimal execution substrate. It stays small and stupid: no domain knowledge (no SEO, deploy, telehealth). Vertical kernels (deploy, SEO, etc.) run on top and use only these primitives.

## Success criterion (Phase 3)

Kernel schema and ownership boundaries are **documented and enforced**.

## Six kernel responsibilities

| Responsibility | Tables / concepts | Description |
|----------------|-------------------|-------------|
| **Run scheduling** | runs, node_progress, node_completions, node_outcomes, plans, plan_nodes, plan_edges | Create runs, advance DAG, mark completion. |
| **Job attempts** | job_runs | One row per attempt; runner claims and completes. |
| **Artifact lineage** | artifacts | Typed outputs per run/job; traceable for replay and audit. |
| **Event logs** | run_events, job_events | Append-only history; time-machine for work. |
| **Worker leasing** | job_claims | Exactly-once execution; claim token, lease expiry, heartbeat. |
| **Policy gates** | policies | Versioned rules (e.g. approval, routing); referenced by runs. |

Supporting orchestration (not domain): **initiatives** (request that compiles to a plan), **releases**, **release_routes** (routing/canary), **approvals**, **adapters**, **tool_calls**, **validations**, **secret_refs**, **secret_access_events**. These stay in the substrate because they are execution infrastructure, not business meaning.

## Kernel tables (canonical list)

**Strict kernel (the six):**

- **runs** — Execution context (plan_id, release_id, environment, status, root_idempotency_key, …).
- **job_runs** — One row per job attempt (run_id, plan_node_id, attempt, status, …).
- **artifacts** — Outputs (run_id, job_run_id, artifact_type, artifact_class, uri, …).
- **run_events** — Append-only run lifecycle (id bigint, run_id, event_type, …).
- **job_events** — Append-only job lifecycle (job_run_id, event_type, …).
- **job_claims** — Leases (job_run_id, worker_id, claim_token, lease_expires_at, …).
- **policies** — Versioned policy (version, rules_json).
- **worker_registry** — Workers (worker_id, last_heartbeat_at, runner_version).

**Substrate (orchestration, no domain):**

- initiatives, plans, plan_nodes, plan_edges
- node_progress, node_completions, node_outcomes
- releases, release_routes
- approvals, adapters, tool_calls, validations
- secret_refs, secret_access_events
- llm_calls (audit), rollback_targets (rollback pointer)

**Not kernel (vertical or legacy):**

- **repair_recipes** — Deploy vertical (autonomous-recovery). The 20250403* migrations define the deploy repair_recipes shape (applies_to_signature_id, applies_to_class, steps, etc.). Any repair_recipes in core schema are legacy or shared; ownership is deploy vertical.
- **incidents**, **repair_plans**, **repair_attempts**, **failure_signatures**, **evolution_*** — Deploy vertical.
- **intent_documents**, **intent_resolutions** — Optional NL layer; can be treated as substrate or product.

## Enforcement rule

**Before adding any new shared table or shared control-plane concept, ask:** *“Is this execution infrastructure, or is this domain meaning?”*

- If **execution infrastructure** (scheduling, attempts, lineage, events, leases, policies, workers) → allowed in kernel/substrate.
- If **domain meaning** (e.g. keyword_clusters, marketing_segments, incident state, repair strategy) → **must not** go in the kernel; it belongs in a **vertical** (deploy, SEO, etc.) with its own migrations and modules.

**Code boundaries:**

- **control-plane/src/scheduler.ts**, **db.ts**, **plan-compiler.ts** (generic), **kernel-contract.ts** — Kernel or shared substrate; must not import from verticals.
- **control-plane/src/verticals/** — Vertical entry points; they import from kernel (scheduler, pool) and from their own domain modules.
- **supabase/migrations/** — Kernel migrations only add substrate/execution tables. New domain tables (e.g. seo_*, marketing_*) go in vertical-scoped migrations (e.g. 20250404* for evolution, 20250403* for incidents/repair).

## What “shrink” means (incremental)

Phase 3 does **not** require a one-time schema migration. It requires:

1. **This document** — Single source of truth for kernel vs vertical.
2. **No new domain in kernel** — All new domain concepts go into verticals (new tables in vertical migrations, new code in verticals/* or domain modules).
3. **Future shrink** — If the repo later moves repair_recipes or other domain tables out of the core schema into vertical-owned schemas or namespaces, that is a follow-on migration. The boundary is already enforced by ownership and this doc.

## Summary

| Layer | Contents |
|-------|----------|
| **Kernel** | runs, job_runs, artifacts, run_events, job_events, job_claims, policies, worker_registry |
| **Substrate** | initiatives, plans, nodes, edges, node_progress, completions, outcomes, releases, routes, approvals, adapters, tool_calls, validations, secrets, llm_calls, rollback_targets |
| **Vertical** | Deploy: incidents, repair_*, evolution_* (deploy_repair). SEO: (to be added in Phase 4). |

The kernel stays small and stupid. Verticals own their domain state and use the kernel only for execution.
