# What You Can Do With ProfessorX (Right Now)

ProfessorX is the **internal operator console** for the AI Factory: the control surface to run pipelines, manage brands, configure routing and budgets, and monitor executions. Tagline: *"When an individual acquires great power, the use or misuse of that power is everything."*

With the current stack (Console on Vercel, Control Plane on Render, Postgres/Supabase), here’s what you can **actually do** once you’re in the app.

---

## 1. Command (Dashboard & planning)

| Action | Where | What it does |
|--------|--------|----------------|
| **Overview** | `/dashboard` | High-level stats: initiatives, runs, approvals; links to key areas. |
| **Scheduler health** | `/health` | Control Plane and DB health (for ops). |
| **Planner** | `/planner` | List pipeline runs (job runs) with plan context; drill into runs. |
| **Cost dashboard** | `/cost-dashboard` | Cost/usage views (backed by usage APIs). |

---

## 2. Orchestration (Pipelines & runs)

| Action | Where | What it does |
|--------|--------|----------------|
| **Initiatives** | `/initiatives` | List/create/edit initiatives (intent); link to plans and runs. |
| **Plans** | `/plans` | List plans; view plan detail (nodes/edges). |
| **Pipeline runs** | `/runs` | List runs; view run detail, artifacts, status; **cancel**, **rerun**, **rollback**. |
| **Jobs** | `/jobs` | List job runs; filter by run/node; **retry** failed jobs. |
| **Tool calls** | `/tool-calls` | Audit tool invocations (idempotency, capability, outcome). |
| **Artifacts** | `/artifacts` | List and open artifacts (logs, docs, build outputs); **lineage** (who produced, who consumed) via API or Admin. |
| **Approvals** | `/approvals` | See pending approvals; **approve/reject** (for approval nodes). |
| **AI calls** | `/ai-calls` | List LLM call usage (for cost/debug). |

---

## 2b. Graph and resolution (Artifact graph + Capability graph)

| Action | Where / API | What it does |
|--------|-------------|--------------|
| **Lineage** | `GET /v1/graph/lineage/:artifactId` or Admin → Artifacts → open artifact | See **declared producer** (plan node that produced this artifact) and **observed consumers** (job runs that consumed it). Rich fields: plan_node_id, run_id, job_run_id, node_key, artifact_type, role, created_at. |
| **Capability resolve** | `GET /v1/capability/resolve?produces=copy` or `POST /v1/capability/resolve` | Ask *"which operator can produce artifact type X?"* Returns operator keys (e.g. `copy_generate`) in deterministic order. Optional `consumes=a,b` = required input types (conjunctive). |
| **Run by artifact type** | `POST /v1/runs/by-artifact-type` body `{ produces: "copy", initiative_id?, environment? }` | Resolve operator → create single-node plan + run → runner executes and produces the artifact. Full loop: need → resolve → run → artifact. |

**Two graph layers:** (1) **Artifact graph** — artifacts, plan_nodes, job_runs; edges from `artifacts.producer_plan_node_id` and `artifact_consumption` table. Used for lineage and traceability. (2) **Capability graph** — capabilities, operators, artifact_types; edges who produces/consumes what. Used only for resolution ("what can produce X?"), not planning. See **docs/CAPABILITY_GRAPH.md** and **docs/GRAPH_ENGINE_IMPLEMENTATION_STATUS.md**.

---

## 3. Data & config (Releases, policies, routing, MCP)

| Action | Where | What it does |
|--------|--------|----------------|
| **Releases** | `/releases` | List releases; **canary** and **rollout** actions. |
| **Policies** | `/policies` | List policy versions (audit). |
| **Routing policies** | `/routing-policies` | List/create model routing by job type (optimizer). |
| **LLM budgets** | `/llm-budgets` | List/create token/spend budgets by scope. |
| **Adapters** | `/adapters` | List adapters and capabilities. |
| **MCP servers** | `/mcp-servers` | List MCP server configs; link to Admin for full CRUD. |

---

## 4. Studio (Brand & design)

| Action | Where | What it does |
|--------|--------|----------------|
| **Brands** | `/brands` | List brands; **new brand**; **edit** (Basic Info + design tokens tree). |
| **Document templates** | `/document-templates` | List/create/edit document templates (decks, reports); manage component sequence. |
| **Brand themes** | `/brand-themes` | Stub; brand themes referenced by brands. |

---

## 5. System (Monitoring, audit, admin)

| Action | Where | What it does |
|--------|--------|----------------|
| **Webhook outbox** | `/webhook-outbox` | List webhook delivery rows; status, retries; PATCH for mark-sent/retry. |
| **Agent memory** | `/agent-memory` | List agent memory entries (initiative/run/scope); link to Admin for CRUD. |
| **Secrets** | `/secrets` | Secret refs (no values); audit. |
| **Email marketing** | `/email-marketing` | Email marketing factory UI. |
| **Self-heal** | `/self-heal` | Platform self-heal is automatic (fix-me label → initiative → fix plan); one-time setup and local CLI. |
| **Admin** | `/admin` | Full CRUD for initiatives, plans, runs, job_runs, artifacts, approvals, plan_nodes, plan_edges, tool_calls, **agent_memory**, **mcp_servers**, etc. |
| **Analytics / Incidents / Audit** | `/analytics`, `/incidents`, `/audit` | Analytics, incident clustering (error_signature), audit logs. |

---

## 6. Builder (Design system)

| Action | Where | What it does |
|--------|--------|----------------|
| **Token registry** | `/tokens` | Browse **platform default design tokens** (read-only); brands override these. |
| **Component registry** | `/components` | List **platform document component types** (kpi_card, table_block, chart_block, etc.) used in templates. |

---

## Prerequisites for “no relation” errors to be gone

Migrations run **automatically** on every Control Plane start (same DB as the API). If you still see errors like `relation "agent_memory" does not exist`, redeploy the Control Plane so it runs migrate on start; see **docs/runbooks/console-db-relation-does-not-exist.md**.

---

## Summary

- **Orchestration:** Create initiatives → compile plans → start runs → watch job runs, tool calls, artifacts → approve when needed → cancel/rerun/rollback. **Run by need:** `POST /v1/runs/by-artifact-type` to resolve an operator and run a single-node pipeline (e.g. produce `copy`).
- **Graph & lineage:** Artifact graph (who produced/consumed each artifact) via `GET /v1/graph/lineage/:id`. Capability graph: resolve "which operator produces X?" via `GET /v1/capability/resolve?produces=...`.
- **Config:** Set routing policies and LLM budgets; manage MCP servers and adapters; manage releases and canary.
- **Brand & design:** Manage brands (with design tokens) and document templates; reference token registry and component registry.
- **Ops:** Webhook outbox, agent memory, secrets audit, self-heal, and full Admin CRUD for all core resources. **Artifact hygiene:** All artifact content that reaches LLM prompts is capped via `loadArtifactContentForLlm` (see CONTRIBUTING.md).

All of this is **ProfessorX**: the single operator console for the AI Factory with the current build.
