# Graph engine and self-heal — index

This page is the entry point for **graph, lineage, capability resolver, artifact consumption, and self-heal**. Implementation and runbooks are in the following docs.

---

## Implementation and API

| Doc | Contents |
|-----|----------|
| **[GRAPH_ENGINE_IMPLEMENTATION_STATUS.md](GRAPH_ENGINE_IMPLEMENTATION_STATUS.md)** | Gate A (code complete) and **Gate B (deploy complete)** checklists; Phases 0–5 implemented; invariants (artifact hygiene, migrations in same PR). |
| **[CAPABILITY_GRAPH.md](CAPABILITY_GRAPH.md)** | Capability resolver: `GET/POST /v1/capability/resolve` ("which operator produces X?"); `POST /v1/runs/by-artifact-type`; ranking policy; Phase 4 (future) code-agent tool use. |
| **[SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md)** | Local self-heal (`npm run self-heal`), platform self-heal (GitHub fix-me label), **large deploy** and two failure classes (deploy/startup vs runtime/schema). |

---

## Lineage and graph APIs

- **Lineage:** `GET /v1/graph/lineage/:artifactId` — returns `declared_producer` (plan node that produced the artifact) and `observed_consumers` (job runs that consumed it).
- **Capability resolve:** `GET /v1/capability/resolve?produces=<artifact_type>` or `POST /v1/capability/resolve` with body `{ produces, consumes? }`.
- **Run by artifact type:** `POST /v1/runs/by-artifact-type` — resolve operator → create plan + run → runner produces artifact.

---

## Runbooks

| Runbook | When to use |
|---------|-------------|
| **[runbooks/large-deploy-verification.md](runbooks/large-deploy-verification.md)** | After deploying artifact_consumption, capability graph, or related migrations. Pre-deploy: verify:migrations. Post-deploy: tables, runner migrate→start, lineage API, resolver, capability loop. **Gate B sign-off.** |
| **[runbooks/render-staging-failed-deploy-and-duplicate-runner.md](runbooks/render-staging-failed-deploy-and-duplicate-runner.md)** | Render staging: failed deploy, 42P01 (worker_registry, etc.), pipeline minutes, duplicate runner. |
| **[runbooks/console-db-relation-does-not-exist.md](runbooks/console-db-relation-does-not-exist.md)** | Console shows "relation initiatives does not exist" or job_runs/cost/launches empty — run migrations against the Control Plane DB. |
| **[runbooks/phase-0-verification-baseline.md](runbooks/phase-0-verification-baseline.md)** | Phase 0 verification baseline for graph/self-heal. |

---

## Migrations and runner

- **Runner** runs `scripts/run-migrate.mjs` on every startup (so staging DB gets `artifact_consumption`, capability graph tables when the runner deploys).
- **New migrations:** every `supabase/migrations/*.sql` file must be added to `scripts/run-migrate.mjs` in the same PR. CI: `npm run verify:migrations`. See **CONTRIBUTING.md**.

---

**Console views:** Graph topology, lineage (per artifact), change impact, repair preview, migration guard — see **WHAT_YOU_CAN_DO_WITH_PROFESSORX.md** and **AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md**.

**Plug-in status:** Which Graph & Self-heal features are wired to the API and to Vercel/Render/Supabase/Console: **[GRAPH_SELF_HEAL_PLUGGED_STATUS.md](GRAPH_SELF_HEAL_PLUGGED_STATUS.md)**.
