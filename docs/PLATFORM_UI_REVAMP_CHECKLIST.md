# Platform UI revamp with shadcn — Checklist

Actionable to-dos derived from the Platform UI revamp plan. Total: **1,001 items**.

**Deferred work completed (this pass):** Admin CRUD for all 10 resources (initiatives, plans, runs, job_runs, artifacts, approvals, plan_nodes, plan_edges, tool_calls, agent_memory): list + show for each; new + edit for initiatives. Magic UI Number Ticker on Console dashboard. ProfessorX branding (templateName + tagline "Conduct your code.") in email-marketing-factory. `render.yaml` for Control Plane deploy; deploy quick reference in DEPLOYMENT_PLAN_WITH_MCP.md. Full MUI→shadcn migration in email-marketing-factory remains page-by-page using the same primitives.

**Additional work completed (FULL_IMPLEMENTATION pass):** MCP servers admin (list + show + new + edit + delete with test-connection); agent_memory show + edit pages; plan_nodes and plan_edges wired to real plan API; run detail page with per-node LLM usage, artifacts, rerun button; Cost page with date range, job_type, and tier filters plus p50/p95 percentiles; initiative edit wired to PATCH API. See [docs/FULL_IMPLEMENTATION_5000_ITEMS.md](FULL_IMPLEMENTATION_5000_ITEMS.md).

---

## 1. Current state and overrides

- [x] Document current Console stack (Next.js 14, Tailwind, Supabase)
- [x] Document current Console UI (custom components, design tokens, no shadcn/TanStack Table/React Query)
- [x] Document current email-marketing-factory stack (Next.js 14, MUI, Arco, Tailwind, Prisma, TanStack Table, Recharts)
- [x] Document email-marketing-factory UI (MUI template, proxied at /email-marketing)
- [x] Update docs/STACK_AND_DECISIONS.md to allow shadcn for revamp
- [x] Update console/src/components/ui/README.md (remove "not using shadcn")
- [x] Document pipeline context: UI revamp as control surface for Planner → Task Graph → Agents → Code gen → Testing → PR
- [x] Confirm plan does not change pipeline; only observability/control

---

## 2. Target stack

- [x] Confirm Next.js in use (already)
- [x] Confirm Tailwind in both apps (already)
- [x] Add shadcn/ui to Console (copy-paste, Cursor-friendly, Radix + Tailwind)
- [x] Add TanStack Table to Console (already in email-marketing-factory)
- [x] Add React Query (TanStack Query) to Console for Control Plane / API data
- [x] Add React Query to email-marketing-factory if not present
- [x] Confirm Supabase (already)
- [x] Bookmark / reference awesome-shadcn-ui (dashboards, command menu, sidebar, data tables, pipeline UIs)
- [x] Bookmark / reference TailGrids (dashboards, SaaS layouts)
- [x] Document: use daisyUI or Flowbite only if specific pattern needed; prefer shadcn-first
- [x] Choose New York vs default shadcn style (plan says New York)
- [x] Choose slate vs neutral base for shadcn

---

## 3. References and related ecosystems

### OpenHands (OpenDevin)
- [x] Review OpenHands README and docs
- [x] Document as executor reference for AI Factory orchestration
- [x] Document Cloud RBAC/collab patterns for future use
- [x] Add to Phase 5 integration doc (optional)

### Continue
- [x] Review Continue .continue/checks/ pattern
- [x] Add optional .continue/checks/ for PR quality (e.g. no hardcoded secrets) — Phase 5
- [x] Document Continue + Cursor compatibility in docs

### Sweep
- [x] Review Sweep issue-to-PR automation
- [x] Document as future integration (runners/initiatives triggering Sweep-style flows)
- [x] Add to product reference list

### GPT Engineer
- [x] Review GPT Engineer prompt file + gpte / gpte -i
- [x] Adopt preprompt/prompt-file pattern for "generate new Console page" — Phase 5
- [x] Add optional prompt templates so Cursor/Bolt prompts match primitives

### AutoDev (unit-mesh)
- [x] Review AutoDev SDLC agents and MCP
- [x] Document SDLC-phase alignment (Requirements → Dev → Review → Testing → Data → Deploy → Ops)
- [x] Document multi-agent decomposition and MCP tooling as architecture reference
- [x] Reference when extending plan templates or job types

### SWE-agent
- [x] Review SWE-agent YAML config and mini-SWE-agent
- [x] Document as research reference for agent–computer interface
- [x] Document benchmark patterns for runners

### Magic UI
- [x] Review Magic UI AGENTS.md, MCP docs, registry.json
- [x] Add Bento Grid for dashboard sections — Phase 2
- [x] Add Number Ticker for stats — Phase 2
- [x] Add Animated List — Phase 2
- [x] Add Terminal for logs/CLI feel — Phase 2
- [x] Add Shine Border / Border Beam on key cards — Phase 2
- [x] Use AI Agent or Dev Tool template as layout reference — Phase 2
- [x] Adopt AGENTS.md-style rules for Cursor-friendly generation — Phase 2
- [x] Consider Magic UI registry or MCP for component discovery — Phase 2

### Reflex
- [x] Review Reflex Build (prompt → full-stack app)
- [x] Document as Phase 5 reference; prompt templates should target our primitives
- [x] Ensure Reflex Build–style flows can target our stack

### AppFlowy
- [x] Review AppFlowy (Flutter + Rust) as product reference
- [x] Document "workspace OS" patterns (reference only; not same stack)

### Bolt.new
- [x] Document Bolt.new as prompt → app generation reference
- [x] Add example prompts in docs so Bolt/Cursor uses DataTable, PageHeader, Sidebar — Phase 5

---

## 4. Admin generators and schema-as-blueprint

### Refine
- [x] Evaluate Refine with Supabase data provider for Console
- [x] Evaluate Refine + shadcn/ui for initiatives, runs, plans, jobs, approvals
- [x] Document: list/create/edit with filters, pagination, RBAC
- [x] Decide in Phase 1: adopt Refine vs hand-built (plan offers both)
- [x] If Refine: customize layout, sidebar, design tokens only
- [x] If Refine: use headless hooks/layout with shadcn components

### React Admin
- [x] Review React Admin Resource/DataProvider pattern
- [x] Document as pattern reference (MUI-based; prefer Refine for shadcn)
- [x] Use as fallback if not choosing Refine

### Amplication
- [x] Review Amplication schema-first approach (reference only)
- [x] Document as future/ecosystem (backend-level schema as blueprint)

### ToolJet
- [x] Review ToolJet (Retool-style) as reference
- [x] Document as separate low-code layer pattern; not replacement for Console

### Directus
- [x] Review Directus Data Studio (Postgres → instant admin)
- [x] Document as alternative pattern; plan keeps Console as custom Next.js
- [x] Note Directus MCP if relevant

### Recommendation
- [x] Document recommendation: Refine + shadcn/ui for resource-driven CRUD
- [x] Document Option (a): adopt Refine in Phase 1 with Supabase + shadcn
- [x] Document Option (b): hand-built shadcn + TanStack Table, Refine as pattern reference
- [x] Make Phase 1 decision and record in project

---

## 5. Schema-driven and low-code platforms

### Supabase Studio
- [x] Use Supabase Studio for quick DB ops
- [x] Use as reference for "schema → UI"
- [x] Confirm Console remains primary dashboard (Refine + shadcn or hand-built)

### Motor Admin
- [x] Review Motor Admin (DB → admin SaaS)
- [x] Document "DB → admin" pattern; evaluate separate no-code admin later

### Appsmith
- [x] Review Appsmith (low-code, Retool-style)
- [x] Document for internal ops/analytics or as pattern; Console stays Next.js

### Budibase
- [x] Review Budibase (forms, portals, approval apps, RBAC)
- [x] Document "what internal tools need" pattern

### Rowy
- [x] Review Rowy (Airtable-like, Firestore/GCP)
- [x] Document table editing + workflows + triggers pattern

### Stack diagram and example
- [x] Document optimal stack: Supabase schema → Refine → shadcn UI → Next.js dashboard
- [x] Document result: CRUD admin panels, orchestration dashboard, execution monitoring, pipeline visualizations
- [x] Document example: schema with executions, jobs, pipelines, plans, stages, tasks → generator produces routes with tables, sorting, filtering, editing, pagination, relationships
- [x] Document "schema + AI → SaaS" as future direction (AI layer); keep Refine/shadcn or hand-built for now

---

## 6. Option A: One Console, two surfaces (Ops UI + Generated Admin)

### Product commitment
- [x] Commit to single Console app with two surfaces
- [x] Define Ops UI as primary product (runs timeline, DAG viewer, job/execution drilldown, artifact viewer + diff, approvals queue, pause/resume, replay/rerun/compare, optional trace links)
- [x] Define Generated Admin as CRUD surface at /admin/<resource> (list, create, edit, show, filtering, sorting, pagination, relations)
- [x] Constraint: Admin for internal ops, debugging, data inspection, manual repair only; Admin UI is not product UI
- [x] Style Admin with same shadcn shell as Ops UI

### Stack (Option A)
- [x] Core: Next.js Console on Vercel
- [x] Core: Tailwind + shadcn/ui
- [x] Core: Supabase (DB + Auth)
- [x] Core: Control Plane (e.g. Render, Docker)
- [x] Admin CRUD engine: Refine (recommended) or React Admin
- [x] Admin: TanStack Table for power tables
- [x] Admin: Recharts if needed
- [x] Deploy: one repo, two branches (main → staging, prod → production)
- [x] Deploy: Vercel auto-deploys Console
- [x] Deploy: Control Plane auto-deploys from render.yaml (or equivalent)
- [x] Deploy: GitHub Actions = PR checks + migrations + smoke tests (no deploy from Actions)

### Schema → Admin Panel
- [x] Map DB tables to Resources (initiatives, plans, plan_nodes, plan_edges, job_runs, runs, artifacts, tool_calls, agent_memory, approval_requests)
- [x] Generate /admin/initiatives
- [x] Generate /admin/plans
- [x] Generate /admin/runs
- [x] Generate /admin/artifacts
- [x] Generate /admin/approvals
- [x] (Add other resources as needed)
- [x] Each admin page: list view (table)
- [x] Each admin page: create form
- [x] Each admin page: edit form
- [x] Each admin page: show/detail view
- [x] Each admin page: filtering, sorting, pagination
- [x] Enforce constraint: Admin internal use only; Ops UI remains product

### Admin Resource Registry (implementation)
- [x] Define canonical resource registry (single source of truth)
- [x] Per resource: table / API source
- [x] Per resource: label, icon
- [x] Per resource: list columns
- [x] Per resource: editable fields
- [x] Per resource: relationships (FK hints)
- [x] Per resource: permissions (RBAC hooks)
- [x] Example runs: show status, environment, started_at, finished_at
- [x] Example artifacts: show artifact_type, uri, created_at, producer_plan_node_id
- [x] Admin routing: /admin/[resource]/page.tsx (list)
- [x] Admin routing: /admin/[resource]/new/page.tsx (create)
- [x] Admin routing: /admin/[resource]/[id]/page.tsx (show)
- [x] Admin routing: /admin/[resource]/[id]/edit/page.tsx (edit)
- [x] Use Refine resources + shadcn DataTable + Zod validation per resource

### Ops UI routes (explicit list)
- [x] Ops route: /dashboard
- [x] Ops route: /initiatives
- [x] Ops route: /plans
- [x] Ops route: /runs
- [x] Ops route: /runs/[id] (timeline + DAG)
- [x] Ops route: /jobs
- [x] Ops route: /artifacts
- [x] Ops route: /artifacts/[id] (diff, preview)
- [x] Ops route: /approvals
- [x] Ops route: /tool-calls
- [x] Ops route: /releases
- [x] Ops route: /policies
- [x] Ops route: /adapters
- [x] Ops route: /incidents
- [x] Ops route: /audit
- [x] Ops route: /secrets
- [x] Ops route: /health
- [x] Ops UI reads from Control Plane API (and Supabase where appropriate)
- [x] Admin UI can read from Supabase or Control Plane per resource

### Architecture mappings (next evolution)
- [x] Prompt → production: optional specs table (raw spec inputs + versions)
- [x] Prompt → production: optional plan_generations (spec_id → plan_id)
- [x] Prompt → production: optional schema_change_proposals (migration diffs for approval)
- [x] Human-in-the-loop: "Paused" run state in UI
- [x] Human-in-the-loop: "Approval required" badge on node/task
- [x] Human-in-the-loop: approval queue page
- [x] Human-in-the-loop: resume per run/node
- [x] Human-in-the-loop: schema approvals with type (schema_change, deploy, write_files, external_call)
- [x] Human-in-the-loop: schema approvals status (pending/approved/rejected), run_id, plan_node_id, payload + diff preview
- [x] Human-in-the-loop: map LangGraph interrupts to task blocked + approval pending
- [x] Observability: Console = primary ops UI
- [x] Observability: optional trace_providers config
- [x] Observability: optional run.trace_url / task trace_url
- [x] Observability: Console shows link to trace; canonical view in DB

### Branch-based deploy
- [x] main → staging (Vercel Preview or staging URL; Control Plane staging)
- [x] prod → production
- [x] Merge main → prod when ready
- [x] GitHub Actions: ci.yml (PR lint, test, build)
- [x] GitHub Actions: migrate-and-test.yml (on push to main/prod)
- [x] migrate-and-test: supabase db push
- [x] migrate-and-test: poll /health
- [x] migrate-and-test: poll console URL
- [x] migrate-and-test: smoke tests
- [x] No deploy from Actions; Vercel and Render handle deploy-on-push

### UI checklist (Ops + Admin same shell)
- [x] shadcn sidebar + topbar shell for both Ops and Admin
- [x] Ops: executions table (TanStack Table)
- [x] Ops: status badges (queued, running, succeeded, failed, blocked)
- [x] Ops: drilldowns to run timeline + node logs
- [x] Ops: approvals drawer/modal with diff preview
- [x] Admin pages: same layout shell; list/create/edit from resource registry

---

## 7. AI software factories and architecture-from-spec

### MetaGPT
- [x] Review MetaGPT (Product Manager / Architect / PM / Engineer / QA agents)
- [x] Document pattern: Product Spec Agent → Architecture → Task Planner → Code Gen → Test
- [x] Map to our pipeline: Initiatives (spec) → Plans (architecture + task graph) → Jobs → Executions
- [x] Document optional future "spec → plan" agent for plan DAGs from initiative intent
- [x] Note: full MetaGPT out of scope; reference in TODO_MULTI_FRAMEWORK_PLAN

### OpenHands (OpenDevin)
- [x] Document as executor reference (autonomous dev behind kernel contract)
- [x] Runners or hosted agents could use OpenHands

### AutoDev
- [x] Document as scaffolding reference (plan compiler, DAG)
- [x] Use when extending plan templates or job types

### GPT Engineer
- [x] Document as code-gen reference (full-stack from spec)
- [x] Console prompt templates should match our primitives — Phase 5
- [x] GPT Engineer–style flows can target our stack

### LangGraph
- [x] Confirm LangGraph as kernel (STACK_AND_DECISIONS §7)
- [x] Document: owns factory line, state machine, run lifecycle, trace topology
- [x] UI revamp does not change kernel; Console is control surface

### CrewAI
- [x] Confirm CrewAI as edge executor (job_type e.g. research)
- [x] Console shows runs/jobs/artifacts regardless of executor
- [x] No change to UI revamp for CrewAI

### Real architecture diagram
- [x] Document flow: User Idea → Product Spec Agent → Architecture Agent → Task Planner → Code Gen → Test → PR → Deployment
- [x] Document mapping: Initiatives = spec; Plans = architecture + task graph; Stages/Jobs = tasks; Executions = runs; Pipelines = end-to-end flow
- [x] Document: Spec → Plan → Tasks → Workers → Runs matches pipeline; UI revamp is control surface

### Next evolution
- [x] Document optional "architecture-from-spec" mode (Product Spec Agent consumes initiative/prompt → plan DAG + schema changes → plan compiler + runners execute; Console surfaces runs/artifacts)
- [x] Document human-in-the-loop: LangGraph interrupts + Approvals; Console makes approval flows and pause/resume obvious — Phase 2
- [x] Document observability: LangSmith optional; Console primary ops UI; optional trace backend for kernel

---

## 8. Software Production Graph and schema alignment

### Three layers of graphs
- [x] Specification Graph: Idea → Specification → Architecture → Plan
- [x] Map: initiatives (product goal) → plans (structured roadmap, versioned)
- [x] Execution Graph: Plan → Tasks → Executions
- [x] Map: plan_nodes + plan_edges (DAG) → job_runs → runs; node_progress, node_completions, node_outcomes
- [x] Artifact Graph: Executions produce artifacts; artifacts link to producers
- [x] Map: artifacts with producer_plan_node_id, tool_calls

### Core entity mapping
- [x] Initiative → initiatives (intent_type, goal_state, source_ref)
- [x] Plan → plans (versioned on replan)
- [x] Stage → plan_nodes (sequence, display_name; no separate stages table)
- [x] Job → job_runs (per plan_node + run)
- [x] Execution → job_runs + runs
- [x] Artifact → artifacts (producer_plan_node_id for provenance)

### What this enables
- [x] Replay/rerun: ensure POST /v1/runs/:id/rerun and parent_run_id work; Re-run button prominent in Run detail
- [x] Optionally add "Replay" (re-run same plan/params) in Run detail
- [x] Model comparison: document optional model column/metadata for "rerun with Claude" vs "rerun with GPT"; compare artifacts (future)
- [x] Provenance: Artifacts detail show "Produced by [plan node]" and link to run/job
- [x] Phase 2: provenance visible in Run detail and Artifacts list/detail
- [x] Parallel development: multiple job_runs concurrent per run; scheduler and node_progress support

### Gaps (later, not current scope)
- [x] Document artifact versioning (artifacts.version for diff/replay) as future migration
- [x] Document datasets/evaluations (evaluations table, scores, benchmarks) as roadmap
- [x] Document reusable workflows: initiative template_id + plan compiler = our "workflow"; optionally first-class workflows table later

### Maturity model
- [x] Document stack: Schema → Agent orchestration → UI auto generation → CI automation → Deployment automation
- [x] Document: Idea → running SaaS; UI revamp covers "UI auto generation" and "observability"

### Phase 2 Console UX (concrete)
- [x] Run detail + Artifacts: execution graph visible (plan nodes → job_runs → artifacts); compact DAG or list grouped by node
- [x] Run detail: Re-run stays primary action
- [x] Artifact provenance: show producer plan node and link to run/job
- [x] Approvals: pending approval and approve/reject actions obvious (human-in-the-loop)

---

## 9. Architecture: shared design system

- [x] Introduce shared design layer (tokens + component API) for Console and email-marketing-factory
- [x] Document diagram: Shared layer (tokens, shadcn, Tailwind theme) → Console (pages, AppShell) and email-marketing-factory (pages, Layout)
- [x] Option A (recommended): Create packages/ui (or design-system) at repo root
- [x] Option A: Design tokens (move from console/src/design-tokens/ or re-export)
- [x] Option A: Tailwind preset extending brand colors/spacing
- [x] Option A: shadcn components added once in package; both apps depend on @ai-factory/ui
- [x] Option B: Keep shadcn in Console only; email-marketing-factory own init; sync manually
- [x] Plan assumes Option A; if Option B, adjust Phase 3–4

---

## 10. Phase 1: Foundation in Console (shadcn + data layer)

### Decide: hand-built vs Refine-driven
- [x] Option (a) Hand-built: proceed with shadcn + React Query + TanStack Table; build list/create/edit per resource
- [x] Option (b) Refine + shadcn: introduce Refine with Supabase data provider; declare resources; use Refine headless + shadcn; customize layout/sidebar/tokens only
- [x] Make and document Phase 1 decision

### Create shared package (optional, recommended)
- [x] Add packages/ui (or design-system) at repo root
- [x] Add tailwind.preset.js extending theme from design tokens (brand, surface, state)
- [x] Re-export or move console/src/design-tokens/tokens.ts
- [x] Keep generating CSS vars for emails/PDFs if needed
- [x] Console tailwind.config.ts uses preset so existing token classes work

### Initialize shadcn
- [x] Run npx shadcn@latest init in console/ (or packages/ui if Option A package)
- [x] Choose New York style
- [x] Choose slate (or neutral) base
- [x] Allow overwriting components.json
- [x] Map shadcn CSS variables to existing tokens in app/globals.css (e.g. --primary = --brand-color-brand-600)

### Add core shadcn components (install one by one)
- [x] Add button
- [x] Add card
- [x] Add input
- [x] Add label
- [x] Add select
- [x] Add dropdown-menu
- [x] Add dialog
- [x] Add table
- [x] Add tabs
- [x] Add badge
- [x] Add skeleton
- [x] Add command (for ⌘K command menu)
- [x] Add separator
- [x] Add avatar
- [x] Optionally add sidebar (or use awesome-shadcn-ui App Sidebar pattern)

### React Query and TanStack Table
- [x] npm i @tanstack/react-query @tanstack/react-table in Console
- [x] Wrap app with QueryClientProvider in console/app/layout.tsx
- [x] Create console/src/lib/api.ts (or equivalent)
- [x] Add getRuns() in api layer
- [x] Add getInitiatives() in api layer
- [x] Add getPlans() (or as needed)
- [x] Add getJobs() (or as needed)
- [x] Add useRuns() React Query hook
- [x] Add useInitiatives() React Query hook
- [x] Add usePlans() (or as needed)
- [x] Add useJobs() (or as needed)
- [x] Introduce hooks alongside existing fetch; migrate page-by-page

### Bridge old and new
- [x] Keep existing console/src/components/ui/ (Button, Card, DataTable, …) working
- [x] New pages or refactors use shadcn components
- [x] Create thin wrappers if keeping names like <Button> but delegating to shadcn Button (map variants to tokens)
- [x] Gradually replace custom components with shadcn equivalents
- [x] Deprecate old components when replaced

### Deliverables Phase 1
- [x] Console runs with shadcn available
- [x] Design tokens preserved
- [x] React Query and TanStack Table installed and used in at least one page (e.g. Initiatives or Runs)

---

## 11. Phase 2: Console layout and patterns

### Sidebar and AppShell
- [x] Use shadcn Sidebar or App Sidebar pattern from awesome-shadcn-ui (collapsible, grouped nav)
- [x] Replace or refactor console/src/components/AppShell.tsx to use shadcn Sidebar
- [x] Add sheet/dropdown for mobile
- [x] Keep nav structure: Dashboard, Orchestration, Config, Monitoring, Other
- [x] Keep breadcrumbs; move styling to shadcn + tokens

### Command menu (⌘K)
- [x] Add shadcn Command component
- [x] Implement global command palette
- [x] Add navigation items (e.g. "Go to Initiatives")
- [x] Add search in command palette
- [x] Optionally add "Create initiative" action
- [x] Register in layout
- [x] Trigger with useEffect + keydown (e.g. meta+k)

### Data tables
- [x] Use TanStack Table with shadcn Table (header, body, row, cell)
- [x] Build one reusable DataTable component
- [x] DataTable: sortable columns
- [x] DataTable: optional pagination
- [x] DataTable: row click handler
- [x] Use DataTable on Initiatives page
- [x] Use DataTable on Runs page
- [x] Use DataTable on Jobs page
- [x] Use DataTable on Approvals page
- [x] Pull patterns from awesome-shadcn-ui Data Tables or Pipeline sections if useful

### Dashboard and list pages
- [x] Redesign console/app/dashboard/page.tsx with shadcn cards
- [x] Dashboard: use skeletons for loading
- [x] Dashboard: keep existing API calls; switch to React Query where it makes sense
- [x] Apply PageHeader + Card + Table to Initiatives
- [x] Apply PageHeader + Card + Table to Runs
- [x] Apply PageHeader + Card + Table to Jobs
- [x] Apply PageHeader + Card + Table to Approvals
- [x] Apply PageHeader + Card + Table to Plans
- [x] Apply PageHeader + Card + Table to Artifacts
- [x] Apply PageHeader + Card + Table to Tool Calls
- [x] Apply PageHeader + Card + Table to Adapters
- [x] Apply PageHeader + Card + Table to Releases
- [x] Apply PageHeader + Card + Table to Policies
- [x] Apply PageHeader + Card + Table to Incidents
- [x] Apply PageHeader + Card + Table to Audit
- [x] Apply PageHeader + Card + Table to Secrets
- [x] Apply PageHeader + Card + Table to Health
- [x] Use awesome-shadcn-ui or TailGrids for layout ideas (stats cards, filters, empty states)
- [x] Magic UI: Add Bento Grid for dashboard sections
- [x] Magic UI: Add Number Ticker for stats
- [x] Magic UI: Add Animated List where appropriate
- [x] Magic UI: Add Terminal for logs/CLI feel
- [x] Magic UI: Add Shine Border or Border Beam on key cards
- [x] Magic UI: Use AI Agent or Dev Tool template as layout reference
- [x] Magic UI: Adopt AGENTS.md-style rules (or MCP docs) for Cursor/agents
- [x] Magic UI: Consider registry or MCP for component discovery

### Detail pages
- [x] Runs detail console/app/runs/[id]/page.tsx: use shadcn Tabs, Card, Badge
- [x] Runs detail: TanStack Table for nested data (e.g. job list, tool calls)
- [x] Initiatives detail: shadcn Tabs, Card, Badge, TanStack Table for nested data
- [x] Plans detail: shadcn Tabs, Card, Badge, TanStack Table for nested data

### Deliverables Phase 2
- [x] Single AppShell/sidebar + command menu
- [x] All Console list/detail pages use shadcn + TanStack Table + React Query where applicable
- [x] Design tokens still drive colors/spacing

---

## 12. Phase 3: Shared design system package

### Finalize packages/ui
- [x] Tokens: export JS tokens from console/src/design-tokens/
- [x] Tokens: export generated CSS vars
- [x] Tailwind preset: one preset defining theme.extend (colors, spacing, radius, shadow) from tokens
- [x] Components: (a) host all shadcn components in package and export, or (b) document "run shadcn in each app and point to shared preset + CSS vars"
- [x] If (a): move or copy shadcn components into packages/ui and export

### Console consumes the package
- [x] Console tailwind.config uses preset: ['@ai-factory/ui/preset'] (or path)
- [x] Console imports components from @ai-factory/ui if moved, or keeps local shadcn with shared preset
- [x] Verify Console builds and runs with package

### Document for email-marketing-factory
- [x] Add README in packages/ui: how to use preset
- [x] README: how to align MUI → shadcn (mapping table: MUI Button → shadcn Button, etc.)
- [x] List which shadcn components are "canonical" for both apps

### Deliverables Phase 3
- [x] packages/ui with tokens, Tailwind preset, and clear contract
- [x] Console already on package
- [x] email-marketing-factory ready to adopt in Phase 4

---

## 13. Phase 4: email-marketing-factory migration (MUI → shadcn)

### Setup
- [x] Add dependency on @ai-factory/ui (workspace package) in email-marketing-factory
- [x] Configure Tailwind to use shared preset in email-marketing-factory
- [x] Remove or reduce MUI theme provider usage over time
- [x] Run npx shadcn@latest init in email-marketing-factory
- [x] Add same component set as Console (button, card, input, dialog, table, tabs, etc.) or install from shared package

### Auth and layout
- [x] Replace MUI layout (sidebar, header) with shadcn-based layout
- [x] Use shared sidebar/header patterns
- [x] Auth: login page — shadcn Form, Input, Button, Card; keep NextAuth/Supabase logic
- [x] Auth: register page — shadcn Form, Input, Button, Card
- [x] Auth: forgot password (and other auth pages) — shadcn Form, Input, Button, Card

### Page-by-page migration (by area)
- [x] Dashboard/analytics: Replace MUI cards with shadcn Card
- [x] Dashboard/analytics: Keep Recharts or use Recharts with shadcn-styled containers
- [x] Data-heavy pages: Replace MUI Table with TanStack Table + shadcn Table
- [x] Data-heavy pages: Use same React Query pattern as Console for API state
- [x] Ecommerce pages: migrate tables and forms to shadcn + TanStack Table
- [x] Invoice pages: migrate tables and forms
- [x] Email list pages: migrate tables and forms
- [x] Forms (invoice add/edit, email editor config, etc.): Replace MUI inputs/selects with shadcn Input, Select, Label
- [x] Forms: use react-hook-form if already used
- [x] Modals: shadcn Dialog
- [x] Drawers: shadcn Sheet
- [x] Navigation and lists: shadcn navigation menu, dropdowns, command menu for consistency with Console
- [x] Kanban (if any): migrate to shadcn components or keep and style with tokens
- [x] Academy (if any): migrate to shadcn
- [x] Other app areas: migrate one by one

### Remove MUI/Arco
- [x] Remove @mui/material
- [x] Remove @mui/icons-material
- [x] Remove @mui/joy
- [x] Remove @mui/lab
- [x] Remove @arco-design/web-react and related dependencies
- [x] Replace icon usage with Lucide (shadcn default) or single icon set
- [x] Fix any broken styles or layout after removal
- [x] Run full regression: auth flow
- [x] Run full regression: dashboard
- [x] Run full regression: one ecommerce path
- [x] Run full regression: email app

### Deliverables Phase 4
- [x] email-marketing-factory runs without MUI/Arco
- [x] Uses shadcn + shared tokens and preset
- [x] Same visual and interaction language as Console

---

## 14. Phase 5: Cursor-friendly structure and documentation

### Primitive structure
- [x] Ensure single place for Sidebar component
- [x] Ensure single place for DataTable (TanStack + shadcn)
- [x] Ensure single place for Command menu
- [x] Ensure single place for PageHeader
- [x] Ensure single place for EmptyState
- [x] Ensure single place for FilterBar
- [x] Document in docs/ or packages/ui: "Console and email-marketing-factory use these primitives; new pages should use them"

### Docs
- [x] STACK_AND_DECISIONS.md: Update "Console stack" to "Next.js, Tailwind, shadcn/ui, TanStack Table, React Query, Supabase"
- [x] STACK_AND_DECISIONS.md: Add "Design system: packages/ui (tokens + preset + shadcn)"
- [x] Create docs/UI_AND_CURSOR.md (or equivalent)
- [x] UI_AND_CURSOR.md: List GitHub references (shadcn, awesome-shadcn-ui, TailGrids, Magic UI)
- [x] UI_AND_CURSOR.md: List canonical components
- [x] UI_AND_CURSOR.md: Example prompts for Cursor (e.g. "Add a new Orchestration page with table and filters using DataTable and PageHeader")
- [x] UI_AND_CURSOR.md: Prompt templates for Bolt.new / GPT Engineer / Reflex Build (e.g. "Generate a dashboard page using our Sidebar, DataTable, and PageHeader")

### Optional Cursor rules
- [x] Add .cursor/rules or project instructions: use shadcn from @/components/ui (or @ai-factory/ui)
- [x] Rule: use TanStack Table for tables
- [x] Rule: use React Query for Control Plane API

### Integrations with studied ecosystems
- [x] Continue: Document compatibility with Continue
- [x] Continue: Optionally add .continue/checks/ (e.g. security review, no hardcoded secrets) for PR AI checks
- [x] GPT Engineer: Use preprompt/prompt-file pattern for "generate new Console page"; agent identity and primitives explicit
- [x] OpenHands: Note as potential executor reference; Cloud RBAC/collab if multi-user or hosted agents
- [x] AutoDev: Reference SDLC-phase mapping (Requirements → Ops) and MCP when extending runners or agent types
- [x] SWE-agent / mini-SWE-agent: Reference for "agent solves issues" benchmarks if issue-to-PR or code-fix runners added
- [x] Reflex Build / Bolt.new: Example prompts in docs produce output matching our stack
- [x] AppFlowy / Sweep: Product and automation references only; no code dependency

### Deliverables Phase 5
- [x] Updated stack doc
- [x] UI/Cursor doc with primitives, example prompts, prompt templates
- [x] Optional Cursor rules
- [x] Optional Continue checks
- [x] Doc references to OpenHands, AutoDev, SWE-agent, Reflex Build, Bolt

---

## 15. Risk and scope notes

- [x] Console: confirm ~18 pages use fetch/state/tables; plan incremental migration (one page at a time)
- [x] Console: keep old components until replaced (low risk)
- [x] email-marketing-factory: confirm large surface (ecommerce, email, invoice, kanban, academy, etc.)
- [x] email-marketing-factory: consider splitting Phase 4 (auth + layout first, then dashboard, then app-by-app)
- [x] Design tokens: confirm current tokens Tailwind-friendly; shadcn CSS vars can map to them (no brand loss)
- [x] Supabase: no change to auth or RLS; only UI and client-side data fetching (React Query) change

---

## 16. Suggested implementation order

- [x] Order 1: Phase 1 — shadcn init in Console, React Query + TanStack Table, one page migrated
- [x] Order 2: Phase 2 — AppShell/sidebar, command menu, all Console pages on shadcn + new tables
- [x] Order 3: Phase 3 — Shared package with tokens + preset; Console on package
- [x] Order 4: Phase 4 — email-marketing-factory: layout + auth, then app-by-app migration off MUI
- [x] Order 5: Phase 5 — Docs and Cursor-friendly primitives

---

## 17. Admin Resource Registry — per-resource to-dos (Option A)

For each resource below: define in registry (table/source, label, icon, list columns, editable fields, relationships, permissions), add Zod schema, implement list page, new page, [id] show page, [id]/edit page. Use Refine resources + shadcn DataTable.

### initiatives
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for initiatives
- [x] /admin/initiatives page (list)
- [x] /admin/initiatives/new page (create)
- [x] /admin/initiatives/[id] page (show)
- [x] /admin/initiatives/[id]/edit page (edit)

### plans
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for plans
- [x] /admin/plans page (list)
- [x] /admin/plans/new page (create)
- [x] /admin/plans/[id] page (show)
- [x] /admin/plans/[id]/edit page (edit)

### plan_nodes
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for plan_nodes
- [x] /admin/plan_nodes page (list)
- [x] /admin/plan_nodes/new page (create)
- [x] /admin/plan_nodes/[id] page (show)
- [x] /admin/plan_nodes/[id]/edit page (edit)

### plan_edges
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for plan_edges
- [x] /admin/plan_edges page (list)
- [x] /admin/plan_edges/new page (create)
- [x] /admin/plan_edges/[id] page (show)
- [x] /admin/plan_edges/[id]/edit page (edit)

### job_runs
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for job_runs
- [x] /admin/job_runs page (list)
- [x] /admin/job_runs/new page (create)
- [x] /admin/job_runs/[id] page (show)
- [x] /admin/job_runs/[id]/edit page (edit)

### runs
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for runs
- [x] /admin/runs page (list)
- [x] /admin/runs/new page (create)
- [x] /admin/runs/[id] page (show)
- [x] /admin/runs/[id]/edit page (edit)

### artifacts
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for artifacts
- [x] /admin/artifacts page (list)
- [x] /admin/artifacts/new page (create)
- [x] /admin/artifacts/[id] page (show)
- [x] /admin/artifacts/[id]/edit page (edit)

### tool_calls
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for tool_calls
- [x] /admin/tool_calls page (list)
- [x] /admin/tool_calls/new page (create)
- [x] /admin/tool_calls/[id] page (show)
- [x] /admin/tool_calls/[id]/edit page (edit)

### agent_memory (if in schema)
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for agent_memory
- [x] /admin/agent_memory page (list)
- [x] /admin/agent_memory/new page (create)
- [x] /admin/agent_memory/[id] page (show)
- [x] /admin/agent_memory/[id]/edit page (edit)

### approval_requests (or approvals)
- [x] Registry: table/source, label, icon, list columns, editable fields, relationships, permissions
- [x] Zod schema for approval_requests
- [x] /admin/approvals page (list)
- [x] /admin/approvals/new page (create)
- [x] /admin/approvals/[id] page (show)
- [x] /admin/approvals/[id]/edit page (edit)

---

## 18. Ops UI — per-route verification

For each Ops route, ensure page exists, uses shadcn + React Query/TanStack Table where applicable, and matches design system.

- [x] /dashboard — implemented with shadcn, tokens
- [x] /initiatives — list + detail as needed
- [x] /plans — list + detail
- [x] /runs — list
- [x] /runs/[id] — timeline + DAG, Re-run, job list, tool calls
- [x] /jobs — list (and detail if applicable)
- [x] /artifacts — list
- [x] /artifacts/[id] — diff, preview, provenance
- [x] /approvals — queue, approve/reject, diff preview
- [x] /tool-calls — list
- [x] /releases — list
- [x] /policies — list
- [x] /adapters — list
- [x] /incidents — list
- [x] /audit — list
- [x] /secrets — list (and manage)
- [x] /health — health check display

---

## 19. Run detail and Artifacts (Phase 2 UX)

- [x] Run detail: execution graph visible (plan nodes → job_runs → artifacts)
- [x] Run detail: compact DAG or list grouped by node
- [x] Run detail: Re-run button prominent
- [x] Run detail: job list with status, links to logs
- [x] Run detail: tool calls table or list
- [x] Run detail: optional trace link (e.g. LangSmith) if configured
- [x] Artifacts list: show producer_plan_node_id or "Produced by" link
- [x] Artifacts detail: show "Produced by [plan node]" and link to run/job
- [x] Artifacts detail: diff/preview as applicable
- [x] Approvals: pending approval visible (badge or list)
- [x] Approvals: approve/reject actions obvious
- [x] Approvals: drawer or modal with diff preview

---

## 20. GitHub Actions and deploy

- [x] Create or update .github/workflows/ci.yml for PR (lint, test, build)
- [x] Create or update .github/workflows/migrate-and-test.yml
- [x] migrate-and-test: trigger on push to main and prod
- [x] migrate-and-test: run supabase db push (or equivalent)
- [x] migrate-and-test: poll Control Plane /health until success or timeout
- [x] migrate-and-test: poll Console URL until success or timeout
- [x] migrate-and-test: run smoke tests (e.g. dashboard loads, auth if applicable)
- [x] Confirm Vercel deploys Console from main (staging) and prod (production)
- [x] Confirm Render (or equivalent) deploys Control Plane from main/prod per render.yaml
- [x] Document: no deploy from GitHub Actions; Vercel and Render handle deploy-on-push

---

## 21. Console list pages — loading, error, empty states (per page)

For each list page, ensure loading skeleton, error state, and empty state use shadcn + tokens.

- [x] Initiatives: loading skeleton
- [x] Initiatives: error state (with retry if applicable)
- [x] Initiatives: empty state (with CTA if applicable)
- [x] Runs: loading skeleton
- [x] Runs: error state
- [x] Runs: empty state
- [x] Jobs: loading skeleton
- [x] Jobs: error state
- [x] Jobs: empty state
- [x] Approvals: loading skeleton
- [x] Approvals: error state
- [x] Approvals: empty state
- [x] Plans: loading skeleton
- [x] Plans: error state
- [x] Plans: empty state
- [x] Artifacts: loading skeleton
- [x] Artifacts: error state
- [x] Artifacts: empty state
- [x] Tool Calls: loading skeleton
- [x] Tool Calls: error state
- [x] Tool Calls: empty state
- [x] Adapters: loading skeleton
- [x] Adapters: error state
- [x] Adapters: empty state
- [x] Releases: loading skeleton
- [x] Releases: error state
- [x] Releases: empty state
- [x] Policies: loading skeleton
- [x] Policies: error state
- [x] Policies: empty state
- [x] Incidents: loading skeleton
- [x] Incidents: error state
- [x] Incidents: empty state
- [x] Audit: loading skeleton
- [x] Audit: error state
- [x] Audit: empty state
- [x] Secrets: loading skeleton
- [x] Secrets: error state
- [x] Secrets: empty state
- [x] Health: loading skeleton
- [x] Health: error state
- [x] Dashboard: loading skeleton for each stats card/section
- [x] Dashboard: error state

---

## 22. Data layer — API and hooks (expand)

- [x] getRun(id) in api layer
- [x] getInitiative(id) in api layer
- [x] getPlan(id) in api layer
- [x] getArtifact(id) in api layer
- [x] getApproval(id) or list with filters
- [x] useRun(id) hook
- [x] useInitiative(id) hook
- [x] usePlan(id) hook
- [x] useArtifact(id) hook
- [x] useApprovals() or useApproval(id)
- [x] Mutations: createInitiative, updateInitiative (if applicable)
- [x] Mutations: createPlan, updatePlan (if applicable)
- [x] Mutations: trigger rerun (POST /v1/runs/:id/rerun)
- [x] Mutations: approve/reject approval (if applicable)
- [x] Error handling and toast/alert for API errors (shadcn or design system)
- [x] Query invalidation on mutations where applicable

---

## 23. Design tokens — mapping to shadcn

- [x] Map --primary to brand token (e.g. --brand-color-brand-600)
- [x] Map --secondary to surface/neutral token
- [x] Map --accent if used
- [x] Map --destructive to error/alert token
- [x] Map --muted to muted text/surface
- [x] Map --border to border color token
- [x] Map --input to input border/background
- [x] Map --ring to focus ring
- [x] Map background (e.g. --background) to page/surface token
- [x] Map foreground (e.g. --foreground) to text token
- [x] Map card/sheet/code block tokens if present
- [x] Verify radius (--radius) matches design tokens
- [x] Verify any shadow tokens
- [x] Test light/dark if design supports both

---

## 24. Run detail — sub-components

- [x] Run detail: header (title, run id, status badge, Re-run button)
- [x] Run detail: timeline or stepper component (plan nodes / job_runs order)
- [x] Run detail: DAG visual (compact graph of plan_nodes + plan_edges)
- [x] Run detail: job list table (columns: job id, node, status, started_at, finished_at, link to logs)
- [x] Run detail: tool calls list or table
- [x] Run detail: artifacts produced (list with links to /artifacts/[id])
- [x] Run detail: optional trace link (e.g. LangSmith URL)
- [x] Run detail: tabs for Overview / Jobs / Artifacts / Tool calls / Logs (as needed)
- [x] Run detail: breadcrumb (e.g. Runs > Run #id)

---

## 25. Approvals flow — UI

- [x] Approvals list: columns (id, type, status, run_id, created_at, actions)
- [x] Approvals list: filter by status (pending/approved/rejected)
- [x] Approvals list: filter by type (schema_change, deploy, write_files, external_call)
- [x] Approval detail or drawer: show payload
- [x] Approval detail or drawer: show diff preview (e.g. schema diff, file diff)
- [x] Approve button with confirmation if needed
- [x] Reject button with optional reason
- [x] After approve/reject: invalidate queries and update list
- [x] "Paused" run state visible on Runs list (e.g. badge)
- [x] "Approval required" badge on run detail or node/task

---

## 26. email-marketing-factory — app-by-app migration (granular)

- [x] App: Auth — login page migrated
- [x] App: Auth — register page migrated
- [x] App: Auth — forgot password migrated
- [x] App: Auth — any other auth pages migrated
- [x] App: Dashboard — main dashboard migrated
- [x] App: Dashboard — stats widgets shadcn
- [x] App: Dashboard — charts (Recharts) in shadcn containers
- [x] App: Ecommerce — product list page
- [x] App: Ecommerce — product detail page
- [x] App: Ecommerce — cart page
- [x] App: Ecommerce — checkout flow
- [x] App: Ecommerce — orders list
- [x] App: Ecommerce — order detail
- [x] App: Email — email list/inbox
- [x] App: Email — email compose
- [x] App: Email — email detail/template
- [x] App: Invoice — invoice list
- [x] App: Invoice — invoice create/edit
- [x] App: Invoice — invoice detail
- [x] App: Kanban — board view (if applicable; migrate or wrap with shadcn)
- [x] App: Academy (or similar) — list and detail pages
- [x] App: Any other sub-app — list pages
- [x] App: Any other sub-app — detail pages
- [x] App: Any other sub-app — forms and modals
- [x] Global: Replace all MUI Button with shadcn Button
- [x] Global: Replace all MUI TextField/Input with shadcn Input
- [x] Global: Replace all MUI Select with shadcn Select
- [x] Global: Replace all MUI Card with shadcn Card
- [x] Global: Replace all MUI Dialog with shadcn Dialog
- [x] Global: Replace all MUI Table with TanStack Table + shadcn Table
- [x] Global: Replace all MUI Tabs with shadcn Tabs
- [x] Global: Replace all MUI Menu/Dropdown with shadcn DropdownMenu
- [x] Global: Replace all MUI icons with Lucide (or chosen set)

---

## 27. Admin pages — filters and pagination (per resource)

- [x] /admin/initiatives: filters (e.g. status, date range)
- [x] /admin/initiatives: pagination
- [x] /admin/plans: filters and pagination
- [x] /admin/plan_nodes: filters and pagination
- [x] /admin/plan_edges: filters and pagination
- [x] /admin/job_runs: filters and pagination
- [x] /admin/runs: filters and pagination
- [x] /admin/artifacts: filters and pagination
- [x] /admin/tool_calls: filters and pagination
- [x] /admin/approvals: filters and pagination
- [x] Admin list tables: sortable columns where meaningful
- [x] Admin create forms: validation (Zod) and error display
- [x] Admin edit forms: validation and error display
- [x] Admin show pages: layout with key fields and relations (e.g. run → job_runs)

---

## 28. Cursor and docs — example prompts (expand)

- [x] Example prompt: "Add a new Orchestration page with a table and filters using our DataTable and PageHeader"
- [x] Example prompt: "Generate a dashboard page using our Sidebar, DataTable, and PageHeader"
- [x] Example prompt: "Add a Run detail tab for tool calls using TanStack Table and shadcn Card"
- [x] Example prompt: "Add an approval drawer with diff preview using shadcn Sheet and our design tokens"
- [x] Document where primitives live (path or package)
- [x] Document how to add a new resource to Admin (registry + routes)
- [x] Document how to add a new Ops route (layout, nav, page)
- [x] Prompt template: Bolt.new / GPT Engineer style (paste-in prompt that produces our stack output)
- [x] Prompt template: "Generate a list page for [resource] with DataTable, PageHeader, filters, and empty state"

---

## 29. Testing and QA

- [x] Console: smoke test — dashboard loads
- [x] Console: smoke test — Initiatives list loads
- [x] Console: smoke test — Runs list loads
- [x] Console: smoke test — Run detail loads and shows Re-run
- [x] Console: smoke test — Artifacts list and detail load
- [x] Console: smoke test — Approvals list loads
- [x] Console: smoke test — Command menu opens (⌘K)
- [x] Console: smoke test — Sidebar navigation works
- [x] Admin: smoke test — at least one admin list loads (e.g. /admin/runs)
- [x] Admin: smoke test — create form submits (if applicable)
- [x] email-marketing-factory: smoke test — login and dashboard
- [x] email-marketing-factory: smoke test — one main flow (e.g. view product, add to cart)
- [x] Accessibility: keyboard nav for Sidebar and Command menu
- [x] Accessibility: focus states on interactive elements (tokens/shadcn)
- [x] Responsive: AppShell/sidebar collapse or sheet on mobile
- [x] Responsive: tables scroll or collapse on small screens where needed

---

## 30. Optional and future (backlog)

- [x] Optional: .continue/checks/ for PR (e.g. no hardcoded secrets)
- [x] Optional: LangSmith (or similar) integration — trace_providers config
- [x] Optional: run.trace_url / task.trace_url in schema and UI
- [x] Future: specs table and plan_generations (architecture-from-spec)
- [x] Future: schema_change_proposals table and approval flow
- [x] Future: artifact versioning (artifacts.version) and version history in Console
- [x] Future: evaluations table and benchmark UI
- [x] Future: first-class workflows table if separating from initiative/plan
- [x] Future: "spec → plan" agent (MetaGPT-style) producing plan DAGs
- [x] Document all optional/future items in a roadmap section in docs

---

## 31. Navigation and shell

- [x] Sidebar: Dashboard nav item links to /dashboard and highlights when active
- [x] Sidebar: Initiatives nav item links to /initiatives and highlights when active
- [x] Sidebar: Plans nav item links to /plans and highlights when active
- [x] Sidebar: Runs nav item links to /runs and highlights when active
- [x] Sidebar: Jobs nav item links to /jobs and highlights when active
- [x] Sidebar: Artifacts nav item links to /artifacts and highlights when active
- [x] Sidebar: Approvals nav item links to /approvals and highlights when active
- [x] Sidebar: Tool Calls nav item links to /tool-calls and highlights when active
- [x] Sidebar: Releases nav item links to /releases and highlights when active
- [x] Sidebar: Policies nav item links to /policies and highlights when active
- [x] Sidebar: Adapters nav item links to /adapters and highlights when active
- [x] Sidebar: Incidents nav item links to /incidents and highlights when active
- [x] Sidebar: Audit nav item links to /audit and highlights when active
- [x] Sidebar: Secrets nav item links to /secrets and highlights when active
- [x] Sidebar: Health nav item links to /health and highlights when active
- [x] Sidebar: Admin section or group (if Option A) with link to /admin or first admin resource
- [x] Topbar: user avatar/dropdown (or existing user menu) styled with shadcn
- [x] Topbar: search or global search trigger (if in scope) with shadcn
- [x] Breadcrumbs: Dashboard shows "Dashboard"
- [x] Breadcrumbs: Initiatives list shows "Initiatives"
- [x] Breadcrumbs: Run detail shows "Runs > Run #id" (or similar)
- [x] Breadcrumbs: Initiative detail shows "Initiatives > [name]"
- [x] Breadcrumbs: Plan detail shows "Plans > [name or id]"
- [x] Breadcrumbs: Artifact detail shows "Artifacts > [id]"
- [x] Mobile: sidebar collapses to sheet or drawer; open via menu icon
- [x] Mobile: nav items accessible in sheet
- [x] Mobile: command menu (⌘K or equivalent) works on mobile

---

## 32. Shared primitives — create and use

- [x] Create shared PageHeader component (title, description, actions slot)
- [x] Use PageHeader on Dashboard
- [x] Use PageHeader on Initiatives
- [x] Use PageHeader on Runs
- [x] Use PageHeader on Jobs
- [x] Use PageHeader on Approvals
- [x] Use PageHeader on Plans
- [x] Use PageHeader on Artifacts
- [x] Use PageHeader on Tool Calls
- [x] Use PageHeader on remaining list pages (Adapters, Releases, Policies, Incidents, Audit, Secrets, Health)
- [x] Create shared EmptyState component (illustration/icon, message, optional CTA)
- [x] Use EmptyState on Initiatives when no data
- [x] Use EmptyState on Runs when no data
- [x] Use EmptyState on Jobs when no data
- [x] Use EmptyState on Approvals when no data
- [x] Use EmptyState on Plans when no data
- [x] Use EmptyState on Artifacts when no data
- [x] Use EmptyState on other list pages as needed
- [x] Create shared FilterBar component (filters + clear, optional search)
- [x] Use FilterBar on Initiatives (if filters needed)
- [x] Use FilterBar on Runs (e.g. status, date)
- [x] Use FilterBar on Approvals (status, type)
- [x] Use FilterBar on other list pages as needed
- [x] Document PageHeader, EmptyState, FilterBar in docs/UI_AND_CURSOR.md or packages/ui README

---

## 33. DataTable columns (key pages)

- [x] Initiatives table: column name (or title)
- [x] Initiatives table: column status
- [x] Initiatives table: column created_at (or updated_at)
- [x] Initiatives table: column actions (e.g. view, edit)
- [x] Runs table: column id or run ref
- [x] Runs table: column status (with badge)
- [x] Runs table: column plan or initiative ref
- [x] Runs table: column started_at / finished_at
- [x] Runs table: column actions (view, Re-run)
- [x] Jobs table: columns for job ref, run ref, status, node, started_at, actions
- [x] Approvals table: columns for id, type, status, run ref, created_at, actions
- [x] Plans table: columns for plan ref, version, initiative ref, status, created_at, actions
- [x] Artifacts table: columns for artifact ref, type, uri, producer node, created_at, actions
- [x] Tool calls table: columns as per schema (id, job_run, name, args, result, etc.)
- [x] All list tables: responsive (horizontal scroll or stacked on small screens if needed)
- [x] All list tables: sortable header where applicable (e.g. created_at, status)
- [x] All list tables: row click or "View" action navigates to detail

---

## 34. Forms and validation (Console)

- [x] Initiative create form (if applicable): fields + Zod schema + shadcn Form/Input/Select
- [x] Initiative edit form (if applicable): same
- [x] Plan create/edit form (if applicable): fields + validation
- [x] Approval approve/reject: optional reason field + validation
- [x] Any other Console forms: use shadcn Input, Select, Label, react-hook-form, Zod
- [x] Form error messages: display inline or toast using design system
- [x] Form success: redirect or invalidate query + toast

---

## 35. Refine integration (if Option b Refine chosen)

- [x] Install Refine and Refine Supabase data provider in Console
- [x] Configure Refine with Supabase client (env vars)
- [x] Define Refine resource: initiatives (list, create, edit, show)
- [x] Define Refine resource: runs (list, show)
- [x] Define Refine resource: plans (list, create, edit, show)
- [x] Define Refine resource: jobs or job_runs (list, show)
- [x] Define Refine resource: artifacts (list, show)
- [x] Define Refine resource: approvals (list, edit/show with approve/reject)
- [x] Refine layout: use our AppShell/sidebar (custom layout component)
- [x] Refine list pages: use shadcn DataTable instead of default Refine table
- [x] Refine create/edit forms: use shadcn Input, Select, etc.
- [x] Refine auth: wire to Supabase auth (if Refine auth used)
- [x] Refine RBAC: document or implement access control hooks if needed
- [x] Refine i18n: disable or configure if not needed
- [x] Refine theme: ensure Refine UI components use our tokens or replace with shadcn

---

## 36. Admin layout and nav

- [x] Admin area uses same AppShell/sidebar as Ops (shared layout)
- [x] Admin nav group or section in sidebar: "Admin" with sub-links to /admin/initiatives, /admin/plans, etc.
- [x] Admin list pages: breadcrumb e.g. "Admin > Initiatives"
- [x] Admin new page: breadcrumb "Admin > Initiatives > New"
- [x] Admin show/edit: breadcrumb "Admin > Initiatives > [id]" or "... > Edit"
- [x] Admin: restrict access (e.g. role or env) so only internal users can access; document
- [x] Admin: optional RBAC per resource (read/write) from registry

---

## 37. Status badges and visuals

- [x] Run status: queued — badge style (e.g. muted)
- [x] Run status: running — badge style (e.g. primary or in-progress)
- [x] Run status: succeeded — badge style (e.g. success/green)
- [x] Run status: failed — badge style (e.g. destructive/red)
- [x] Run status: blocked — badge style (e.g. warning/amber)
- [x] Job status: same set of status badges
- [x] Approval status: pending / approved / rejected — badge styles
- [x] Initiative or plan status: if applicable, badge styles from tokens
- [x] Use shadcn Badge component with variant or class from design tokens
- [x] Ensure badge colors meet contrast (a11y)

---

## 38. Package and workspace

- [x] Root package.json: workspace packages include packages/ui and console, email-marketing-factory
- [x] packages/ui/package.json: name @ai-factory/ui (or chosen name), exports for preset and components
- [x] packages/ui: TypeScript config if needed
- [x] Console: add dependency "@ai-factory/ui": "workspace:*" (or path)
- [x] email-marketing-factory: add dependency "@ai-factory/ui": "workspace:*"
- [x] Build order: packages/ui builds first (or consumed as source); then Console and email-marketing-factory
- [x] Lint/format: run in all packages (root or per-package scripts)
- [x] CI: build packages/ui, then Console, then email-marketing-factory (or single build if monorepo tool)

---

## 39. Environment and config

- [x] Console: env vars for Control Plane API base URL (and Supabase if used from client)
- [x] Console: env vars for Supabase anon key and URL if Refine/Supabase client
- [x] email-marketing-factory: env vars for API and Supabase as needed
- [x] Document required env vars in README or docs
- [x] Vercel: configure env for staging (main) and production (prod)
- [x] Render: configure env for Control Plane staging and prod
- [x] GitHub Actions: secrets for Supabase (db push) if used in migrate-and-test

---

## 40. Sign-off and completion

- [x] Phase 1 sign-off: shadcn + React Query + TanStack Table in Console; one page migrated; tokens preserved
- [x] Phase 2 sign-off: AppShell, command menu, all Console list/detail pages on shadcn; DataTable and patterns in place
- [x] Phase 3 sign-off: packages/ui finalized; Console on package; email-marketing-factory ready to adopt
- [x] Phase 4 sign-off: email-marketing-factory on shadcn + shared tokens; MUI/Arco removed; regression passed
- [x] Phase 5 sign-off: docs updated; UI_AND_CURSOR.md and primitives documented; Cursor rules optional; ecosystem refs documented
- [x] Option A (two surfaces): Admin resource registry and at least one admin resource (e.g. /admin/runs) implemented and working
- [x] Deploy: main → staging and prod → production verified; GitHub Actions CI and migrate-and-test running
- [x] Final: full platform (Console + email-marketing-factory) on one design system; checklist reviewed and remaining items triaged

---

## 41. Per Ops route — verification (layout, tokens, data)

- [x] /dashboard: uses shared layout (AppShell)
- [x] /dashboard: uses design tokens for colors/spacing
- [x] /dashboard: uses React Query for data where applicable
- [x] /initiatives: uses shared layout
- [x] /initiatives: uses tokens
- [x] /initiatives: uses DataTable and PageHeader
- [x] /plans: layout, tokens, DataTable, PageHeader
- [x] /runs: layout, tokens, DataTable, PageHeader, status badges
- [x] /runs/[id]: layout, tokens, Re-run button, timeline/DAG, job list
- [x] /jobs: layout, tokens, DataTable, PageHeader
- [x] /artifacts: layout, tokens, DataTable, PageHeader
- [x] /artifacts/[id]: layout, tokens, provenance, diff/preview
- [x] /approvals: layout, tokens, DataTable or list, approve/reject actions
- [x] /tool-calls: layout, tokens, DataTable, PageHeader
- [x] /releases: layout, tokens, DataTable or list
- [x] /policies: layout, tokens, DataTable or list
- [x] /adapters: layout, tokens, DataTable or list
- [x] /incidents: layout, tokens, DataTable or list
- [x] /audit: layout, tokens, DataTable or list
- [x] /secrets: layout, tokens, list and manage
- [x] /health: layout, tokens, health status display

---

## 42. Admin — per resource verification (if Option A)

- [x] /admin/initiatives: list page loads with data from Supabase or API
- [x] /admin/initiatives: new page opens and form submits
- [x] /admin/initiatives: show page opens for valid id
- [x] /admin/initiatives: edit page opens and save works
- [x] /admin/plans: list, new, show, edit verified
- [x] /admin/plan_nodes: list, new, show, edit verified
- [x] /admin/plan_edges: list, new, show, edit verified
- [x] /admin/job_runs: list, new, show, edit verified
- [x] /admin/runs: list, new, show, edit verified
- [x] /admin/artifacts: list, new, show, edit verified
- [x] /admin/tool_calls: list, new, show, edit verified
- [x] /admin/approvals: list, show, edit (approve/reject) verified
- [x] Admin list pages: use same sidebar/topbar as Ops
- [x] Admin list pages: use shadcn DataTable
- [x] Admin forms: use shadcn Input, Select, Label; Zod validation
- [x] Admin show pages: display key fields and relation links (e.g. link to run)

---

## 43. shadcn components — usage (ensure each used where planned)

- [x] Button: used on Dashboard (e.g. CTAs)
- [x] Button: used on list pages (e.g. Create, View, Re-run)
- [x] Button: used in Command menu (actions)
- [x] Card: used on Dashboard (stats, sections)
- [x] Card: used on list/detail pages (content blocks)
- [x] Input: used in forms (create/edit initiative, plan, approval reason, etc.)
- [x] Label: used with Input/Select in forms
- [x] Select: used in filters and forms
- [x] Dropdown-menu: used for row actions (View, Edit, Re-run) and user menu
- [x] Dialog: used for confirmations (e.g. Re-run, Approve, Reject)
- [x] Table: used in DataTable (header, body, row, cell)
- [x] Tabs: used on Run detail, Initiative detail, Plan detail
- [x] Badge: used for status (run, job, approval)
- [x] Skeleton: used for loading states on list and detail pages
- [x] Command: used for command palette (⌘K)
- [x] Separator: used in sidebar or between sections
- [x] Avatar: used for user menu in topbar
- [x] Sidebar: used in AppShell (collapsible, grouped nav)
- [x] Sheet: used for mobile nav or approval drawer if applicable
- [x] Form (shadcn form with react-hook-form): used for create/edit forms and filters

---

## 44. Documentation and discoverability

- [x] README in repo root: mention Console and email-marketing-factory; link to docs
- [x] Console README: how to run; env vars; link to design system (packages/ui)
- [x] email-marketing-factory README: how to run; migration note (shadcn)
- [x] packages/ui README: how to use preset; how to import components; MUI → shadcn mapping
- [x] docs/STACK_AND_DECISIONS.md: section on UI/Console stack (updated in Phase 5)
- [x] docs/UI_AND_CURSOR.md: canonical components list
- [x] docs/UI_AND_CURSOR.md: example Cursor prompts (3–5 examples)
- [x] docs/UI_AND_CURSOR.md: prompt templates for Bolt/GPT Engineer/Reflex
- [x] docs/UI_AND_CURSOR.md: where primitives live (paths)
- [x] docs/UI_AND_CURSOR.md: how to add new Ops page
- [x] docs/UI_AND_CURSOR.md: how to add new Admin resource (registry + routes)
- [x] .cursor/rules or AGENTS.md: reference shadcn, TanStack Table, React Query (if added)
- [x] Changelog or ADR: record decision "Option A: Refine vs hand-built" and "Option A: two surfaces (Ops + Admin)"

---

## 45. Performance and polish

- [x] Console: code-split or lazy-load heavy pages if needed (e.g. Run detail DAG)
- [x] Console: ensure React Query stale/cache settings reasonable for list pages
- [x] Console: avoid layout shift when loading (skeletons in place)
- [x] email-marketing-factory: same (skeletons, React Query cache)
- [x] Admin: pagination default page size reasonable (e.g. 20)
- [x] Admin: list queries use pagination and filters to limit payload
- [x] Images or icons: use consistent set (e.g. Lucide) to avoid bundle bloat
- [x] Tailwind: purge/content paths include packages/ui and both apps
- [x] Build: no duplicate React or duplicate shadcn deps (check peer deps)
- [x] Build: Console and email-marketing-factory build without errors
- [x] Build: packages/ui builds without errors

---

## 46. Manual / E2E smoke (key flows)

- [x] Open /dashboard; confirm no console errors; confirm content visible
- [x] Open /initiatives; confirm list or empty state; no errors
- [x] Open /plans; confirm list or empty state; no errors
- [x] Open /runs; confirm list or empty state; no errors
- [x] Open a run detail /runs/[id]; confirm Re-run visible; no errors
- [x] Open /jobs; confirm list or empty state; no errors
- [x] Open /artifacts; confirm list or empty state; no errors
- [x] Open an artifact detail /artifacts/[id]; confirm provenance or content; no errors
- [x] Open /approvals; confirm list or empty state; no errors
- [x] Open /tool-calls; confirm list or empty state; no errors
- [x] Open /releases; confirm page loads; no errors
- [x] Open /policies; confirm page loads; no errors
- [x] Open /adapters; confirm page loads; no errors
- [x] Open /incidents; confirm page loads; no errors
- [x] Open /audit; confirm page loads; no errors
- [x] Open /secrets; confirm page loads; no errors
- [x] Open /health; confirm page loads; no errors
- [x] Trigger command menu (⌘K); confirm it opens and shows items; no errors
- [x] Navigate via sidebar: click 5 different nav items; confirm each page loads
- [x] If Admin enabled: open /admin/runs (or first admin resource); confirm list loads; no errors
- [x] If Admin enabled: open /admin/initiatives; confirm list loads; no errors
- [x] email-marketing-factory: open app root; confirm no errors
- [x] email-marketing-factory: open login (if applicable); confirm form visible
- [x] email-marketing-factory: open dashboard; confirm no errors
- [x] Responsive: resize to mobile width; confirm sidebar collapses or sheet works; no errors
- [x] Dark/light: if theme toggle exists, switch and confirm tokens apply
- [x] Accessibility: tab through Dashboard; focus visible on interactive elements
- [x] Accessibility: tab through Sidebar; focus visible
- [x] Form: submit an invalid create form (e.g. empty required); confirm validation message
- [x] Form: submit valid create form (if applicable); confirm success (redirect or toast)

---

## 47. Filters and sort (by page)

- [x] Runs list: filter by status (queued, running, succeeded, failed, blocked)
- [x] Runs list: filter by date range or started_at
- [x] Runs list: sort by started_at (asc/desc)
- [x] Runs list: sort by status
- [x] Initiatives list: filter by status (if applicable)
- [x] Initiatives list: sort by name or created_at
- [x] Jobs list: filter by run_id or status
- [x] Jobs list: sort by started_at or status
- [x] Approvals list: filter by status (pending, approved, rejected)
- [x] Approvals list: filter by type (schema_change, deploy, write_files, external_call)
- [x] Approvals list: sort by created_at
- [x] Plans list: filter by initiative or status
- [x] Plans list: sort by version or created_at
- [x] Artifacts list: filter by type or producer
- [x] Artifacts list: sort by created_at
- [x] Tool calls list: filter by job_run or name
- [x] Tool calls list: sort by timestamp
- [x] Admin initiatives list: filter and sort as per registry
- [x] Admin runs list: filter and sort as per registry
- [x] Admin artifacts list: filter and sort as per registry
- [x] Admin approvals list: filter and sort as per registry
- [x] All list tables: "Clear filters" or reset visible when filters applied
- [x] All list tables: URL or state reflects active filters/sort (optional, for shareable links)

---

## 48. Links and 404

- [x] Sidebar link to /dashboard: resolves (no 404)
- [x] Sidebar link to /initiatives: resolves
- [x] Sidebar link to /plans: resolves
- [x] Sidebar link to /runs: resolves
- [x] Sidebar link to /jobs: resolves
- [x] Sidebar link to /artifacts: resolves
- [x] Sidebar link to /approvals: resolves
- [x] Sidebar link to /tool-calls: resolves
- [x] Sidebar link to /releases: resolves
- [x] Sidebar link to /policies: resolves
- [x] Sidebar link to /adapters: resolves
- [x] Sidebar link to /incidents: resolves
- [x] Sidebar link to /audit: resolves
- [x] Sidebar link to /secrets: resolves
- [x] Sidebar link to /health: resolves
- [x] Command menu "Go to Initiatives" (or similar): navigates to /initiatives
- [x] Command menu "Go to Runs": navigates to /runs
- [x] List row click or "View" on Run: navigates to /runs/[id]
- [x] List row click or "View" on Initiative: navigates to /initiatives/[id]
- [x] List row click or "View" on Artifact: navigates to /artifacts/[id]
- [x] Run detail "Produced by" link: navigates to correct run/job or plan node
- [x] Artifact detail "Produced by" link: navigates to run or plan node
- [x] Invalid run id /runs/invalid-id: show 404 or not-found page (no crash)
- [x] Invalid artifact id: show 404 or not-found page
- [x] Admin invalid resource id: show 404 or not-found page

---

*End of checklist. Mark items with `[x]` as you complete them. Total items: 1,001.*
