---
name: Full Chat Execution Plan
overview: One plan that implements the entire conversation: repo worth/hours (Layer 1), architecture direction and hidden trap (Layers 2–3), Evolution Loop V1 (Layer 4) as Phase 1, plus kernel reduction, vertical kernels, commercialization, and reliability hardening as Phases 2–5. Evolution Loop V1 remains the first concrete implementation step with full scope and estimates.
todos: []
---

# Full Chat Execution Plan: From Analysis to Evolution Loop V1 and Beyond

**Best final framing (Phase 1):** Evolution Loop V1 is the first concrete implementation step from the chat. It formalizes the blueprint’s self-improvement concepts for deploy_repair using bounded mutation proposals, experiments, fitness scoring, and promotion gates. Estimated effort is **~24 hours planned**, **20–32 hours safer**, or **30–40 hours** if replay is implemented through the real repair flow.

**This document now implements the entire chat:** Layer 1 (worth/hours) as reference, Layer 2–3 (architecture + hidden trap) as principles and guardrails, Layer 4 (Evolution Loop V1) as Phase 1 with full scope, and the full roadmap (kernel reduction, vertical kernels, commercialization, reliability hardening) as Phases 2–5 with scope and order.

---

## 1. Layer 1: Repo worth and hours (from the chat)

**Purpose:** Capture the analysis from the conversation so it lives in one place; no implementation.

- **Traditional replacement cost:** ~800–1,600 hours (repo as working artifact); midpoint ~1,100 hours. MVP code-only ~500–900h.
- **Repo value as asset:** As raw repo/IP only, about **$50k–$250k**. With you attached and a clear use case: **$250k–$750k**. With a proven self-improving vertical: **$1M+** believable. As internal engine across your businesses: likely worth more kept than sold.
- **What drives value:** Whether it works, whether someone else can operate it, whether it saves/makes money, transferability without you. Right now: founder-leveraged IP, not yet a clean standalone acquisition object.

---

## 2. Layers 2 & 3: Architecture direction and hidden trap (principles and guardrails)

**From the chat:** Architecture direction is correct; the hidden trap is the database becoming both kernel and prison.

**Principles to follow:**

- **DB owns truth** (execution history); **runtime owns execution**; **domain products own their own opinionated models**; **adapters stay thin**; “graph-native everything” only where it materially helps.
- **Separate platform kernel from vertical kernels:** Keep the orchestration substrate small (runs, attempts, artifacts, events, leases, policies, workers). Build narrow verticals on top (deploy repair, SEO, email, launch, telehealth), each able to win without the whole ontology.
- **Avoid:** Over-centralizing every new behavior into the ledger; building a meta-platform before locking one killer narrow use case; letting self-heal become “self-retry with paperwork.”

**Guardrails applied in this plan:**

- Evolution Loop V1: no code mutation, no schema mutation, no policy-boundary mutation; deploy_repair only; replay-first; low-risk targets first. Behavioral mutation (recipe order, thresholds, weights) before any kernel evolution.

---

## 3. Moat vs commodity vs traps (from the chat)

**Real moat:** Control plane + runner split; artifact/run ledger (replay, lineage, audit); self-heal/repair loop concept.

**Commodity:** MCP/tool adapters, console UI, scripts/migrations/utilities — useful but replaceable.

**Traps:** Universal orchestration ontology (everything forced into the graph); schema evolution hell; fake autonomy (retry loops without bounded action and measurable improvement). Mitigation: kernel vs vertical split and bounded evolution (this plan).

---

## 4. Self-heal vs self-build (from the chat)

- **Self-heal:** “I failed, so I try to repair this instance.”
- **Self-build:** “I observed repeated patterns across many instances, inferred a better strategy, tested it, and changed future behavior.” Evolution Loop V1 is the mutation-and-selection layer that moves the system toward self-build for deploy_repair.

---

## 5. Does this plan implement the entire chat?

**Yes.** This document now covers the full conversation:

- **Layer 1** is captured as reference (Section 1).
- **Layers 2–3** are captured as principles and guardrails (Section 2).
- **Layer 4** (Evolution Loop V1) is fully scoped as **Phase 1** (sections 7–12 below).
- **Full roadmap** (kernel reduction, vertical kernels, commercialization, reliability) is scoped as **Phases 2–5** (Section “Full-chat execution roadmap”).

### What Phase 1 (Evolution Loop V1) implements

- mutation proposals
- experiment runs
- fitness scoring
- promotion decisions
- bounded deploy-repair evolution first
- replay/shadow/canary structure
- promotion gates and guardrails

So Phase 1 covers the “software organism” direction in a **narrow, practical v1** way.

### What Phases 2–5 cover (scope only; not yet implemented)

- **Phase 2:** Kernel reduction — define and shrink orchestration substrate; document kernel vs vertical.
- **Phase 3:** Vertical kernel plan — deploy-repair, then SEO, email, launch, telehealth.
- **Phase 4:** Commercialization — first vertical as product, demos, transferability.
- **Phase 5:** Reliability / observability hardening — production trust, determinism, chaos prevention.

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
- **Covers the entire chat in one plan?** Yes (Layers 1–4 + roadmap Phases 2–5).
- **Implements the whole blueprint?** No; this plan scopes the evolution loop and the roadmap, not the full blueprint.
- **Implements the next highest-leverage step from the chat?** Yes (Phase 1).

---

## 6. Full-chat execution roadmap (Phases 1–5)

Execution order for the **entire chat**:

**Phase 1 — Evolution Loop V1 (first implementation step)**  
Bounded self-improvement for deploy_repair: mutation_proposals, experiment_runs, fitness_scores, promotion_decisions; replay/shadow/canary; promotion gates.  
**Estimate:** ~24h planning; 20–32h safer; 28–32h stricter; 30–40h if replay is real. (See sections 7–12 for full detail.)

**Phase 2 — Kernel reduction plan**  
Define and shrink the orchestration substrate to a minimal stable set: runs, attempts, artifacts, events, leases, policies, workers. Document what stays “kernel” vs “vertical”; avoid the ledger becoming the god object.  
**Scope:** Design doc + incremental migration; no single-hour estimate here — to be planned as a follow-on.

**Phase 3 — Vertical kernel plan**  
Deploy-repair kernel (already in progress), then SEO, email, launch, telehealth as separate verticals with their own state/workflows on the same engine.  
**Scope:** Per-vertical design and integration; order: deploy_repair → then by business priority.

**Phase 4 — Commercialization layer**  
Pick one vertical as first product; demos, reliability bar, transferability so the repo is not only founder-leveraged IP.  
**Scope:** Product choice, demo story, handoff/runbook; to be scoped when Phase 1–3 are underway.

**Phase 5 — Reliability / observability hardening**  
Production readiness, operator determinism, preventing orchestration chaos (the “phase two” that often takes 10x the prototype).  
**Scope:** Observability, failure modes, chaos prevention; to be scoped as productionization phase.

This plan **fully scopes Phase 1** and **defines scope for Phases 2–5**; only Phase 1 has an implementation order and hour estimate in this document.

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

- **Scope:** This plan **implements the entire chat**: Layer 1 (worth/hours) as reference, Layer 2–3 (architecture + trap) as principles and guardrails, **Phase 1** = Evolution Loop V1 fully scoped, **Phases 2–5** = kernel reduction, vertical kernels, commercialization, reliability hardening with scope defined.
- **Phase 1 hours:** **v1a total: 12–20h.** **v1b total: 20–36h.** **Planning number: ~24h.** Safer range: 20–32h. Stricter: 28–32h. Real replay: 30–40h.
- **Roadmap:** Phase 1 (Evolution Loop V1) → Phase 2 (kernel reduction) → Phase 3 (vertical kernels) → Phase 4 (commercialization) → Phase 5 (reliability hardening). Only Phase 1 has implementation order and hour estimate in this doc.
- **Integration traps (Phase 1):** run_events.id type mismatch, evolution_targets conflict semantics, mutation_proposals upsert mismatch, repair_recipes vs repair-engine schema drift, enqueue strategy choice.
