# Execution Summary (2,000+ To-Do List)

This doc summarizes what was **implemented** when "execute each one of the 2,000" was run. The full list is in `docs/TODO_IMPLEMENTATION_2000.md` (2,947 items). Not every checkbox can be completed in one pass; below is what was **done** in this run.

**Current architecture:** See [STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md) and [README.md](README.md) for up-to-date repo layout, API, and features.

---

## Checklist — what was done

### Schema / Supabase

- [x] Supabase config.toml
- [x] Supabase migration 20250303000000_ai_factory_core.sql (from 001_core_schema.sql)
- [x] Supabase migration 20250303000001_ai_factory_state_machines.sql (from 002)
- [x] Schema: enums, tables, indexes, triggers (in DDL; migration path ready)

### Control Plane API

- [x] GET /health
- [x] GET /v1/dashboard (stale_leases, queue_depth, workers_alive)
- [x] GET /v1/initiatives (filters, pagination)
- [x] GET /v1/initiatives/:id
- [x] POST /v1/initiatives
- [x] GET /v1/runs (filters, pagination, top_error_signature, failures_count)
- [x] GET /v1/runs/:id (flight recorder)
- [x] POST /v1/runs (501 stub)
- [x] CORS enabled
- [x] RBAC stub (x-role header)
- [x] Control Plane starts API on PORT (3001)
- [x] GET /v1/job_runs (filters, pagination, worker/heartbeat/lease)
- [x] GET /v1/releases (filters, pagination)
- [x] GET /v1/health (workers + active_leases + stale_leases_count)
- [x] GET /v1/tool_calls, artifacts, policies, adapters, audit, incidents, approvals, secret_refs, capability_grants
- [x] GET /v1/validations (run_id, job_run_id)
- [x] POST /v1/initiatives/:id/plan (stub: minimal single-node plan)
- [x] POST /v1/runs/:id/rerun (scheduler.createRun)
- [x] POST /v1/runs/:id/rollback (release-manager.executeRollback)
- [x] POST /v1/releases/:id/rollout (percent_rollout)
- [x] POST /v1/releases/:id/canary (release_routes canary percent)
- [x] POST /v1/approvals (append approval decision)
- [x] POST /v1/job_runs/:id/retry (new attempt queued)

### Console (Next.js App Router + Tailwind)

- [x] Next.js 14, TypeScript, Tailwind, design tokens
- [x] Login page (/login) — Sign In / Sign Up / Magic Link tabs + Google placeholder
- [x] AppShell — sidebar nav (all 14 items), top header (env, search, user)
- [x] Route / (home)
- [x] Route /dashboard — fetches GET /v1/dashboard, health cards
- [x] Route /runs — list with table, link to detail
- [x] Route /runs/[id] — flight recorder view
- [x] Route /initiatives — page with real data
- [x] Route /plans, /jobs, /tool-calls, /artifacts, /releases, /policies, /adapters, /approvals, /incidents, /secrets, /health — layout + page each
- [x] Initiatives list — fetch GET /v1/initiatives, table, filters (intent_type, risk_level)
- [x] Initiatives detail page (/initiatives/[id])
- [x] Jobs list — fetch GET /v1/job_runs, table, filters (environment, status), link to run
- [x] Releases list — fetch GET /v1/releases, table, status filter
- [x] Health page — fetch GET /v1/health, workers table, active leases table, stale count
- [x] Approvals, Incidents, Audit, Secrets pages with real data
- [x] Run detail: Validations tab, Secrets Access tab (audit), Actions (Re-run, Rollback, Approve, Reject, Export .mdd)
- [x] AppShell: Audit in nav
- [x] Supabase client: console/src/lib/supabase.ts + console/.env.example

---

## Done in this run (narrative)

### Schema / Supabase

- **Supabase migrations wired** — `supabase/config.toml` and `supabase/migrations/`:
  - `20250303000000_ai_factory_core.sql` (from `schemas/001_core_schema.sql`)
  - `20250303000001_ai_factory_state_machines.sql` (from `schemas/002_state_machines_and_constraints.sql`)
- Schema items (enums, tables, indexes, triggers) are **already implemented** in those DDL files; Supabase migration path is now in place so CI can run them.

### Control Plane API

- **REST API** in `control-plane/src/api.ts`:
  - `GET /health`
  - `GET /v1/dashboard` (stale_leases, queue_depth, workers_alive)
  - `GET /v1/initiatives` (filters, pagination)
  - `GET /v1/initiatives/:id`
  - `POST /v1/initiatives`
  - `GET /v1/runs` (filters: environment, status, cohort; pagination; with top_error_signature, failures_count)
  - `GET /v1/runs/:id` (flight recorder: run, plan_nodes, plan_edges, node_progress, job_runs, run_events)
  - `POST /v1/runs` (501 stub; real create uses scheduler)
- **CORS** enabled; **RBAC** stub (x-role header); Control Plane `index.ts` starts the API server on `PORT` (default 3001).

### Console (Next.js App Router + Tailwind)

- **App** — `console/`: Next.js 14, TypeScript, Tailwind, design tokens (brand colors).
- **Auth** — Login page (`/login`) with Sign In / Sign Up / Magic Link tabs and Google placeholder (Supabase Auth to be wired when env vars are set).
- **AppShell** — Left sidebar nav (Overview, Initiatives, Plans, Runs, Jobs, Tool Calls, Artifacts, Releases, Policies, Adapters, Approvals, Incidents, Secrets, Health), top header (environment selector, search, user).
- **Pages** — All nav routes have a layout + page:
  - `/`, `/login`, `/dashboard`, `/runs`, `/runs/[id]`, `/initiatives`, `/plans`, `/jobs`, `/tool-calls`, `/artifacts`, `/releases`, `/policies`, `/adapters`, `/approvals`, `/incidents`, `/secrets`, `/health`
- **Dashboard** — Fetches `GET /v1/dashboard`, shows stale_leases, queue_depth, workers_alive.
- **Runs list** — Fetches `GET /v1/runs`, table with run id, env, cohort, status, started, failures, top_error_signature; link to run detail.
- **Run detail** — Fetches `GET /v1/runs/:id`, shows run context, node progress, run events.
- **Env** — Console uses `NEXT_PUBLIC_CONTROL_PLANE_API` (default `http://localhost:3001`).

---

## How to run

1. **DB** — Create DB and run migrations:
   - `createdb ai_factory && npm run db:migrate` (root), or
   - Supabase: push `supabase/migrations/` via Supabase CLI.
2. **Control Plane** — `DATABASE_URL` set, then `npm run build && npm run start:control-plane` (API on 3001).
3. **Console** — `cd console && npm run dev` (Next.js on 3000). Open http://localhost:3000; use Dashboard or Runs (data from API).

---

## What’s left (from the 2,947 list)

- **Schema** — RLS policies per table (items in list); seed data if desired.
- **API** — Full RBAC with Supabase Auth (resolve user from JWT); POST /v1/runs body validation.
- **Console** — Supabase Auth middleware + session provider + protected routes; DAG viewer component; global search; optional polish (ApprovalModal, etc.).
- **Runner** — Node handlers, adapter integrations, more tests.
- **CI** — GitHub Actions for lint/test/build/deploy and Supabase migrations.

You can continue by picking the next section from `TODO_IMPLEMENTATION_2000.md` and implementing it (e.g. “API: GET /v1/job_runs”, “Console: Initiatives list — fetch GET /v1/initiatives”, etc.).
