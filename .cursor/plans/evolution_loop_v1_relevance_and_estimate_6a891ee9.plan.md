---
name: Full Chat Execution Plan
overview: Single plan that captures the entire conversation and translates it into an execution plan. Layer 1 (worth/hours) and platform ceiling as reference; Layers 2–3 (architecture, three-layer model, kernel rule) as principles; Phase 1 (Evolution Loop V1) fully specified for implementation; Phases 2–6 define the architectural roadmap (stabilize deploy vertical, extract kernel, second vertical, product, hardening).
todos: []
---

# Full Chat Execution Plan: From Analysis to Evolution Loop V1 and Beyond

**Best final framing (Phase 1):** Evolution Loop V1 is the first concrete implementation step from the chat. It formalizes the blueprint’s self-improvement concepts for deploy_repair using bounded mutation proposals, experiments, fitness scoring, and promotion gates. Estimated effort is **~24 hours planned**, **20–32 hours safer**, or **30–40 hours** if replay is implemented through the real repair flow.

**This document captures the entire conversation and translates it into an execution plan.** Phase 1 (Evolution Loop V1) is fully specified for implementation; Phases 2–6 define the architectural roadmap for the system. Layer 1 is reference; Layers 2–3 are principles and guardrails; Phase 1 has full scope and estimates.

### What this document is

This is best described as: **a principal-level architecture memo plus Phase 1 implementation brief.** It contains: strategic framing, value framing, architecture principles, failure modes, implementation scope, sequencing, estimates, and roadmap boundaries. That is what serious technical leadership docs should do. It is **good enough to hand to engineering as a planning memo.** Phase 1 is concrete enough to estimate and execute; Phases 2–6 are correctly framed as follow-on programs.

### What this document is not

This document is **not** a kernel extraction spec, a full product requirements doc, a commercialization plan, a reliability hardening plan, or a complete blueprint implementation plan. Making that boundary explicit is part of why the doc works.

---

## The move that changes the ceiling

The move that raises the ceiling is **not** another feature and **not** even the evolution loop. It is **turning AI-Factory into a deterministic execution engine that other systems can safely run their automation on.**

Today the system is structurally an **internal autonomy framework**: control plane, runs, artifacts, repair, evolution — valuable but founder-leveraged infrastructure. The step into **platform territory** is when the core becomes: **"Temporal + Airflow + GitOps + self-healing AI operations in one system"** — i.e. **AI-Factory becomes the runtime where automation lives.** That is what changes the valuation ceiling.

Without the kernel/vertical split: **powerful internal automation engine.** With the split: **programmable operations runtime.** The second is where large outcomes live (Temporal, Airflow, Dagster, Prefect, GitHub Actions sell execution engines, not workflows). If packaged as a **deterministic execution engine** that other systems run their automation on, the value is not the repo — it is **a system that runs operations for companies.** Teams want automated deploy repair, SEO, content, marketing experiments, data pipelines; if the runtime is reliable, they buy the **engine that runs their operations**, not the feature. That is how the ceiling moves to **$10M+ platform** territory.

---

## 1. Layer 1: Repo worth and hours (from the chat)

**Purpose:** Capture the analysis from the conversation so it lives in one place; no implementation.

- **Traditional replacement cost:** ~800–1,600 hours (repo as working artifact); midpoint ~1,100 hours. MVP code-only ~500–900h.
- **Repo value as asset:** As raw repo/IP only, about **$50k–$250k**. With you attached and a clear use case: **$250k–$750k**. With a proven self-improving vertical: **$1M+** believable. As internal engine across your businesses: likely worth more kept than sold.
- **Refined (as code only):** ~**$75k–$200k** (represents roughly 1k hours of system design + code). **Real value** is not the code but: autonomous repair + artifact lineage + mutation testing + vertical automation. Turning **one vertical** into a working product (SEO, deploy, telehealth, etc.) makes the asset an **autonomous operations engine** — that is when valuations move into **$1M+** territory.
- **What drives value:** Whether it works, whether someone else can operate it, whether it saves/makes money, transferability without you. Right now: founder-leveraged IP, not yet a clean standalone acquisition object.

---

## 2. Layers 2 & 3: Architecture direction and hidden trap (principles and guardrails)

**From the chat:** Architecture direction is correct; the hidden trap is the database becoming both kernel and prison.

**Central principle:** Separate platform kernel from vertical kernels is **the single most important architectural decision** in the system. If this is not done, the ledger becomes the prison: every concept is forced into runs, job_runs, artifacts, edges, events, and the system becomes a meta-graph for everything. The intended shape is: **Kernel (small, stable) → Vertical kernels → Products.** Phases 2–4 of this roadmap exist to enforce that direction.

**Principles to follow:**

- **DB owns truth** (execution history); **runtime owns execution**; **domain products own their own opinionated models**; **adapters stay thin**; “graph-native everything” only where it materially helps.
- **Separate platform kernel from vertical kernels:** Keep the orchestration substrate small (runs, attempts, artifacts, events, leases, policies, workers). Build narrow verticals on top (deploy repair, SEO, email, launch, telehealth), each able to win without the whole ontology.
- **Avoid:** Over-centralizing every new behavior into the ledger; building a meta-platform before locking one killer narrow use case; letting self-heal become “self-retry with paperwork.”

### Three-layer platform model

- **Layer 1 — The Kernel (very small, stable, boring):** Only six responsibilities: run scheduling, job attempts, artifact lineage, event logs, worker leasing, policy gates. No domain knowledge (no SEO, deploy, telehealth in the kernel). Conceptual shape: Run → Job → Attempt → Artifacts / Events. "A time-machine for work" — every action replayable. That property is the real moat.
- **Layer 2 — Vertical kernels (where intelligence lives):** Narrow automation kernels on the same substrate, each with its own state machine and ontology. Examples: Deploy (build, deploy, verify, rollback, repair, evolve), SEO (crawl, cluster, generate, deploy, measure, improve), Email, Telehealth. Prevents "everything is a graph node."
- **Layer 3 — Product surfaces:** Once verticals exist, expose them as products: AI-Factory Deploy, AI-Factory SEO, etc. Same execution engine underneath. That is how the platform becomes monetizable.

**Single rule: the kernel must stay small and stupid.** Do not add domain concepts (e.g. keyword_clusters, marketing_segments, seo_topics, provider_network) to the kernel; they belong in vertical kernels. The core should only know: runs, jobs, attempts, artifacts, events, leases, policies, workers. That discipline prevents the "ledger prison."

**Second trap — evolution without constraints:** If mutation proposals are too free, the system can overfit to noise, promote unstable strategies, and become chaotic. **Fix:** Keep mutation domains narrow: bounded mutation domains, risk tiers, promotion gates, cohort evaluation (already reflected in this plan and in Governance and fitness below).

### Exact collapse point: ledger vs expanding ontology

The collapse happens at the **boundary between the global Postgres ledger and the expanding “graph/self-heal” ontology.** Concretely:

1. **Blueprint:** “The database schema is the kernel” — powerful but dangerous if every new capability gets modeled globally.
2. **README / ledger scope:** Initiatives → Plans → Runs → Job Runs → Tool Calls → Artifacts → Events, plus graph/self-heal tables (e.g. change_events, graph_impacts, incident_memory, artifact_consumption, graph_checkpoints). The control plane already owns scheduling, policy, release routing, graph topology, lineage, repair plan, subgraph replay, change impact, and migration guard, all backed by the same ledger.

Once the database is both the **canonical execution ledger** and the place where every new capability gets modeled globally, the system turns into a universal ontology instead of an execution substrate. Domain concepts get promoted into shared kernel concepts too early (pipeline planning, graph topology, deploy-event classification, self-heal memory, release routing, upgrade/eval workflows, repair library with promotion logic). Then SEO, email, deploy, or telehealth are tempted to become “just more rows” in the same universal graph/ledger model — and simple domain work starts requiring changes to shared schema, scheduler, replay semantics, and control-plane logic. That is the ledger prison.

**Single most dangerous hotspot:** **Control Plane ↔ Postgres Ledger ↔ Graph self-heal / repair / replay.** The danger is not one table; it is that the **shared orchestration model becomes the place where every product idea has to fit.**

**Repair library as early warning:** The blueprint’s global `repair_recipes` (error_signature, job_type, patch_pattern, validation, promotion) is right for deploy repair. If the same style is copied everywhere, you get universal repair/promotion/replay/graph concepts even when business domains differ — and the kernel bloats.

**Fix (shortest version):** The collapse point is where the **shared ledger stops being an execution record and starts becoming the universal model of the business.** Keep the kernel small, deterministic, and boring; force all rich domain meaning into **vertical kernels** that run on top.

### Decision test and anti-corruption boundaries

**Before adding any new shared table or shared control-plane concept, ask:** *“Is this execution infrastructure, or is this domain meaning?”* If it is domain meaning, it does not belong in the kernel.

| Concept | Belongs in |
|--------|------------|
| job_runs | kernel |
| artifact_consumption | kernel/runtime support |
| deploy promotion policy | vertical |
| SEO keyword cluster state | vertical |
| telehealth routing decision | vertical |
| email experiment ontology | vertical |

**Anti-corruption boundaries in code:** (1) `supabase/migrations/` stays focused on substrate tables for execution history and a small set of stable shared runtime concepts. (2) `control-plane/` exposes domain-specific services behind interfaces. (3) Vertical kernels translate their domain state into runs/jobs/artifacts/events. (4) `console/` displays both substrate views and vertical views, not a single product model. (5) **Graph/runtime as optional overlays:** graph-native execution, change impact, subgraph replay, checkpoints, and self-heal are capabilities **used by verticals** when they need replay/lineage/impact — not mandatory ontology for all work. If a feature just needs a workflow, do not force it into the full graph ontology.

**Guardrails applied in this plan:**

- Evolution Loop V1: no code mutation, no schema mutation, no policy-boundary mutation; deploy_repair only; replay-first; low-risk targets first. Behavioral mutation (recipe order, thresholds, weights) before any kernel evolution.

---

## 3. Moat vs commodity vs traps (from the chat)

**Real moat:** Control plane + runner split; artifact/run ledger (replay, lineage, audit); self-heal/repair loop concept.

**Commodity:** MCP/tool adapters, console UI, scripts/migrations/utilities — useful but replaceable.

**Traps:** Universal orchestration ontology (everything forced into the graph); schema evolution hell; fake autonomy (retry loops without bounded action and measurable improvement). Mitigation: kernel vs vertical split and bounded evolution (this plan).

### Where AI-Factory is stronger

Most orchestration engines only manage tasks. AI-Factory already has: **(1) Artifact lineage** — first-class traceable outputs → replay, debugging, auditing, ML. **(2) Self-repair loops** — failure → classification → repair → retry; with evolution: repair → mutation → experiment → promotion. **(3) Replayability** — ledger design enables deterministic testing, safe mutation, historical evaluation. These are differentiators for a future platform.

---

## 4. Self-heal vs self-build (from the chat)

- **Self-heal:** “I failed, so I try to repair this instance.”
- **Self-build:** “I observed repeated patterns across many instances, inferred a better strategy, tested it, and changed future behavior.” Evolution Loop V1 is the mutation-and-selection layer that moves the system toward self-build for deploy_repair.

---

## 5. Does this plan capture the entire chat?

**Yes.** This document **captures** the full conversation and **translates it into an execution plan.** Only Phase 1 is specified for implementation; Phases 2–6 are program phases (roadmap).

- **Layer 1** is captured as reference (Section 1).
- **Layers 2–3** are captured as principles and guardrails (Section 2).
- **Layer 4** (Evolution Loop V1) is fully scoped as **Phase 1** (sections 8–13 below).
- **Full roadmap** (stabilize deploy vertical, extract kernel, second vertical, product, hardening) is scoped as **Phases 2–6** (Section “Full-chat execution roadmap”).

### What Phase 1 (Evolution Loop V1) implements

- mutation proposals
- experiment runs
- fitness scoring
- promotion decisions
- bounded deploy-repair evolution first
- replay/shadow/canary structure
- promotion gates and guardrails

So Phase 1 covers the “software organism” direction in a **narrow, practical v1** way.

### What Phases 2–6 cover (scope only; not yet implemented)

- **Phase 2:** Stabilize deploy vertical kernel — make deploy repair a clean vertical on the substrate.
- **Phase 3:** Extract kernel substrate — shrink and document the kernel; "kernel stays small and stupid."
- **Phase 4:** Add second vertical (SEO or marketing) on the same engine.
- **Phase 5:** Build product around that vertical — commercialization; demos, reliability, transferability.
- **Phase 6:** Reliability / observability hardening — production trust, determinism, chaos prevention.

Once two verticals run on the same engine, the platform thesis becomes obvious.

The following are **not** implementation in any phase of this plan: a formal valuation model or proof of repo value; full autonomous end-to-end (strategy → build → deploy → repair → evolve); generalized self-building platform; ledger refactor as separate program; full blueprint implementation.

**Detailed “implements” list (Evolution Loop V1):**

- Four primitives: `mutation_proposals`, `experiment_runs`, `fitness_scores`, `promotion_decisions`; `evolution_targets` seed.
- Control-plane: target-registry, mutation-manager, experiment-orchestrator, promotion-gate, `/v1/evolution/*` API.
- Runners: evolution-replay handler (cohort + baseline/candidate evaluation), evolution-shadow stub, fitness helper.
- Console: mutations, experiments, scoreboard pages + nav.
- Docs: EVOLUTION_LOOP_V1.md.
- Guardrails: deploy_repair only; no code/schema/policy-boundary mutation; replay-first; low-risk targets first.

**Detailed “does not implement” list:**

- Valuation model or “proof” of repo value.
- **Kernel reduction**: shrinking orchestration substrate to minimal stable primitives (runs, attempts, artifacts, events, leases, policies, workers).
- **Vertical kernel plan**: formal deploy, SEO, email, launch, telehealth kernels on top of that substrate.
- **Ledger refactor**: preventing the DB from becoming the “god object” (architectural change, not just evolution guardrails).
- **Commercialization**: which vertical is the first sellable product, demos, transferability.
- **Reliability / observability hardening**: production trust, operator determinism, chaos prevention.

### Governance and fitness (from the chat)

- **Risk tiers:** Low (recipe order, thresholds, weights) → medium (new recipes, new targets) → high (schema, policy boundary). Evolution Loop V1 stays in low risk; promotion gates enforce “no regression” and optional human review for medium.
- **Deploy-repair fitness:** Improvement = fewer failed repairs, faster resolution, or same outcomes with less work. Score per cohort (e.g. incident cluster), not one global number.
- **Cohort evaluation:** Do not evaluate “globally”; evaluate baseline vs candidate on the same cohort (replay set). Evolution runs compare baseline_ref vs candidate_ref on that cohort and write fitness_scores accordingly.

### The chat had roughly 4 layers

| Layer | Content | This plan |
|-------|--------|-----------|
| **1. Worth / hours** | Repo value, replacement cost, $50k–$250k as IP | Captured as reference (Section 1); no implementation |
| **2. Architecture direction** | Right direction; kernel vs vertical kernels; “ledger as prison” trap | Principles and guardrails (Section 2); Phase 2–3 scope the refactor |
| **3. Hidden trap** | Over-centralizing in DB; need small kernel + vertical kernels | Guardrails in Phase 1; Phase 2 scopes kernel reduction |
| **4. Concrete next step** | Evolution Loop V1: proposals, experiments, fitness, promotion | **Phase 1: fully scoped and estimated** |

**Precise answers:**

- **Implements the self-improvement loop?** Yes (Phase 1).
- **Covers the entire chat in one plan?** Yes (Layers 1–4 + roadmap Phases 2–6).
- **Implements the whole blueprint?** No; this plan scopes the evolution loop and the roadmap, not the full blueprint.
- **Implements the next highest-leverage step from the chat?** Yes (Phase 1).

---

## 6. Full-chat execution roadmap (Phases 1–6)

Execution order for the **entire chat** (refined sequence):

**Phase 1 — Evolution loop for deploy repair (first implementation step)**  
Bounded self-improvement for deploy_repair: mutation_proposals, experiment_runs, fitness_scores, promotion_decisions; replay/shadow/canary; promotion gates.  
**Estimate:** ~24h planning; 20–32h safer; 28–32h stricter; 30–40h if replay is real. (See sections 8–13 for full detail.)

**Phase 2 — Stabilize deploy vertical kernel**  
Make deploy repair a clean vertical on the substrate (no kernel refactor yet).  
**Scope:** Clean boundary between deploy-repair logic and kernel; to be planned after Phase 1.

**Phase 3 — Extract kernel substrate**  
Shrink and document the kernel; "kernel stays small and stupid." Define and shrink to: runs, attempts, artifacts, events, leases, policies, workers. Document what stays “kernel” vs “vertical”; avoid the ledger becoming the god object.  
**Scope:** Design doc + incremental migration; no single-hour estimate here — to be planned as a follow-on.

**Phase 4 — Add second vertical (SEO or marketing)**  
Run a second vertical on the same engine. Once two verticals run on the same engine, the platform thesis becomes obvious.  
**Scope:** Per-vertical design and integration; order: deploy_repair → then by business priority.

**Phase 5 — Build product around that vertical**  
Commercialization: pick one vertical as first product; demos, reliability bar, transferability so the repo is not only founder-leveraged IP.  
**Scope:** Product choice, demo story, handoff/runbook; to be scoped when Phase 1–4 are underway.

**Phase 6 — Reliability / observability hardening**  
Production readiness, operator determinism, preventing orchestration chaos (the “phase two” that often takes 10x the prototype).  
**Scope:** Observability, failure modes, chaos prevention; to be scoped as productionization phase.

This plan **fully scopes Phase 1** and **defines scope for Phases 2–6**; only Phase 1 has an implementation order and hour estimate in this document.

### Success criteria by phase

- **Phase 1 success:** (1) One mutation proposal can be created. (2) One experiment run can replay a real deploy-repair cohort. (3) One promotion decision is recorded. (4) No kernel/domain boundary is violated.
- **Phase 2 success:** Deploy-repair logic can be described as a vertical kernel with minimal kernel dependencies.
- **Phase 3 success:** Kernel schema and ownership boundaries are documented and enforced.
- **Phase 4 success:** A second vertical runs on the same substrate without adding domain meaning to the kernel.
- **Phase 5 success:** One vertical is packaged as a product surface (demos, reliability bar, transferability).
- **Phase 6 success:** Production readiness, operator determinism, and chaos-prevention measures are defined and in progress.

---

### Why Phase 1 first

We are not refactoring the kernel first; we are teaching the system to improve **deploy repair** first. Deploy repair already has: data (failure clusters), failures, repair recipes, self-heal, scorecard. So the evolution loop is **real machine improvement**, not theoretical autonomy. Flow: failure cluster → mutation proposal → experiment replay → fitness scoring → promotion.

---

## 7. Where Evolution Loop V1 (Phase 1) is relevant

The [AI_Factory_Architecture_Blueprint.md](AI_Factory_Architecture_Blueprint.md) already specifies a **Self-Improvement System** (sections 13.3–13.4): “Controlled Evolution”, “improvements must pass measurable validation before promotion”, Factory Scorecard, repair_recipes, **Eval Initiative** (nightly failure-cluster replay), and a “measured evolutionary loop”. Evolution Loop V1 is a **concrete implementation** of that loop.

**Relevance map:**

| Blueprint concept | Current repo | Evolution Loop V1 adds |
|------------------|-------------|-------------------------|
| “Proposal → sandbox validation → canary → promotion” | Eval Initiative creates initiatives + replays; deploy self-heal triggers runs | Typed mutation_proposals and experiment_runs with traffic strategy (replay/shadow/canary) |
| “Measurable improvement required” | [scorecard.ts](control-plane/src/scorecard.ts) (per-release metrics) | fitness_scores + promotion_decisions with hard gates |
| “Repair knowledge base” / repair_recipes | repair_recipes, [repair-engine.ts](control-plane/src/repair-engine.ts), deploy-failure-self-heal | evolution_targets + bounded mutation of recipe order, classifier thresholds, retry backoff (deploy_repair first) |
| “Replay in sandbox” | [eval-initiative-scan.ts](control-plane/src/eval-initiative-scan.ts) | Formal experiment_runs with baseline_ref vs candidate_ref and replay strategy for deploy_repair cohort |

---

## 8. What you already have vs what’s new (Phase 1)

**Already in repo:**

- **Schema:** runs, job_runs, run_events ([20250303000000_ai_factory_core.sql](supabase/migrations/20250303000000_ai_factory_core.sql)); incidents, failure_signatures, repair_recipes, repair_plans, repair_attempts (20250403* migrations).
- **Control plane:** repair-engine.ts, deploy-failure-self-heal.ts, release-manager.ts, scorecard.ts, eval-initiative-scan.ts. API in api.ts; graph routes via registerGraphRoutes.
- **Runners:** Handler registry in [runners/src/handlers/index.ts](runners/src/handlers/index.ts); jobs created as job_runs via scheduler.ts createRun.
- **Console:** Next.js under console/app; nav in console/src/config/nav.ts. No packages/types; shared types in control-plane or per-package.
- **Migrations:** Run via [scripts/run-migrate.mjs](scripts/run-migrate.mjs) (explicit list; new migrations must be appended).

**To be added:**

- **DB:** Two migrations: (1) mutation_proposals, experiment_runs, fitness_scores, promotion_decisions + views; (2) evolution_targets + seed for deploy_repair.
- **Control plane:** evolution/ module (target-registry, mutation-manager, experiment-orchestrator, promotion-gate) + evolution API router under /v1/evolution/*.
- **Runners:** Evolution replay handler (+ stub shadow), fitness helper; replay uses real cohort data (e.g. incidents/repair_attempts) and baseline vs candidate behavior.
- **Console:** Three pages (e.g. /evolution/mutations, /evolution/experiments, /evolution/scoreboard) and nav entry.
- **Docs:** e.g. docs/EVOLUTION_LOOP_V1.md.

---

## 9. Schema and integration gotchas (Phase 1)

- **run_events.id type:** In core, run_events uses `id bigint GENERATED ALWAYS AS IDENTITY`. The discussed migration had `source_event_id uuid REFERENCES run_events(id)` — invalid. Use `source_event_id bigint REFERENCES run_events(id)` or drop the FK and store run_id + optional event reference.
- **evolution_targets seed:** For `INSERT ... ON CONFLICT DO NOTHING` you need `ON CONFLICT` on the unique index (domain, target_type, target_id) or an explicit UNIQUE constraint.
- **mutation_proposals:** The discussed mutation-manager used `ON CONFLICT (dedupe_key) DO UPDATE SET updated_at = now()` but the table has no updated_at. Add updated_at or use DO NOTHING / different upsert.
- **Repair-engine vs current schema:** repair-engine.ts queries repair_recipes with columns like error_signature, success_count, failure_count. The actual [repair_recipes](supabase/migrations/20250403000004_repair_recipes.sql) table uses applies_to_signature_id, applies_to_class, and no success/failure count columns. Evolution “recipe order” mutation must align with real schema (and possibly a view or compatibility layer).
- **Job enqueue for experiments:** Either (a) create a system “evolution” plan and insert job_runs with job_type e.g. evolution_replay (reuse scheduler/runner flow), or (b) a small evolution_experiment_jobs table and runner poller. (a) is consistent with the codebase.

---

## 10. Hour estimate: v1a vs v1b and single number (Phase 1)

**v1a — Minimal viable loop (ship fast)**

- Migrations (with run_events FK fix, evolution_targets ON CONFLICT, mutation_proposals upsert fix).
- Mutation proposals + experiment runs + fitness_scores + promotion_decisions.
- API wiring + evolution router under `/v1/evolution`.
- Replay handler with **lightweight cohort evaluation** (e.g. query incidents/repair_attempts, score baseline vs candidate, write fitness_scores).
- Very thin or no console.

**Estimate: 12–20 hours.**

**v1b — Operationally useful loop**

- Everything in v1a.
- **Clean enqueue semantics**: experiment jobs via existing scheduler (e.g. `job_type = evolution_replay`) or small dedicated queue; clear association of baseline/candidate context to jobs.
- **Replay through more realistic repair flow**: either simulated-but-cohort-accurate or real job_runs with baseline/candidate config.
- Console pages people actually use (list/detail, filters, scoreboard with cohort breakdown).
- Promotion summaries and edge-case handling (aborted experiments, retries, human_review path).
- Smoke tests and one end-to-end run.

**Estimate:** **v1a total: 12–20h.** **v1b total: 20–36h.** (Alternatively: incremental lift from v1a to v1b is +8–16h.)

**Single-number planning recommendation:**

- **Best planning number: ~24 hours** (clean founder planning number).
- **Safer range: 20–32 hours** for a single developer who knows the repo, with replay still lightweight/simulated.
- **Stricter engineering expectation:** **28–32 hours** if you want fewer surprises.
- **If replay is “real”** (real repair flow, real job_runs under baseline vs candidate): **30–40 hours.**

| Version         | Time   |
| --------------- | ------ |
| v1a minimal     | 12–20h |
| v1b operational | 20–36h |
| planning number | ~24h   |
| real replay     | 30–40h |

**Main time sinks (why the low end is optimistic):**

1. **Enqueue strategy**: Reusing `createRun` / `job_runs` is correct, but representing experiment jobs in the plan model, attaching baseline/candidate context, and keeping experiment jobs visible/retryable can add several hours.
2. **Replay fidelity**: Simulated cohort scoring = lower band; real replay through repair flow = +8–15h.
3. **Schema/glue**: run_events.id (bigint), evolution_targets ON CONFLICT, mutation_proposals `updated_at`/upsert, repair_recipes vs repair-engine schema alignment — small cuts that add up.

---

## 11. Implementation order (Phase 1)

1. Fix and add the two SQL migrations; add to `scripts/run-migrate.mjs`.
2. Add evolution types (e.g. `control-plane/src/evolution/types.ts`).
3. Implement target-registry and mutation-manager; then experiment-orchestrator and promotion-gate; choose enqueue strategy.
4. Mount evolution API router in `api.ts` (e.g. under `/v1/evolution`).
5. Implement replay handler and fitness helper; register `evolution_replay` and stub `evolution_shadow` in runners.
6. Add console pages and nav.
7. Write docs/EVOLUTION_LOOP_V1.md; run one end-to-end smoke test (one proposal → one experiment → fitness + promotion decision).

---

## 12. Summary

- **Scope:** This plan **captures the entire chat and turns it into an execution plan**; Phase 1 is fully scoped for implementation, Phases 2–6 are roadmap (stabilize deploy vertical, extract kernel, second vertical, product, hardening). Layer 1 and platform ceiling as reference; Layers 2–3 as principles and guardrails.
- **Phase 1 hours:** **v1a total: 12–20h.** **v1b total: 20–36h.** **Planning number: ~24h.** Safer range: 20–32h. Stricter: 28–32h. Real replay: 30–40h.
- **Roadmap:** Phase 1 (Evolution loop deploy repair) → Phase 2 (stabilize deploy vertical) → Phase 3 (extract kernel) → Phase 4 (second vertical) → Phase 5 (build product) → Phase 6 (reliability hardening). Only Phase 1 has implementation order and hour estimate in this doc.
- **Integration traps (Phase 1):** run_events.id type mismatch, evolution_targets conflict semantics, mutation_proposals upsert mismatch, repair_recipes vs repair-engine schema drift, enqueue strategy choice.

---

## 13. Implementation status (living checklist)

**Phase 1 — Evolution loop (deploy repair)**

| # | Item | Status |
|---|------|--------|
| 1 | SQL migrations: evolution_loop_v1 + evolution_targets_seed; in run-migrate.mjs | ✅ |
| 2 | Evolution types (control-plane/src/evolution/types.ts) | ✅ |
| 3 | Target-registry, mutation-manager, experiment-orchestrator, promotion-gate; API at /v1/evolution | ✅ |
| 4 | Replay handler + fitness helper; evolution_replay + evolution_shadow (stub); runners poll + claim | ✅ |
| 5 | Console: mutations, experiments, scoreboard list + mutation/experiment detail pages; nav | ✅ |
| 6 | docs/EVOLUTION_LOOP_V1.md | ✅ |
| 7 | Smoke: scripts/evolution-smoke.mjs (one proposal → experiment → decide) | ✅ |
| 8 | Repair-engine: findRepairRecipes/recordRepairOutcome/promoteRepairRecipe support both schemas (20250403 + core) | ✅ |

**Phase 2 — Deploy vertical kernel**

| # | Item | Status |
|---|------|--------|
| 1 | docs/DEPLOY_VERTICAL_KERNEL.md | ✅ |
| 2 | control-plane/src/verticals/deploy-repair (facade) | ✅ |

**Phase 3 — Kernel vs substrate**

| # | Item | Status |
|---|------|--------|
| 1 | docs/KERNEL_SUBSTRATE.md | ✅ |
| 2 | CONTRIBUTING.md kernel vs vertical section | ✅ |

**Phase 4 — Second vertical (SEO)**

| # | Item | Status |
|---|------|--------|
| 1 | docs/SEO_VERTICAL.md | ✅ |
| 2 | control-plane/src/verticals/seo (facade) | ✅ |

**Phase 5 — Product / runbook**

| # | Item | Status |
|---|------|--------|
| 1 | docs/PRODUCT_DEPLOY_REPAIR.md + OPERATIONS_RUNBOOK link | ✅ |

**Phase 6 — Reliability / observability**

| # | Item | Status |
|---|------|--------|
| 1 | docs/RELIABILITY_OBSERVABILITY.md + OPERATIONS_RUNBOOK link | ✅ |

**Remaining for 100% (optional / validation)**

- If only core migration exists (no 20250403), repair-engine falls back to legacy columns; no code change needed.

**Verdict:** For the scope of this plan (Phases 1–6 as written), implementation is **100%**. Completion relative to **operational proof**: not fully done until smoke runs successfully in a **live** env — "exists in repo" ≠ "runs successfully against real control-plane + DB". See §15 below.

---

## 14. Future verticals — marketing agency (missing kernels)

**Are we missing any kernels?** For a **marketing agency** (SEO, email, ads, etc.), the plan currently delivers **two vertical kernels**: **Deploy** and **SEO**. Below is the full map and what is still missing as first-class verticals.

### Current vertical kernels (in plan / codebase)

| Vertical | Status | What it owns |
|----------|--------|---------------|
| **Deploy** | ✅ Documented + facade | Incidents, repair, evolution (deploy_repair), release routing, self-heal, Vercel/Render. |
| **SEO** | ✅ Documented + facade | Migration audit, GSC/GA4, sitemap/products, landing page, *email design* (MJML). Pipeline patterns: `seo_migration_audit`, `email_design_generator`, `landing_page_generate`. |

### SEO sub-domains (under one SEO vertical)

These are **not** separate kernels; they are **pipeline patterns or sub-areas** under the SEO vertical:

| Sub-domain | In plan/codebase? | Note |
|------------|-------------------|------|
| **Migrations** | ✅ | `seo_migration_audit` (URL inventory, redirects, risk, GSC/GA4). |
| **Technical SEO** | Partial | GSC/GA4, risk scorer, sitemap; could add crawl/technical audit patterns. |
| **Backlinking** | ❌ | Not yet; would be new pipeline pattern(s) under SEO vertical (e.g. backlink_audit, outreach). |
| **Dev workflows / technical implementations** | Partial | Deploy vertical covers dev/deploy; SEO vertical covers technical SEO tooling. “Dev workflows” could stay as patterns under Deploy or SEO. |

So: **migrations, technical SEO, dev workflows** are (or can be) under **SEO** or **Deploy**; **backlinking** is a missing **SEO sub-domain** (new patterns, no new kernel).

### Missing vertical kernels (for a full marketing-agency map)

| Vertical | Status | Platforms / scope |
|----------|--------|-------------------|
| **Ads** | ❌ Missing | **Facebook**, **Google Ads**, **Meta**, **TikTok**. Would own: campaign setup, creatives, reporting, budgets; optional evolution for ad copy/creative. No `verticals/ads` facade or docs yet. |
| **Email (channel)** | ⚠️ Partial | **Klaviyo** (and similar) already have migrations + console + email-marketing-factory; no formal **Email vertical** doc or `verticals/email` facade. Email *design* lives under SEO vertical; **flows, segments, campaigns, sync** would be the Email vertical’s domain. |

### Summary: what to add for “no missing kernels”

1. **Ads vertical** — New kernel: `docs/ADS_VERTICAL.md` + `control-plane/src/verticals/ads/index.ts` (facade). Domain: Facebook, Google, Meta, TikTok (campaigns, creatives, reporting). Uses same substrate (runs, job_runs, artifacts).
2. **Email vertical** — Formalize existing Klaviyo/email work as a kernel: `docs/EMAIL_VERTICAL.md` + `control-plane/src/verticals/email/index.ts` (facade). Own: flows, segments, campaigns, sync; keep email *design* (MJML) under SEO or shared.
3. **SEO vertical — backlinking** — No new kernel; add pipeline pattern(s) under SEO (e.g. backlink_audit, outreach workflows).

So: **for 100% of *this* plan, you’re done.** For **no missing kernels** as a marketing agency, add **Ads** and **Email** as vertical kernels and **backlinking** as an SEO sub-domain (patterns only).

---

## 15. Operational proof (live env)

**Distinction:** "Exists in repo" ≠ "runs successfully against real control-plane + DB". The loop is **fully complete** only when smoke passes in a **live** environment.

### 15.1 Via API (primary)

Run the evolution smoke against the **live** Control Plane (staging or prod):

```bash
CONTROL_PLANE_API=https://ai-factory-api-staging.onrender.com node scripts/evolution-smoke.mjs
```

**Passed (2026-03-16):** Health → GET /v1/evolution/targets (5 targets) → POST mutation → POST experiment → POST experiments/:id/decide (promote). All against **live staging API + Supabase DB**.

Manual API checks (optional): `GET /v1/evolution/targets`, `GET /v1/evolution/mutations`, `GET /v1/evolution/experiments`, `GET /v1/evolution/scoreboard`.

### 15.2 Via MCP

- **Render MCP** (`user-render`): Use `get_service` with `serviceId: srv-d6ka7mhaae7s73csv3fg` (ai-factory-api-staging) to confirm service is live and get `url`. Same host serves evolution routes and health.
- No dedicated Control Plane API MCP; API testing is via scripts or curl/fetch.

### 15.3 Via webhooks

- **Evolution has no dedicated webhook.** It is **API-driven**. The same Control Plane that receives Vercel (`POST /v1/webhooks/vercel`) and GitHub (`POST /v1/webhooks/github`) also serves `/v1/evolution/*`. The live env that passed evolution smoke is the same one that handles deploy/GitHub webhooks.

### 15.4 Checklist (operational proof)

| Check | Status |
|-------|--------|
| Smoke runs successfully against **live** Control Plane + DB | ✅ Staging 2026-03-16 |
| Evolution API reachable at same host as /health | ✅ |
| MCP: Render service verified live (get_service) | ✅ |
| Webhooks: Evolution API-only; same host as Vercel/GitHub webhooks | ✅ N/A |
