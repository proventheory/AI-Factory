# Enablement Plan: Turning the Full Vision On

This document maps **what you want** (agency OS, Initiative → Plan → Run → Jobs, tokenized brands, high-value job types, production runners, LLM governance) to **what we do** in code and config. Each section ends with concrete work items and file paths.

---

## 1. Core abstraction: Initiative → Plan → Run → Jobs

**Goal:** All work is a goal (initiative) → execution plan (DAG) → pipeline run → individual jobs executed by agents.

**Current state:**
- **Initiatives:** CRUD via Control Plane `POST/GET /v1/initiatives`; Console has Initiatives list/detail.
- **Plans:** `POST /v1/initiatives/:id/plan` compiles a DAG from a **template** keyed by `intent_type` (or `template_id`). Templates live in `control-plane/src/plan-compiler.ts` (software, issue_fix, migration, factory_ops, ci_gate, crew, self_heal, swe_agent).
- **Runs:** `POST /v1/plans/:id/run` creates a run and queues root nodes via `control-plane/src/scheduler.ts` (`createRun`).
- **Jobs:** Runners poll `job_runs` + `node_progress`, claim with `claimJob` in `runners/src/runner.ts`, execute handler or executor, then `advanceSuccessors` / `checkRunCompletion`.

**Gaps:**
- No **marketing** (or campaign/landing) intent type or template, so you can’t yet “Launch Q2 landing page” as initiative → plan → run.
- Some job types in docs (e.g. `copy_generate`, `deck_generate`) have handler/executor code but are **not registered** in the runner’s handler registry and are **not** in any plan template.

**What to do:**

| # | Task | Where |
|---|------|--------|
| 1.1 | Add **marketing** (and optionally **landing**) intent + plan templates that include `copy_generate`, `deck_generate`, and a new `landing_page_generate` (and optionally `deploy`). | `control-plane/src/plan-compiler.ts` |
| 1.2 | Ensure **every job_type** in every template has a registered handler or executor so runners don’t no-op. | `runners/src/handlers/index.ts` and any executor registration site |
| 1.3 | Document in Console/AGENCY_PLAN: which intent types exist and what pipeline each runs. | `docs/AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md`, Console nav or tooltips |

---

## 2. Agency chaos → Stripe/Linear/Vercel-style ops

**Goal:** Marketing, development, and operations all run through the same orchestration (one console, same pipeline model).

**Current state:**
- Same data model (initiatives, plans, runs, jobs) for all; Console has Dashboard, Initiatives, Plans, Runs, Jobs, Artifacts, Brands, Document templates, Email marketing, Routing, Budgets, etc.
- Dev templates are strong; marketing is “trackable” but not “runnable” as a pipeline (no marketing template, missing job registrations).

**What to do:**

| # | Task | Where |
|---|------|--------|
| 2.1 | Add marketing/campaign flows in the Console: e.g. “New campaign” → pick brand → pick template (deck / report / **landing**) → creates initiative + optional plan/run. | `console/app/` (new or existing campaign flow) |
| 2.2 | Use single “Create initiative” flow with intent_type selector: **software** | **issue_fix** | **marketing** | **landing** (etc.). | `console/` initiative create/edit |
| 2.3 | Show in Dashboard/Runs that runs can be “development” or “marketing” (e.g. from initiative intent_type). | `console/` dashboard and run list/detail |

---

## 3. What this enables: dev + marketing pipelines

**Goal:**  
- **Dev:** Build feature, fix bug, generate PR, run tests, deploy — without manually orchestrating engineers.  
- **Marketing:** Create brand profile, generate pitch deck, email campaign, **generate landing page**, publish — using brand tokens and templates.

**Current state:**
- Dev pipelines: templates and handlers exist (prd → design → codegen → unit_test → code_review; issue_fix; migration; etc.). Runners execute them when running and connected to DB.
- Marketing: brands + document templates + email app exist; **no** pipeline that produces a full landing page or a “campaign” DAG.

**What to do:**

| # | Task | Where |
|---|------|--------|
| 3.1 | **Landing page job** – New job type `landing_page_generate`: input = brand (or brand_profile_id) + optional brief/copy artifact; output = static site (HTML) or Next/React app artifact. | New `runners/src/handlers/landing-page-generate.ts` (or executor); register in runners. |
| 3.2 | **Plan template “marketing”** – e.g. `brand_compile` → `copy_generate` → `landing_page_generate`; optional `deploy` step if adapter exists. | `control-plane/src/plan-compiler.ts` |
| 3.3 | **Plan template “landing”** – Shorter: e.g. `copy_generate` (hero/CTA) → `landing_page_generate` → optional `deploy`. | Same file |
| 3.4 | **Register marketing handlers** – So that when a plan has `copy_generate`, `deck_generate`, `report_generate`, `email_generate`, `brand_compile`, `ui_scaffold`, the runner actually runs them (handler or executor). | `runners/src/handlers/index.ts` and/or executor registration (e.g. wrapper that uses existing handleCopyGenerate, etc.) |
| 3.5 | **Deploy step (optional)** – Job type `deploy` or `vercel_deploy` that takes artifact (e.g. landing page bundle) and deploys to Vercel; requires adapter + env. | New handler/adapter; add to template when ready. |

---

## 4. Tokenized brands (machine-readable → AI-generated everything)

**Goal:** Brand = { colors, typography, tone, logo, imagery, voice }. From that, generate emails, decks, ads, landing pages, UI, reports from the same identity.

**Current state:**
- `brand_profiles` with `design_tokens` (JSONB), `identity`, `tone`, `visual_style`, `copy_style`; `brand_design_tokens_flat` for search; Console Brands CRUD and token tree.
- `packages/tokens` with types and TokenService; runners use `brand-context.ts` to load brand and pass into copy/deck/report/email.
- **BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md** defines the full token taxonomy and implementation order.

**What to do:**

| # | Task | Where |
|---|------|--------|
| 4.1 | Continue **BRAND_DESIGN_TOKENS_UPGRADE_PLAN**: TokenService (get/set/merge/validate/derive), defaults, migration mapping, Console write-through to token paths. | `packages/tokens/`, `console/app/brands/`, `docs/BRAND_TOKENS_TAXONOMY.md` |
| 4.2 | Ensure **landing_page_generate** (and ui_scaffold) consume `design_tokens` + identity/tone so generated pages match the brand. | New handler + brand-context usage |
| 4.3 | Export tokens to **CSS vars** and **email-safe JSON** so emails and web both use the same token set. | `packages/tokens/` export stubs (per upgrade plan). |

---

## 5. Everything is an initiative

**Goal:** Every agency task (fix bug, build dashboard, run migration, code review, client campaign, SEO report, landing page, email funnel) is an initiative → plan → run → jobs.

**Current state:**
- Initiatives are generic (title, intent_type, risk_level, etc.). Plan compiler picks template by `intent_type` (and optional `template_id`). No product change needed beyond adding intent types and templates.

**What to do:**

| # | Task | Where |
|---|------|--------|
| 5.1 | Add **intent_type** values: e.g. `marketing`, `landing` (and keep `software`, `issue_fix`, etc.). Optionally allow **template_id** override in UI. | `control-plane/src/plan-compiler.ts` (TEMPLATES), Console initiative form (intent_type dropdown) |
| 5.2 | List supported intent types and what each template does in docs and (optionally) in Console when creating an initiative. | Docs + Console copy |

---

## 6. LLM governance (routing, budgets, audit)

**Goal:** Routing policies (which model tier per job type), LLM budgets (token/dollar caps), model tiers (e.g. codegen → GPT-5 tier, copywriting → GPT-4, cheap research → smaller models), audit logs, incident tracking.

**Current state:**
- **Tables:** `routing_policies` (job_type, model_tier, config_json), `llm_budgets` (scope_type: job_type | initiative, scope_value, budget_tokens, budget_dollars, period, current_usage); `llm_calls` (run_id, job_run_id, model_tier, model_id, tokens_in, tokens_out, latency_ms).
- **APIs:** Control Plane has CRUD for routing_policies and llm_budgets; runners **do not** read routing_policies yet — they use a hardcoded `pickTier(jobType)` in `runners/src/handlers/index.ts`. Budgets are not enforced before/after LLM calls.

**What to do:**

| # | Task | Where |
|---|------|--------|
| 6.1 | **Use routing_policies in runners** – Before calling the LLM, fetch routing for `job_type` from Control Plane (or a small cache). If a row exists, use its `model_tier`; else fall back to `pickTier(jobType)`. | `runners/src/llm-client.ts` or handlers; optional Control Plane `GET /v1/routing_policies?job_type=...` or use DB from runner. |
| 6.2 | **Enforce llm_budgets** – Before LLM call: check `llm_budgets` for scope (job_type or initiative_id); if current_usage >= budget, block or escalate. After call: increment `current_usage` (tokens and/or dollars). Reset by period (cron or on read). | Control Plane API or runner; `llm_budgets` table. |
| 6.3 | **Audit / incidents** – Ensure every LLM call is recorded in `llm_calls` (already done in handlers). Add incident tracking (e.g. failed runs, error_signature clustering) if not already present. | `runners` recordLlmCall; Control Plane or Console for incident views. |

---

## 7. What it’s trying to become (Linear + Vercel + Zapier + OpenAI for agencies)

**Goal:** One platform for agencies/dev shops/marketing teams: track work (Linear-like), deploy and preview (Vercel-like), automate steps (Zapier-like), AI in every step (OpenAI).

**Current state:** Architecture supports it; gaps are **runners in production**, **high-value job types**, and **one clear “marketing” flow**.

**What to do:** Deliver on sections 1–6; then iterate on UX (single “Run campaign” or “Run build” flow, shared run history, cost visibility).

---

## 8. Missing layer #1: Production runners

**Goal:** System must not be “just a planner” — real workers must run jobs in production.

**Current state:**
- **Runner process:** `runners/src/index.ts` polls DB, claims jobs, runs handler/executor, advances successors. Works with same DB as Control Plane.
- **Deployment:** Runners need to run somewhere (e.g. Render worker, or same host as Control Plane) with `DATABASE_URL` and (for LLM jobs) `LLM_GATEWAY_URL` (or provider keys). Often not yet deployed as a long-running service.

**What to do:**

| # | Task | Where |
|---|------|--------|
| 8.1 | **Run runner in production** – Deploy the runner as a process that connects to the same DB as Control Plane (e.g. Render background worker, or separate “runner” service). Set `DATABASE_URL`, `LLM_GATEWAY_URL` (or equivalent), `WORKER_ID`, `ENVIRONMENT`. | Infra: Render/Vercel/other; `runners/` package. |
| 8.2 | **Start a run from Console** – User compiles plan, then clicks “Start run”. Console calls `POST /v1/plans/:id/run`; runner picks up jobs. Verify in Runs / Jobs / Artifacts. | Already possible if Control Plane and runner share DB; ensure Console has “Start run” and run list. |
| 8.3 | **Document** – Document how to run the runner locally and in production, and how to confirm jobs are being claimed and completed. | README or `docs/RUNNERS_DEPLOYMENT.md`. |

---

## 9. Missing layer #2: High-value job types

**Goal:** System becomes clearly valuable when it can run: `landing_page_generate`, `seo_report_generate`, `pitch_deck_generate`, `fullstack_feature_build`.

**Current state:**
- **pitch_deck_generate** – Can map to existing `deck_generate` (template + data + brand). Need to ensure it’s in a plan template and registered.
- **seo_report_generate** – Can map to `report_generate` with an SEO template. Same: in template + registered.
- **fullstack_feature_build** – Covered by existing **software** template (prd → design → codegen → unit_test → code_review).
- **landing_page_generate** – **Does not exist.** This is the main missing piece.

**What to do:**

| # | Task | Where |
|---|------|--------|
| 9.1 | Implement **landing_page_generate** job: input = brand_profile_id + optional copy artifact; output = HTML or Next/React app (artifact). Use brand design_tokens for theme. | New handler (or executor) in `runners/src/handlers/landing-page-generate.ts`; register; add to marketing/landing templates. |
| 9.2 | Add **marketing** and **landing** plan templates that use copy_generate, deck_generate, report_generate, landing_page_generate. | `control-plane/src/plan-compiler.ts` |
| 9.3 | Register **copy_generate**, **deck_generate**, **report_generate**, **email_generate**, **brand_compile**, **ui_scaffold** in the runner so any plan that references them executes. | `runners/src/handlers/index.ts` (or executor registry). |
| 9.4 | **seo_report_generate** – Either a dedicated job type that fills an SEO report template, or use `report_generate` with template_id = SEO; document in agency plan. | Handler or template config; docs. |

---

## 10. Strategic goal: single console, all agency work via AI pipelines

**Goal:** One console to run marketing campaigns, software development, content production, brand systems, and client deliverables through AI pipelines (= agency OS).

**Current state:** Console and API already support initiatives, plans, runs, jobs, brands, templates, email app, routing, budgets. Missing: production runners, marketing/landing templates, landing_page_generate, and wiring of marketing handlers.

**What to do:** Complete sections 1–9; then refine UX (e.g. “Campaigns” vs “Builds” views, cost and run history, clear CTA for “Run this pipeline”). |

---

## Implementation order (recommended)

1. **Runners can run marketing jobs**  
   - Register existing marketing handlers (copy_generate, deck_generate, report_generate, email_generate, brand_compile, ui_scaffold) so no plan node is a no-op.  
   - Add **marketing** and **landing** plan templates in plan-compiler (without landing_page_generate first, or with a stub).

2. **Landing page end-to-end**  
   - Implement **landing_page_generate** (brand + optional copy → HTML or scaffolded app).  
   - Add it to **landing** / **marketing** templates; optionally add **deploy** step later.

3. **LLM governance**  
   - Runners read **routing_policies** per job_type; optionally enforce **llm_budgets** and expose in Console.

4. **Production runners**  
   - Deploy runner process; document; verify “Start run” from Console results in job execution and artifacts.

5. **Tokenized brands**  
   - Proceed with BRAND_DESIGN_TOKENS_UPGRADE_PLAN so all generators (including landing page) consume a single, rich token set.

6. **Console flows**  
   - “New campaign” / intent_type selector; Dashboard and run list reflect marketing vs dev.

---

## File reference (quick)

| Area | Files |
|------|--------|
| Plan templates / intent types | `control-plane/src/plan-compiler.ts` |
| Run creation / scheduler | `control-plane/src/scheduler.ts` |
| Job claim / execute | `runners/src/runner.ts`, `runners/src/index.ts` |
| Handlers (register) | `runners/src/handlers/index.ts` |
| Executors (register) | `runners/src/executor-registry.ts` (and wherever registerExecutor is called) |
| LLM tier / routing | `runners/src/llm-client.ts` (resolveTier, pickTier; reads routing_policies from Control Plane) |
| Routing / budgets API | `control-plane/src/api.ts` (routing_policies, llm_budgets) |
| Runner deployment | `docs/RUNNERS_DEPLOYMENT.md` |
| Intent types (Console) | `console/src/config/intent-types.ts`; initiative create/edit in `console/app/initiatives/`, `console/app/admin/initiatives/` |
| Brand tokens | `packages/tokens/`, `control-plane/src/api.ts` (brand_profiles), `runners/src/brand-context.ts` |
| Agency plan / what you can do | `docs/AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md` |
| Brand token upgrade | `docs/BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md` |

---

Once these are done, the system will have:  
**initiative → plan → run → jobs** for both dev and marketing; **tokenized brands** driving copy, decks, and landing pages; **production runners** executing real jobs; and **LLM governance** (routing + budgets) so the agency OS is controllable and cost-predictable.

---

## Current implementation status (as of this doc)

- **Plan templates:** **marketing** (brand_compile → copy_generate → deck_generate) and **landing** (copy_generate → landing_page_generate) are added in `control-plane/src/plan-compiler.ts`. Use `intent_type: "marketing"` or `intent_type: "landing"` when creating an initiative, then compile plan and start run.
- **Marketing handlers:** The following job types are registered in `runners/src/handlers/index.ts`: `copy_generate`, `deck_generate`, `report_generate`, `email_generate`, `brand_compile`, `ui_scaffold`, `landing_page_generate`. So pipelines that use these nodes will execute when a runner is connected.
- **landing_page_generate:** Full implementation in `runners/src/handlers/landing-page-generate.ts`: loads brand (design_tokens, identity), reads copy from predecessor artifact metadata, outputs single HTML page with inline CSS from brand colors/fonts (section 9.1 done).
- **Intent type selector (Console):** Create/Edit initiative flows use a dropdown: software, issue_fix, marketing, landing, migration, factory_ops, ci_gate, crew, self_heal, swe_agent, plus "Other (custom)". Config: `console/src/config/intent-types.ts`.
- **Routing policies (runners):** Runners resolve model tier from Control Plane `GET /v1/routing_policies` (cached 5 min). `resolveTier(jobType)` in `runners/src/llm-client.ts`; `callLlmAndRecord` uses it when no tier is passed (section 6.1 done).
- **llm_budgets (runners):** Runners check `llm_budgets` before each LLM call (throw if current_usage >= budget_tokens) and increment `current_usage` after the call. See `runners/src/llm-budgets.ts` (section 6.2 done).
- **Runner deployment:** `docs/RUNNERS_DEPLOYMENT.md`; `Dockerfile.runner` and Render worker service `ai-factory-runner-staging` in `render.yaml` (section 8).
- **Brand token upgrade:** TokenService in `packages/tokens`; `docs/BRAND_TOKENS_MIGRATION_MAPPING.md` for legacy → canonical path mapping (section 4 progress).
