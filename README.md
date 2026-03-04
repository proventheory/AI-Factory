# AI Factory

Autonomous orchestration system for dev and marketing pipelines. Safely builds, deploys, monitors, and improves itself over time.

## Architecture

```
Control Plane (scheduler, policy, release manager)
       |
   Postgres Ledger (canonical source of truth)
       |
   Runner Fleet (stateless workers, lease-based claiming)
       |
   MCP Tool Fabric (adapters: Vercel, GitHub, Klaviyo, DNS, n8n, Airtable)
```

**Four layers:**

| Layer | Role |
|-------|------|
| Control Plane | Scheduling, policy enforcement, release routing, canary management |
| Work Plane | Adapters, validators, generators — evolvable via upgrade pipeline |
| Runner Fleet | Stateless workers: claim jobs, execute nodes, write artifacts |
| MCP Tool Fabric | Standardized connectors to external systems |

**Orchestration ledger:** Initiatives -> Plans -> Runs -> Job Runs -> Tool Calls -> Artifacts -> Events

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

# Build TypeScript
npm run build
```

### Run

```bash
# Start the Control Plane (scheduler, reaper, drift monitor, REST API on port 3001)
npm run start:control-plane

# Start a Runner (in a separate terminal)
WORKER_ID=worker-1 npm run start:runner

# Start the Console (Next.js on port 3000)
cd console && npm run dev
```

Set `NEXT_PUBLIC_CONTROL_PLANE_API=http://localhost:3001` (or your Control Plane URL) when running the Console.

## Schema

21 tables implementing the full orchestration ledger:

| Table | Purpose |
|-------|---------|
| initiatives | User/system goals |
| plans, plan_nodes, plan_edges | Compiled DAGs |
| releases, release_routes | Versioned bundles + canary routing |
| runs | Execution contexts (pinned release, policy, environment) |
| job_runs | Per-attempt execution records (Pattern A) |
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
