# Graphs, Artifact Hygiene, Capability Graph, Self-Heal — Implementation Status

Status relative to the plan: **Graphs, Artifact Hygiene, Capability Graph, and Self-Heal Loop** (Phases 0–5).  
**Drift rule:** If schema, route shape, ranking policy, or state transitions change, update the RFC and this doc in the same PR.

---

## Gate A — Code complete

| Requirement | Status | Evidence |
|------------|--------|----------|
| Migrations in run-migrate.mjs | Done | `20250331000010_artifact_consumption.sql`, `20250331000011_capability_graph.sql` in [scripts/run-migrate.mjs](../scripts/run-migrate.mjs). All `supabase/migrations/*.sql` files are registered. |
| CI: every migration file must be in run-migrate | Done | [scripts/verify-migrations-registered.mjs](../scripts/verify-migrations-registered.mjs) — fails if any file in `supabase/migrations/` is missing from the migrations array. `npm run verify:migrations`. |
| Lineage API (declared + observed) | Done | `GET /v1/graph/lineage/:artifactId` in [control-plane/src/api.ts](../control-plane/src/api.ts). Returns `declared_producer`, `observed_consumers` with plan_node_id, run_id, job_run_id, node_key, artifact_type, created_at, role. |
| Capability resolver (deterministic ranking) | Done | [control-plane/src/capability-resolver.ts](../control-plane/src/capability-resolver.ts). GET/POST `/v1/capability/resolve`. Ranking: produces match → conjunctive consumes → priority ASC (null last) → lexical key. |
| Resolver wired in at least one path | Done | `POST /v1/runs/by-artifact-type` — resolve → create plan + run. |
| Tests | Done | [runners/tests/artifact-content.test.ts](../runners/tests/artifact-content.test.ts), [control-plane/tests/capability-resolver.test.ts](../control-plane/tests/capability-resolver.test.ts). Resolver boundary test: no nodes created, no plan mutation. |
| Docs | Done | [docs/CAPABILITY_GRAPH.md](CAPABILITY_GRAPH.md), [docs/SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md) (large deploy, two failure classes), [docs/runbooks/large-deploy-verification.md](runbooks/large-deploy-verification.md). |

---

## Gate B — Deploy complete

**How to finish Gate B:**

1. **Deploy staging** (same PR or after merge):
   ```bash
   RENDER_API_KEY=<your_key> node scripts/render-trigger-deploy.mjs --staging
   ```
   Optionally clear build cache: add `--clear` before `--staging`. See [runbooks/render-staging-failed-deploy-and-duplicate-runner.md](runbooks/render-staging-failed-deploy-and-duplicate-runner.md) if deploy fails.

2. **Run the post-deploy checklist** and sign off in [docs/runbooks/large-deploy-verification.md](runbooks/large-deploy-verification.md).

**Checklist (manual, post-deploy):**

- [ ] Tables in target DB: `artifact_consumption`, capability graph tables (`operators`, `artifact_types`, etc.).
- [ ] Runner log: migrate then start; no 42P01.
- [ ] Self-heal: at least one failure path verified (e.g. failed deploy → redeploy → migrate then start). See [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md).
- [ ] Capability loop: resolve → run → artifact produced; lineage correct.
- [ ] Runbook sign-off completed: [large-deploy-verification.md](runbooks/large-deploy-verification.md).

---

## Implemented components

- **Phase 0:** Runbook checklist: [docs/runbooks/phase-0-verification-baseline.md](runbooks/phase-0-verification-baseline.md).
- **Phase 1:** `loadArtifactContentForLlm` in [runners/src/artifact-content.ts](../runners/src/artifact-content.ts); call sites: landing-page-generate, slop-guard; fallback: content → summary → stable JSON; constants and unit tests.
- **Phase 2:** Migration `20250331000010_artifact_consumption.sql` (UNIQUE(artifact_id, job_run_id)); lineage API with declared producer + observed consumers.
- **Phase 3a:** Migration `20250331000011_capability_graph.sql` (tables + seed); resolver API; operator version note in schema/docs.
- **Phase 3b:** `POST /v1/runs/by-artifact-type`; capability-resolver tests (including boundary test).
- **Phase 4:** Deferred (document only).
- **Phase 5:** Docs and runbook updated; large-deploy verification checklist.

---

## Invariants and rules

- **Artifact hygiene:** Any path that may serialize artifact body into model context must use `loadArtifactContentForLlm`. No raw artifact body in LLM prompts.
- **Resolver consumes:** If `consumes` is provided, it means *required* input artifact types (conjunctive). Operator must consume all.
- **Resolver priority:** Lower integer = higher priority; null = lowest; then lexical tie-break on operator key.
- **Migrations:** Every new migration in `supabase/migrations/` must be added to [scripts/run-migrate.mjs](../scripts/run-migrate.mjs) in the same PR. CI enforces this.

---

## Phase 6 (future)

Not in this deploy. See plan: Durable Graph Runtime (graph_runs, graph_nodes, graph_run_events, checkpoints, idempotency, repair, signals).
