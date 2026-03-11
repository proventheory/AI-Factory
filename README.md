# AI Factory

Autonomous orchestration system for dev and marketing pipelines. Graph-native execution (DAG traversal, lineage, change impact, repair, migration guard). Safely builds, deploys, monitors, and improves itself over time.

**Operator Console (ProfessorX):** Single control surface for pipelines, brands, graph ops, and self-heal. See **docs/WHAT_YOU_CAN_DO_WITH_PROFESSORX.md**.

## Architecture

```
Control Plane (scheduler, policy, release manager, graph RPCs)
       |
   Postgres Ledger (canonical source of truth)
       |
   Runner Fleet (stateless workers, lease-based claiming, artifact consumption)
       |
   MCP Tool Fabric (adapters: Vercel, GitHub, Klaviyo, DNS, n8n, Airtable)
```

**Four layers:**

| Layer | Role |
|-------|------|
| Control Plane | Scheduling, policy enforcement, release routing, canary management; graph topology, lineage, repair plan, subgraph replay, change impact, migration guard |
| Work Plane | Adapters, validators, generators — evolvable via upgrade pipeline |
| Runner Fleet | Stateless workers: claim jobs, execute nodes, write artifacts, record artifact consumption |
| MCP Tool Fabric | Standardized connectors to external systems |

**Orchestration ledger:** Initiatives -> Plans -> Runs -> Job Runs -> Tool Calls -> Artifacts -> Events. **Graph self-heal:** change_events, graph_impacts, incident_memory, artifact_consumption, graph_checkpoints. **Deploy events:** record build/deploy failures via `POST /v1/deploy_events` (with optional `build_log_text` for classification); use `GET /v1/deploy_events/:id/repair_plan` for suggested actions. Full runbook: **docs/GRAPH_ENGINE_AND_SELF_HEAL.md**.

## Project Structure

```
schemas/                    Postgres DDL (human-reviewed)
  001_core_schema.sql       All tables, enums, indexes, constraints
  002_state_machines_and_constraints.sql  Transition guards, immutability triggers

control-plane/src/          Control Plane application
  db.ts                     Database connection pool + transaction helper
  types.ts                  TypeScript type definitions for all tables
  scheduler.ts              Run creation, node_progress init, DAG advancement
  reaper.ts                 Lease reaper (reclaims stale job_claims)
  release-manager.ts        Canary routing, drift detection, auto-rollback
  golden-suite.ts           Golden initiative test suite
  repair-engine.ts          repair_recipes lookup, hypothesis generation, escalation
  scorecard.ts              Factory Scorecard (5-axis metrics per release)
  index.ts                  Control Plane entry point

runners/src/                Runner Fleet application
  runner.ts                 Job claim/lease/heartbeat, completion, single-winner election
  tool-calls.ts             Idempotent tool-call execution with capability gating
  index.ts                  Runner entry point (poll loop)

adapters/src/               MCP Adapter layer
  adapter-interface.ts      Base interface: validate -> execute -> verify -> rollback
```

## Kernel and operators (current state)

- **Pipeline V2** — Prompt → draft → lint → compile → run. Patterns (SEO, email, self-heal, deploy); compose; plan-from-draft; Console “Build pipeline from prompt” + Start run. See **docs/PIPELINE_GENERATION.md**.
- **Dev Kernel V1** — Failure → classify → incident_memory → auto-repair (5‑min loop when `ENABLE_AUTO_REPAIR=true`); capability registry; `POST /v1/job_failures` from runner. See **docs/GRAPH_ENGINE_AND_SELF_HEAL.md**.
- **Action Kernel V1** — Unified action execution (subgraph_replay, rerun_pipeline, rollback_release); policy; validation and learning. See **docs/BUSINESS_OPERATOR_V1.md** (Stage 4 scaffold).
- **Ads + Commerce Operator (Phases 1–5)** — Canonical schema (typed spend/orders/attribution); Meta & Shopify connectors (read); metrics & diagnosis; Meta pause + validation; Slack daily summary. See **docs/ADS_COMMERCE_OPERATOR.md**.
- **Taxonomy and brand catalog** — Airtable/Shopify import → raw + canonical (organizations, taxonomy_websites, vocabularies, terms, brand_catalog_products). First Capital Group grouping; `brand_profiles.website_id` for brand ↔ website. See **docs/AIRTABLE_AND_PRODUCT_IMPORT_PLUGIN_ANALYSIS.md** and **docs/ORGANIZATION_AND_CLIENT_GROUPING.md**.

**Migrations:** `npm run db:migrate` (core); `npm run db:migrate:pipeline-v2`; `npm run db:migrate:dev-kernel`; `npm run db:migrate:ads-commerce`; Airtable/taxonomy migrations in `supabase/migrations/20250331*.sql`. **Verification:** `npm run doctor`, `npm run test:pipeline-v2-api`, `npm run test:dev-kernel-api`, `npm run verify:taxonomy-db`, `npm run test:taxonomy-catalog-api`. Full runbook: **docs/OPERATIONS_RUNBOOK.md**.

**Deploys:** Before or after any heavy deploy or DB change, follow **[docs/DEPLOY_AND_DATA_SAFETY.md](docs/DEPLOY_AND_DATA_SAFETY.md)** so the Console stays populated and work is traceable.

---

## Quick Start

### Prerequisites

- Node.js >= 20
- PostgreSQL >= 15
- A `DATABASE_URL` environment variable

### Setup

```bash
npm install

# Create the database and run migrations
createdb ai_factory
npm run db:migrate
npm run db:migrate:pipeline-v2
npm run db:migrate:dev-kernel
npm run db:migrate:ads-commerce

# Build TypeScript
npm run build
```

### Run

```bash
# Start the Control Plane (scheduler, reaper, drift monitor, REST API on port 3001)
# Restart after build so new routes (e.g. /v1/ads/*, /v1/connectors/*) are loaded.
ENABLE_AUTO_REPAIR=true npm run start:control-plane

# Start a Runner (in a separate terminal; set CONTROL_PLANE_URL so job failures are reported)
WORKER_ID=worker-1 npm run start:runner

# Start the Console (Next.js on port 3000)
cd console && npm run dev
```

Set `NEXT_PUBLIC_CONTROL_PLANE_API=http://localhost:3001` (or your Control Plane URL) when running the Console. Optional: **docs/ENABLEMENT_ENV_VARS.md** for `ENABLE_AUTO_REPAIR`, `CONTROL_PLANE_URL`, and other toggles.

## Schema

Core tables plus graph self-heal:

| Table | Purpose |
|-------|---------|
| initiatives | User/system goals |
| plans, plan_nodes, plan_edges | Compiled DAGs |
| releases, release_routes | Versioned bundles + canary routing |
| runs | Execution contexts (pinned release, policy, environment) |
| job_runs | Per-attempt execution records (Pattern A); optional failure_class |
| node_progress, node_completions, node_outcomes | DAG advancement + single-winner election |
| tool_calls | Adapter invocations with idempotency |
| artifacts | Typed, immutable outputs |
| validations | Test/lint/policy results |
| policies | Versioned, immutable rule sets |
| secret_refs, secret_access_events | Vault pointers + audit trail |
| run_events, job_events | Append-only lifecycle ledger |
| capability_grants | Runtime capability gating |
| approvals | Human gate decisions |
| job_claims | Lease-based exactly-once execution |
| worker_registry | Worker health tracking |
| repair_recipes | Repair knowledge base |
| llm_calls | Model escalation audit |
| rollback_targets | Structured rollback pointers |
| artifact_consumption | Lineage: which artifacts were consumed by which job_runs |
| change_events, graph_impacts | Change impact analysis and blast radius |
| graph_checkpoints | Known-good states for replay and diff |
| incident_memory | Repairable incident patterns and resolutions |

## Key Design Decisions

- **Pattern A job_runs:** One row per attempt; retry = new row (attempt+1, queued). Stable idempotency keys (no attempt in key).
- **Lease-based claiming:** job_claims with partial unique index ensures exactly-once execution. Heartbeat + reaper reclaims stuck jobs.
- **Single-winner election:** node_outcomes table prevents two attempts from both claiming success.
- **State machine triggers:** Postgres triggers enforce allowed status transitions (queued->running->succeeded|failed).
- **Artifact immutability:** Triggers prevent modification of uri/sha256 after write.
- **Canary routing by config:** release_routes table makes canary reversible without code deploy.

## Self-Improvement System

The factory improves itself through controlled evolution:

1. **Factory Scorecard** — 5-axis metrics (reliability, determinism, safety, velocity, quality) per release
2. **Repair recipes** — Known fixes stored by error_signature; tried before hypothesis exploration
3. **Eval Initiative** — Nightly replay of prod failures in sandbox; generates upgrade PRs
4. **Policy auto-tightening** — Canary drift reduces autonomy until stability returns
5. **Phased autonomy** — Work Plane first (safe), Control Plane last (human approval required)

## Stack & build order (locked)

- **Console:** Next.js (App Router) + TypeScript + Tailwind, on Vercel.
- **Auth & DB:** Supabase Auth (Magic Link + Google) + Supabase Postgres; RBAC in Postgres + Control Plane API.
- **Control Plane:** Containerized (Docker); REST API; queue: Redis + BullMQ (Temporal optional later).
- **Runner Fleet:** ECS/K8s/Fly; pulls work, writes to Postgres + S3/R2.
- **Build order:** Phase 1 = Supabase migrations + Control Plane API (runs, initiatives) + Console auth + Runs list. Phase 2 = Jobs, Releases, runner e2e. Phase 3 = Full console + policy + approvals + incidents.

Full details: **`docs/STACK_AND_DECISIONS.md`**. Env vars and operating mode there too.

## Full Architecture Spec

See `AI_Factory_Architecture_Blueprint.md` for the complete 1800-line specification covering schema, runner execution, node taxonomy, UI console, and self-improvement system.
