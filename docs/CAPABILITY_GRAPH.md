# Capability Graph and Resolver

The **capability graph** is a resolution layer that answers: *"Which operator can produce artifact type X?"* (and optionally: *"…and consume artifact types A, B?"*). It does **not** perform planning (order, gates, retries); the planner decides what to do and in what sequence; the resolver only returns candidate operators.

## Design boundary

- **Capability graph / resolver:** Answers "what can produce X?" with deterministic ranking.
- **Planner:** Decides "should we do X now, in what sequence, with what inputs?"

## Schema (Phase 3)

- **Nodes:** `capabilities`, `artifact_types`, `operators` (operator `key` = `job_type`).
- **Edges:** `operator_implements_capability`, `operator_consumes_artifact_type`, `operator_produces_artifact_type`.
- **Operators** have an optional `priority` (integer). Lower value = higher priority; `NULL` = lowest.

## Resolver API

- **GET** `/v1/capability/resolve?produces=<artifact_type>`  
  Optional: `&consumes=a,b` (comma-separated required input artifact types).
- **POST** `/v1/capability/resolve`  
  Body: `{ "produces": "<artifact_type>", "consumes": ["a", "b"] }` (consumes optional).

Response: `{ "operators": ["job_type_1", "job_type_2", ...] }` in **deterministic order**.

## Ranking policy (deterministic)

1. **Produces:** Only operators that produce the requested artifact type.
2. **Consumes (conjunctive):** If `consumes` is provided, only operators that consume **all** of those artifact types.
3. **Priority:** Sort by `operators.priority` ascending (lower integer = higher priority; `NULL` last).
4. **Tie-break:** Lexical order by `operators.key`.

## Canonical example

- Request: `produces=copy`, `consumes=prd_doc,brand_profile`  
  Interpretation: operator must produce `copy` and must consume **both** `prd_doc` and `brand_profile`.  
- Resolver returns operators that satisfy both, ordered by priority then key.

## Loop: plan → capability → resolver → execution → artifact

**POST /v1/runs/by-artifact-type** — Body: `{ produces, consumes?: [], initiative_id, environment? }`. Resolves operator from capability graph (first ranked operator that produces the type and optionally consumes all listed types), creates or reuses a single-node plan for that initiative, then creates a run. Runner executes the node and produces the artifact. Full loop: need → resolve → plan + run → artifact.

- **Initiative required:** So the plan has an owner; create an initiative first (e.g. "Produce copy for campaign X").
- Resolver-based automatic `job_type` assignment in the plan compiler (e.g. from draft "produces" only) can be added later and should be **feature-flagged** until proven safe.

## Files

- Migration: `supabase/migrations/20250331000011_capability_graph.sql`
- Resolver: `control-plane/src/capability-resolver.ts`
- API: `control-plane/src/api.ts` (GET/POST `/v1/capability/resolve`)

## Phase 4 (future): Code-agent-style tool use

When a node type needs to use many MCP (or other) tools, the model will choose tools via **search + generated code**; only the final result or summary goes into context. Planned: tool directory (minimal stubs), keyword or vector search, sandbox with `callTool(server, tool, args)`, and a job type such as `code_agent` or `runbook_agent`. This addresses **tool-definition bloat** (not feeding every MCP tool schema into the agent). Not in the current deploy; document only.

## Phase 6: Durable Graph Runtime (implemented)

**Tables (migration `20250321000000_phase6_durable_graph_runtime.sql`):** `graph_runs`, `graph_nodes`, `graph_edges`, `node_executions`, `graph_run_events`, `node_input_bindings`, `node_output_bindings`, `node_leases`, `graph_repair_attempts`, `evaluation_results`, `graph_run_checkpoints`. Runner runs this migration on startup with the rest of `run-migrate.mjs`.

**Control Plane APIs:**
- **GET /v1/graph_runs** — list runs (query: `status=`, `limit=`, `offset=`).
- **POST /v1/graph_runs** — create run (body: `initiative_id?`, `policy_json?`, `budget_json?`).
- **GET /v1/graph_runs/:id** — run status, nodes, blocking_reason.
- **POST /v1/graph_runs/:id/signal** — `retry_node`, `approve_artifact`, `pause_run`, `resume_run`, `replace_input`.

**Runner:** `runners/src/graph-run-executor.ts` — stub that finds running graph runs and ready nodes. Enable with `ENABLE_GRAPH_RUN_EXECUTOR=1`; logs "would lease and execute" per ready node. Full lease → job_run → execute wiring is the next step.
