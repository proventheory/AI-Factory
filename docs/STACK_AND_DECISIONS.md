# Stack, Decisions & Build Order

**Locked** so the AI (and you) can build without guessing. Override by updating this doc.

---

## 1. Confirmed defaults

| Decision | Choice | Reason |
|----------|--------|--------|
| **Console stack** | Next.js (App Router) + TypeScript + Tailwind + **shadcn/ui** + TanStack Table + React Query + Supabase + **Recharts** + **React Flow** + **React Hook Form** + **TipTap** + **Nivo** | RBAC + server actions/API routes, easy deploy, clean routing. Design system: **packages/ui** (tokens + Tailwind preset); Console and email-marketing-factory share one UI. Widget stack: [WIDGET_STACK_DECISIONS.md](WIDGET_STACK_DECISIONS.md). |
| **Auth for RBAC** | Supabase Auth (Magic Link + Google) + RBAC in Postgres | Blueprint is Postgres-first; Supabase Auth gives Sign in / Magic link / Google; RBAC at DB (RLS/policies) and Control Plane API. |
| **Where console runs** | Vercel | Console on Vercel; Control Plane runs separately (containerized). |
| **Database** | Supabase Postgres | Single source of truth. Migrations via Supabase CLI in CI (no manual clicking). |
| **Auth alternative later** | Auth0 / Clerk / NextAuth | Swappable if needed; Supabase first for fastest path to real login + RBAC. |

---

## 2. Stack that runs on its own

### 2.1 Source control + environments

- **Repos (target):**
  - `ai-factory-console` — Next.js
  - `ai-factory-control-plane` — API + orchestrator
  - `ai-factory-runner` — runner agent + tool fabric client
  - (optional) `ai-factory-infra` — Terraform
- **Environments:** dev, staging, prod
- **Secrets:** Start with Supabase secrets + GitHub Actions secrets; later AWS Secrets Manager if needed.

### 2.2 Supabase (DB + Auth)

- One Supabase project per env (dev / staging / prod).
- **Migrations:** `supabase/migrations/*.sql` (Supabase CLI).
- Optional: `supabase/seed.sql`.
- **CI:** GitHub Actions
  - Migrations on merge to main → staging
  - Migrations on release tag → prod  
  → Schema applies on every deployment.

### 2.3 Control Plane (containerized, always-on)

- **Runtime:** Docker (AWS ECS/Fargate or Fly.io).
- **Responsibilities:**
  - REST/JSON API for Console
  - Schedule jobs (cron + event-driven)
  - Read/write state in Postgres
  - Queue work to runner fleet
- **Queue:** Default Redis + BullMQ; optional upgrade to Temporal later.
- **Workers:** In same service at first (monolith); split later if needed.

### 2.4 Runner Fleet

- **Deploy:** ECS Service / K8s / Fly Machines (start with ECS/Fargate if AWS).
- **Behavior:** Pull work; run MCP tool calls, sandboxed tasks, artifact generation; write logs + results to Postgres + object storage.

### 2.5 Storage + artifacts

- **Store:** S3-compatible (AWS S3 or Cloudflare R2).
- **Contents:** artifacts (PDFs, zips, build outputs), run logs (optional in DB), large model outputs.

### 2.6 Observability

- **Logging:** CloudWatch (AWS) or Axiom/Datadog later.
- **Errors:** Sentry (Console + Control Plane + runners).
- **Metrics:** Health endpoints + dashboard cards in Console.

### 2.7 Deployments

- **GitHub Actions (in-repo):**
  - **CI** (`.github/workflows/ci.yml`): on PR to `main`/`prod` — lint, build Console.
  - **Migrate and test** (`.github/workflows/migrate-and-test.yml`): on push to `main`/`prod` — build Console; optional Supabase push and smoke (when secrets configured).
- **Actual deploy:** Console → Vercel (connect repo, root directory `console`); Control Plane → Render (see `render.yaml`) or Fly.io. Deploy is typically via platform Git integration (Vercel/Render auto-deploy on push).
- **Releases:** Staging on `main`; prod on `prod` or `vX.Y.Z` tags. Canary/rollback hooks later.

---

## 3. Env vars (minimum to start)

All read from environment; no secrets in repo.

**Console (Vercel):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CONTROL_PLANE_API` — Control Plane base URL (required for Ops/Admin data).
- `NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN` — optional; URL of Email Marketing Factory app for `/email-marketing` proxy.
- `NEXT_PUBLIC_LANGFUSE_URL` — optional; Langfuse project URL for Cost/Usage dashboard (see [LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md)).

**Control Plane (container):**

- `SUPABASE_SERVICE_ROLE_KEY` (or equivalent for server-side Auth)
- `DATABASE_URL` (Supabase Postgres connection string)
- `REDIS_URL` (for BullMQ when added)
- (Later) Sentry DSN, etc.

**Runner:**

- `DATABASE_URL`
- `CONTROL_PLANE_API_URL` or queue connection (when using Redis/BullMQ)
- `LLM_GATEWAY_URL` — required when executors call LLMs; base URL of LiteLLM Proxy (see [LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md))
- (Later) S3/R2 credentials for artifacts

**Optional for Phase 1:**

- `S3_BUCKET` + credentials — or “skip artifacts for now” and stub artifact storage.

If you prefer not to paste secrets in chat: say **“assume they exist”** and all code will use `process.env.*` only.

---

## 3.1 Control Plane API (current)

The Control Plane (`control-plane/src/api.ts`) exposes REST/JSON. Key endpoints: **Health** `GET /health`, `GET /health/db`, `GET /v1/health`. **Initiatives** `GET/POST /v1/initiatives` (goal_state, source_ref, template_id). **Plans** `GET /v1/plans`, `GET /v1/plans/:id` (nodes with agent_role), `POST /v1/initiatives/:id/plan` (plan compiler), `POST /v1/initiatives/:id/replan`. **Runs** `GET /v1/runs`, `GET /v1/runs/:id`, `GET /v1/runs/:id/artifacts`, `GET /v1/runs/:id/status`, `POST /v1/runs`, `POST /v1/runs/:id/cancel`, `POST /v1/runs/:id/rerun`. **Approvals** `GET /v1/approvals/pending`, `GET /v1/approvals`, `POST /v1/approvals`. **Admin/list** `GET /v1/job_runs`, `GET /v1/artifacts`, `GET /v1/tool_calls`, `GET /v1/llm_calls`, `GET /v1/usage` (Cost/Usage), `GET /v1/releases`, etc. **Webhooks** `POST /v1/webhooks/github`. Plan compiler templates: software, issue_fix, migration, factory_ops, ci_gate, crew. See [FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md](FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md).

---

## 4. Build order (ship fast)

### Phase 1 — Prove the seam

1. Supabase schema + migrations wired (port/copy from `schemas/*.sql` into `supabase/migrations/`).
2. Control Plane: REST API for **runs** and **initiatives** (filters, pagination).
3. Console: Supabase Auth (Magic Link + Google) + **Runs list** page with real data.

### Phase 2

- Jobs, Releases (canary/rollback tables), basic health.
- Runner: end-to-end “hello workflow” (claim → execute → write back).

### Phase 3

- Full console pages, policy engine, approvals, incidents.

---

## 5. Operating mode (“continuously build”)

You can say any of these and implementation will follow:

- *“Implement Control Plane endpoints for Runs + Initiatives, including filters/pagination.”*
- *“Build Console AppShell + Runs list/detail.”*
- *“Do the next 50 unchecked items in TODO_BY_LINE starting from the top of Console.”*

Each session will return:

- What changed
- Files added/modified
- Env vars needed
- What’s next

---

## 6. Current repo vs target repos

- **Current (monorepo):** `console/` (Next.js + shadcn/ui, ProfessorX — AI Factory Operator Console: pipelines, brands, graph ops, change impact, repair, migration guard, lineage), `control-plane/` (REST API, plan compiler, scheduler, graph RPCs, migration guard, impact analysis), `runners/` (ExecutorRegistry, handlers, artifact consumption), `supabase/` (migrations), `email-marketing-factory/` (at `/email-marketing`), `docs/`.
- **Target (optional later):** Separate repos `ai-factory-console`, `ai-factory-control-plane`, `ai-factory-runner`. All features ship in this monorepo today.

All application code lives in this repo; splitting into separate repos is optional when scaling.


---

## 7. Agent orchestration: multi-framework architecture decision

### Kernel vs edges

**Kernel (single source of truth): LangGraph**

- Owns the factory line: state machine / DAG, routing, retries, run lifecycle, trace topology.
- Owns run state and the canonical notion of “what happened” (plans, nodes, edges, artifacts, tool calls).
- Never depends on any external framework’s internal state.

**Edges (pluggable executors): AutoGen, CrewAI, Custom (SWE-Agent, PR-Agent, etc.)**

- Used only as implementations for specific `job_type`s.
- They do not own orchestration, run state, lineage, or traces.
- They run inside a job execution boundary and emit outputs/artifacts through the kernel contract.

**Why not multi-framework orchestration at core:** Mixing LangGraph + AutoGen + CrewAI at the core leads to duplicated abstractions (agents, tools, memory), hard-to-debug routing, version churn, and unclear ownership of state and traces.

**Practical mapping**

| job_type              | Executor                      |
|-----------------------|------------------------------|
| `codefix`             | SWE-Agent (custom executor)  |
| `pr_review`           | PR-Agent (custom executor)   |
| `research`            | CrewAI (edge executor)       |
| `multi_agent_dialogue`| AutoGen (edge executor)      |
| `plan_compile`, `spec`, `doc` | Simple internal executor (LLM + tools) |

**When to stay strictly single-framework:** When shipping the first public deployment — build core primitives (job schema, state machine, tool contracts), add specialist engines later behind adapters.

**When multi-framework at the edges is worth it:** When you have a mature job schema and need a specific engine’s capability (e.g. SWE-Agent’s patch loop), with strict boundaries and no state duplication.

---

### 7.1 Kernel Contract (Executor Interface)

The kernel contract is the only thing LangGraph assumes about executors. Everything else (AutoGen/CrewAI internals) is opaque. This is the “graduate to multi-framework” lever: any executor that implements this contract can plug in without rewriting the kernel.

#### 1) Job schema (orchestrator ↔ executor)

**Canonical job envelope:**

- **job_type** — e.g. `codefix`, `pr_review`, `doc`, `plan_compile`, `code_review`
- **input** — structured payload (repo refs, issue text, predecessor artifact refs, options)
- **output** — structured result (patch refs, verdict, notes, metrics)
- **artifacts** — typed outputs with lineage metadata, including **producer_plan_node_id**

**Rules:**

- The executor is a black box. It receives input and must return output + artifacts.
- The kernel is responsible for persisting the job record and the full lineage.
- Every artifact produced by an executor must include **producer_plan_node_id** (already in schema) for traceability.

#### 2) Tool interface (executor ↔ tools/MCP)

Tools are invoked at the runner/executor layer, but **recorded in the kernel**.

**Contract:**

- **capability_name** + **input_payload** → result (or artifact reference)
- Every tool call must be recorded as: **tool_calls** entry + any resulting artifacts, linked to **producer_plan_node_id**

**Rules:**

- The kernel does not care how the executor decides to use tools.
- The kernel does require standardized recording so runs are reproducible/auditable.
- Executors may implement tools directly or proxy via MCP — same contract either way.

#### 3) Memory interface (cross-node / cross-run)

**A) Run-scoped memory (derived)**

- Predecessor artifacts are retrieved via **plan_edges** + **producer_plan_node_id**.
- This is “read-only history” for the current run.

**B) Persistent memory (initiative-scoped)**

- Kernel-owned store for long-lived knowledge: **agent_memory** table  
  `(initiative_id, scope, key, value, run_id nullable, …)`

**Rules:**

- Kernel stores and retrieves memory; it does not interpret semantics.
- Executors read/write memory through a simple API: **get(scope, key)** / **set(scope, key, value)**.
- Optional embeddings later; the contract remains key/value first.
- **Implemented:** `runners/src/agent-memory.ts` provides `readAgentMemory()`, `writeAgentMemory()`, `readMemoryForContext()`, `writeMemoryFromResult()`. Control Plane exposes `GET/POST/PATCH /v1/agent_memory`. Console lists at `/admin/agent_memory`.

---

**One-sentence summary:** LangGraph is the kernel. Everything else (AutoGen/CrewAI/custom) plugs in only by implementing: (1) job schema (job_type + input + output + artifacts w/ producer_plan_node_id) + (2) tool recording (capability + payload → tool_calls/artifacts) + (3) memory (predecessor artifacts + agent_memory by initiative_id/scope/key).

---

### 7.2 Brand Engine

Brand profiles (`brand_profiles`) store full brand identity: archetype, tone, copy style, visual style, design tokens, deck theme, report theme. Brand embeddings (`brand_embeddings`) use pgvector for semantic retrieval. Document templates and components drive deck (PptxGenJS) and report (HTML) generation. Every initiative can reference a `brand_profile_id`; runners inject brand context into LLM prompts via `brandContextToSystemPrompt()`. Factory job types: `brand_compile`, `copy_generate`, `email_generate`, `deck_generate`, `report_generate`, `ui_scaffold`. See [docs/BRAND_ENGINE.md](BRAND_ENGINE.md).

---

## 8. Optional tools and references (features adopted from prompt-to-SaaS platforms)

We take **best features** from Lovable, Base44, Replit AI, etc., and implement them our way. We do not build "their" ecosystem. A single reference lists which features we want, how we implement each, and which optional OSS we can plug in:

- **Full table and Repo intelligence:** [docs/FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md](docs/FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md)

**Repo intelligence (optional):** For deeper repo understanding (dependency graph, function call graph, architecture map, hotspots), **RepoMaster** (QuantaAlpha/RepoMaster) or an equivalent can be added as an optional adapter/MCP that produces an artifact consumable by WritePatch / code_review nodes. See the same doc for how it would plug in. Not required for current plan compiler or runners.

---

## 9. Infrastructure decisions (Temporal, S3, optional OSS)

### Temporal (scheduling)

**Decision: No.** Current scheduler (`control-plane/src/scheduler.ts`) uses direct DB polling with `job_claims`, heartbeats, lease reaping, and single-winner election. This handles hundreds of concurrent runs. Temporal would add a separate server deployment and operational overhead with no current benefit. If we hit >1000 concurrent runs and the scheduler bottlenecks, revisit — but that's not a near-term concern.

### Artifact storage

**Decision: Supabase Storage.** Implemented in `runners/src/artifact-storage.ts`. Zero new infrastructure since we already have Supabase.
- Upload: `uploadArtifact(runId, artifactId, content)` → `supabase-storage://artifacts/...` URI.
- Download: `getArtifactSignedUrl(path)` → 1-hour signed URL.
- Control Plane: `GET /v1/artifacts/:id` auto-resolves `supabase-storage://` URIs to signed download URLs.
- Fallback: artifacts with `mem://` URIs continue to work (content in `metadata_json`).

### Self-healing (OpenHands + SWE-agent)

**Decision: Both implemented.** Real CLI/Docker integrations, not stubs.
- **OpenHands Resolver** (`runners/src/openhands-resolver.ts`): tries Docker → CLI → LLM fallback. Produces unified diff patches.
- **SWE-agent** (`runners/src/swe-agent.ts`): tries CLI → Docker → LLM fallback. Produces patches with trajectory logs.
- **Plan templates**: `self_heal` (OpenHands) and `swe_agent` templates in `control-plane/src/plan-compiler.ts`.
- **Handler registration**: `openhands_resolver` and `swe_agent` job types in `runners/src/handlers/index.ts`.
- **Gating**: self-healing PRs require eval pass + human approval (see LLM_GATEWAY_AND_OPTIMIZATION.md gating policy).

### Final OSS decisions

| OSS | Decision | Rationale |
|-----|----------|-----------|
| Refine | **No** | Evaluated. Hand-built shadcn + TanStack Table covers all admin CRUD. Adding Refine would duplicate UI infrastructure. |
| v0 | **No** | Layout primitives + Cursor prompts generate UI faster than a v0 integration pipeline would. |
| RepoMaster | **No** | AnalyzeRepo handler + LLM context is sufficient. A full dependency graph tool adds build-time complexity for marginal benefit. |
| GPTCache | **No** | LiteLLM Redis exact-match cache is sufficient (see LLM_GATEWAY doc). Semantic cache adds embedding model dependency. |
| DSPy | **No** | Requires 100+ examples per task that don't exist. Manual prompt iteration with Promptfoo evals is more effective now. |
| OpenHands | **Yes** | Real integration: Docker/CLI/LLM fallback. `openhands_resolver` handler + `self_heal` template. |
| SWE-agent | **Yes** | Real integration: CLI/Docker/LLM fallback. `swe_agent` handler + `swe_agent` template. |
- **Widget stack decisions:** [docs/WIDGET_STACK_DECISIONS.md](docs/WIDGET_STACK_DECISIONS.md) — which charting, form, editor, and visualization libraries were adopted and why.

---

## 10. Schema growth and JSON guardrails

The database is domain-grouped with a relational core; JSON/JSONB is used for **config and metadata** only. New behavioral or queryable data should use **columns or child tables**, not additional keys in JSON blobs.

- **Canonical guardrails:** [docs/SCHEMA_JSON_GUARDRAILS.md](docs/SCHEMA_JSON_GUARDRAILS.md) — payload contracts for `job_events.payload_json`, allowed keys for `artifacts.metadata_json`, contracts for `document_templates.component_sequence`, and decision rules for when to add columns vs extend JSON.
- **High-risk areas:** `brand_profiles.design_tokens` (keep design tokens only; do not store campaign/asset refs), `email_design_generator_metadata.metadata_json` (campaign payload only; add columns or child table for scheduling/segmentation/proofing), `job_events.payload_json` (documented payload per event_type; avoid ad-hoc keys).
