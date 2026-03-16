# How Far We Are & What I Need From You

**Status:** This doc is **historical**. The Console (ProfessorX), AppShell, Dashboard, Initiatives, Plans, Runs, Approvals, Admin, Incidents, Campaign flow, and Control Plane API are **implemented**. For current architecture and status see **[STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md)**, **[docs/README.md](README.md)**, and **[ENABLEMENT_PLAN_FULL_VISION.md](ENABLEMENT_PLAN_FULL_VISION.md)**. For env vars that enable optional features see **[ENABLEMENT_ENV_VARS.md](ENABLEMENT_ENV_VARS.md)**.

**Decisions are locked.** See **STACK_AND_DECISIONS.md** for: Console (Next.js + shadcn + Supabase + Vercel), DB (Supabase Postgres), Control Plane (containerized), Runner Fleet, env vars, build order, and operating mode.

---

## How far we are from the ProfessorX console (screenshots)

The screenshots show the **ProfessorX internal operator console**: login, dark sidebar (Foundation / Blocks / PRODUCTS / CONTENT / Orchestration), AppShell, design tokens, and dense data UI. Here’s the gap.

### Done (backend / kernel)

| Area | Status | Notes |
|------|--------|--------|
| **Schema** | ✅ Done | `001_core_schema.sql`, `002_state_machines_and_constraints.sql` — all tables 5.1–5.21, enums, indexes, state triggers, artifact immutability |
| **Control Plane core** | ✅ Done | Scheduler (createRun, advanceSuccessors, checkRunCompletion, run lock), reaper, release-manager (routeRun, computeDrift, executeRollback), golden-suite, repair-engine, scorecard |
| **Runner core** | ✅ Done | Claim/lease/heartbeat, completeJobSuccess/Failure, single-winner election, reaper integration |
| **Tool calls** | ✅ Done | Idempotency key, request_hash, capability check, executeToolCall |
| **Adapter contract** | ✅ Done | Interface: validate → execute → verify → optional rollback |
| **Project scaffold** | ✅ Done | package.json, tsconfig, control-plane/, runners/, adapters/, README |

### Not done (everything to reach the screenshots)

| Area | Status | Blueprint ref |
|------|--------|----------------|
| **Operator Console (UI)** | ❌ Not started | Section 12B, 12B.4, 12B.5 |
| **Login / auth** | ❌ Not started | RBAC 12B: Viewer / Operator / Approver / Admin |
| **AppShell** | ❌ Not started | 12E.4: left sidebar nav, top header (env, time range, search), main content, right drawers |
| **Dashboard** | ❌ Not started | C4.1: health cards, canary drift, queue depth, top error signatures, active leases, recent failed runs |
| **Initiatives** | ❌ Not started | List/detail, filters, “Create initiative”, “Generate plan”, “Run sandbox” |
| **Plans** | ❌ Not started | DAG viewer, plan_nodes/plan_edges, node detail drawer |
| **Runs / Run detail** | ❌ Not started | Runs list, Run detail “flight recorder” (DAG + attempts + tool calls + events) |
| **Jobs** | ❌ Not started | job_runs list, queues, leases, reclaim/retry |
| **Tool calls / Artifacts** | ❌ Not started | List/detail, request/response artifacts, capability grant used |
| **Releases** | ❌ Not started | Canary ramp, promote 100%, rollback, canary vs control comparison |
| **Policies / Adapters / Secrets** | ❌ Not started | List/detail, RBAC-gated mutations |
| **Approvals queue** | ❌ Not started | Pending approvals, approve/reject |
| **Incidents** | ❌ Not started | error_signature clustering, repair recommendations |
| **Health** | ❌ Not started | Workers, leases, stale heartbeat, force release lease |
| **Control Plane HTTP API** | ❌ Not started | GET/POST endpoints per 12B.5 (e.g. GET /v1/runs, POST /v1/initiatives, POST /v1/rollback) |
| **Design tokens + component library** | ❌ Not started | 12E.4: Tailwind token pack, Button/Input/DataTable/StatusPill/DAGViewer/Timeline/etc. |
| **Foundation / Content nav** | ❌ Not started | 1.3: Components, Typography, Colors, Spacing, Blocks, Pages, Themes; Brand Themes, Campaign/Flow/Segment/Template Definitions (can be later phase) |

**Rough estimate:** backend/kernel is ~25% of the “full plan”; the other ~75% is the Operator Console (Next.js/React app, all pages, RBAC, API layer, design system). So we’re **about one quarter of the way** to the full vision in the screenshots.

---

## What I need from you to continuously build this

### 1. Decisions (so I don’t guess)

- **Console stack:** Next.js (App Router) or React SPA (Vite)? Plan says “Next.js or React”; I’ll default to **Next.js** unless you say otherwise.
- **Auth for RBAC:** What do you want for login? (e.g. NextAuth with credentials + Google, Auth0, Clerk, or “no auth for now, mock user”). Screenshots show “Sign In / Sign Up / Magic Link” and “Google” — I can implement that with NextAuth or similar once you choose.
- **Where the console runs:** Vercel vs self-hosted (e.g. same host as Control Plane). Plan says console can be on Vercel; I’ll assume **Vercel** unless you say otherwise.
- **Database:** For me to test against real data: do you have a Postgres instance (e.g. local, Neon, Supabase)? I need a `DATABASE_URL` (or instructions) to run migrations and hit real tables when building the API and UI.

### 2. Priorities (so we go in order)

- **Phase 1 — API + one page:** Control Plane HTTP API (thin layer over Postgres + RBAC stub) + one console page (e.g. Dashboard or Runs list) with real data. That proves the seam.
- **Phase 2 — Core console:** AppShell, nav, Runs list/detail, Initiatives list, Jobs list, Releases (canary/rollback).
- **Phase 3 — Full console:** Remaining pages (Plans, Tool calls, Artifacts, Policies, Adapters, Secrets, Approvals, Incidents, Health), design tokens, polish.

If you prefer a different order (e.g. “Login + Initiatives first”), say so and I’ll follow that.

### 3. What you don’t need to do

- You don’t need to write code. I’ll use the blueprint (including 12B.4 SQL contracts and 12E.4 components) as the spec.
- You don’t need to give me new wireframes unless you want to change the plan; the “page-by-page wireframe-level layouts” in 12B.4 are enough.
- You can keep the plan/blueprint as-is; I won’t edit it. I’ll treat `AI_Factory_Architecture_Blueprint.md` and `docs/TODO_BY_LINE.md` as the source of truth.

### 4. How to “continuously build” with me

- **One clear ask per session** works best, e.g. “Implement the Control Plane API for runs and initiatives” or “Add the Dashboard page with health cards and canary drift.”
- **Reference the todo list:** You can say “do items L977–L998” (Console UI spec) or “do the next 50 unchecked items in TODO_BY_LINE.”
- **After each chunk:** I’ll summarize what was added and what’s next, so you can direct the next chunk.

---

## Summary

- **How far:** ~25% (schema + Control Plane + Runners + adapters contract). ~75% remaining is the Operator Console (API + all pages + auth + design system).
- **What I need:** Decisions locked in STACK_AND_DECISIONS.md. For Phase 1: env vars (or "assume they exist"); then one clear task or todo range per session.

The **1,000+ line todo list** is in `docs/TODO_BY_LINE.md` — one todo per line of the blueprint so you can track and assign work line-by-line.
