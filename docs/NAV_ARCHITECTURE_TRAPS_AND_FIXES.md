# Nav architecture: traps and fixes

This document captures a blunt critique of the menu/nav plan and the surgical fixes so we avoid architecture traps around branch boundaries, aliases, ownership, and routing.

---

## What’s strong

- **Clear top-level mental model:** 6 branches is the right number. It matches how operators think (ops, orchestration, studio, config, system, builder).
- **Good discipline on “no schema change” for most pages.** That’s how you avoid backend churn while the console stabilizes.
- **Explicit “exists vs required”** is exactly how you prevent scope creep and broken navigation.

---

## The biggest problems (and how they bite you)

### 1) Branch boundaries are still ambiguous (Studio vs Builder is fuzzy)

**Right now:**
- Studio = “Brand, content, templates, media/themes”
- Builder = “Foundation UI config, themes, releases (builder-specific)”

But we also put brand themes under Studio and themes under Builder (partial). That causes:
- duplicate pages (“Themes” appears in two places)
- token ownership confusion (where do design_tokens live? brand? theme? builder?)

**Fix:** Decide a single rule:

- **Studio** = brand assets authored for output (brand profiles, templates, content).
- **Builder** = system primitives used to build those outputs (design token registry, component registry, UI kit, template engine).

Then:
- Brand themes (brand-specific theme instances) belong in **Studio**.
- Design token definitions + component primitives belong in **Builder**.
- A brand theme should **reference** builder tokens (or override them).

---

### 2) “Aliases” in the menu will confuse users and your analytics

We currently have:
- Pipelines = alias of plans/runs
- Executions = alias of runs/job_runs

This causes:
- users thinking Pipelines is a distinct concept
- links that lead to the same list but with different labels
- permissioning confusion (“why can I access runs but not executions?”)
- instrumentation mess (pageviews split across aliases)

**Fix:** If it’s an alias, make it a **saved view** not a menu item.

- “Pipelines” = tab or filter preset inside Plans/Runs.
- “Executions” = tab inside Runs with job_runs view.

Menu items must map to **distinct user intent**, not synonyms.

---

### 3) “Planner” is hand-wavy and will become a dead page

We said: “concept only or link to Initiatives; optional planner_views or reuse initiatives.” That kind of thing ships and then no one uses.

**Fix:** Define Planner as a **composite view with 3 concrete widgets:**

1. **Upcoming runs/jobs** (from runs/job_runs)
2. **Initiatives status rollup**
3. **Approvals queue + SLA**

No new schema needed; just a curated dashboard.

---

### 4) Stages: you’re underestimating the modeling decision

“Stages” is not a cosmetic entity. It can mean:
- plan node grouping (static stage in a pipeline)
- run phase (dynamic stage per execution)
- org reporting dimension (cost/time by stage)

If we add a stages table casually, we’ll regret it.

**Fix (no schema first):**
- Implement “stage” as a **tag on plan_nodes** (`plan_nodes.tags[]` or `metadata->stage`).
- Later promote to first-class stages when we see stable usage.
- Only then attach FK if needed.

Otherwise we’ll add a table and never maintain it.

---

### 5) Webhook Outbox is placed in two branches and the ownership is unclear

We listed Webhook Outbox under Command **and** System. That’s a signal the concept isn’t placed correctly.

**Fix:**
- If the user intent is “monitoring + delivery status” → **System**.
- If the intent is “ops queue to retry/inspect” → still **System**.
- **Command** should remain “read-only high-level ops”; not deep delivery tooling.

**Schema fix:** The proposed outbox schema is missing critical fields. Without these it’s a log, not an outbox:

- `attempt_count`
- `last_error`
- `next_retry_at`
- `idempotency_key`
- `destination` (webhook_id / endpoint)

---

### 6) “Data & config” mixes product config with platform config

We put: releases, policies, adapters, routing policies, budgets, mcp servers. These are not the same class:

- Some are **runtime config** (routing policies, budgets)
- Some are **deployment artifacts** (releases)
- Some are **integration config** (adapters, mcp servers)

This becomes a junk drawer.

**Fix:** Add **sub-sections** with clear framing:

- **Runtime policies** — routing policies, budgets, policies
- **Integrations** — adapters, mcp servers, webhooks
- **Releases** — releases, routes

No schema change — just better grouping in nav.

---

### 7) The “Single source of truth nav” plan misses RBAC + feature flags

We’re defining nav config as static (`NAV_GROUPS_BY_BRANCH`). But enterprise consoles need:

- **RBAC** (role-based access)
- **Feature flag gating** (e.g. stages hidden unless enabled)
- **Environment gating** (prod vs staging differences)

**Fix:** Nav config must support **predicates**:

- `requiresPermission: "policies.read"`
- `featureFlag: "webhook_outbox"`
- `requiresEnv: ["prod","staging"]`

Otherwise we’ll hardcode nav visibility all over the UI.

---

### 8) “Derive current branch from pathname” breaks as soon as routes overlap

This is fine until we introduce dynamic routes, nested views, alias routes, query-based views. We’ll get “wrong branch selected” bugs.

**Fix:**
- Add **explicit `branchId` on each route definition**.
- Do **not** infer branch by searching href strings.
- Inference is okay as a **fallback only**, not primary.

---

### 9) Missing a crucial branch concept: “Observability”

We have Cost Dashboard, Scheduler health, Incidents, Audit, Outbox. These are all observability, but they’re scattered across Command/System.

**Fix:** Treat **Observability as a section** (not a branch):

- **Command:** high-level observability (health, cost, status)
- **System:** deep observability (audit, incidents, outbox, logs)

Make that a consistent rule.

---

### 10) Builder scope wasn’t defined enough — it will become a dumping ground

Builder currently has: Themes, Releases, Components/Foundation (future). Without strict rules, Builder will absorb random config and become unusable.

**Fix:** Write a one-paragraph definition and enforce it:

> **Builder** contains platform-level primitives used to generate UI and artifacts: token registry, component registry, template engine, and release packaging for builder assets.

Nothing else goes in Builder unless it fits that definition.

---

## Quick surgical improvements (minimal change, big payoff)

1. **Rename Builder → “Design System”** (or keep Builder but use the tight definition above).
2. **Make “Pipelines” and “Executions” tabs/saved views**, not menu items.
3. **Put Webhook Outbox only in System**, and expand schema to real outbox semantics (attempt_count, last_error, next_retry_at, idempotency_key, destination).
4. **Make nav.ts support RBAC + feature flags** (predicates on items/groups).
5. **Stop inferring branch from pathname;** store **branchId per route**; use inference only as fallback.

---

## References

- Implementation details: [MENU_AND_NAV_IMPLEMENTATION_PLAN.md](MENU_AND_NAV_IMPLEMENTATION_PLAN.md)
- Brand tokens (Studio/Builder boundary): [BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md](BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md)
