# Traversable graph status — “Ask anything / do anything”

This doc tracks the **traversable platform graph** and **ask/do** surface relative to the vision: *graph describes what must exist, operators figure out how to produce it, runtime resolves the rest* and *5 graphs, ask it anything, deterministic AI pushing buttons, plug and play*.

## What works today (build now)

### Five graphs, all live

| Graph | Source | What it returns |
|-------|--------|------------------|
| **dependency** | Mapping layer (artifact_consumption, artifacts, runs) | Nodes/edges, presets: blast_radius, upstream_dependencies |
| **strategy** | Mapping layer (plans, plan_nodes, plan_edges, runs) | Nodes/edges, presets: blocked_tasks, active_runs |
| **catalog** | Mapping layer (operators, saved_flows, templates, brands) | Nodes/edges, presets: operator_inventory, flow_inventory |
| **topology** | Direct: runs + releases | Environments, releases, deploys_to edges (deployment map) |
| **governance** | Direct: policies, action_policies, approval_policies | Policy nodes (version, action, approval) |

- **GET /v1/graphs/:name** — build any projection (`dependency`, `topology`, `strategy`, `governance`, `catalog`).
- **GET /v1/graphs/summary** — one-call platform totals: `{ graphs: [{ graph, node_count, edge_count, node_counts_by_kind }, ...], total_nodes, total_edges }`. Use for the “5 graphs, X nodes, Y edges” banner.
- **GET /v1/graphs/validate** — validator-style health check: runs each projection build, returns `{ projections: [{ graph, ok, node_count, edge_count, error? }], ok }`. 207 if any projection fails.
- **POST /v1/graphs/query** — structured query with optional `graph`, `preset`, `query` (e.g. `blocked_only`, `running_only`). Responses include a human-readable `answer` (e.g. governance: “3 policies, 12 action policies, 2 approval policies”; topology: “2 environments, 5 releases”).

### Ask → execute

- **POST /v1/ask** — `raw_text` + optional `execute: true` (default on).
- Intent resolver maps phrases to **graph_query** or **action**.
- When resolution is **graph_query**, the handler runs the graph query and returns **answer** + **graph_result** (summary, nodes, edges) in the same response.

**Phrases that resolve to a graph query (and are executed immediately):**

| Say something like | Resolves to | Result |
|--------------------|-------------|--------|
| “What’s blocked?” / “blocked tasks” | strategy + preset blocked_tasks | Blocked/pending nodes |
| “dependency” / “blast radius” | dependency graph | Dependency projection |
| “topology” / “environments” / “deployment map” | topology graph | Environments, releases, deploys_to |
| “governance” / “policies” / “rules” | governance graph | Policy nodes |
| “catalog” / “operators” / “inventory” | catalog graph | Operators, flows |
| “strategy” / “active runs” | strategy graph | Strategy projection |

**Actions (returned as proposed; not auto-executed):** “rerun run”, “replay subgraph”, “deploy staging”, “failure cluster” → `resolved_endpoint` + `resolved_params`; caller or approval flow can execute.

### Operators and flows

- **POST /v1/operators/:id/execute** — run operator by id (body: `initiative_id`, optional `environment`). Creates plan + run.
- **Flow run** — run a saved flow by name; graph runtime resolves and executes.

So: **you can ask in natural language, get a graph answer back, and trigger operators by ID.** The “ask anything → get graph result” path is live; “do anything” is “call this endpoint with these params” (approval or caller executes).

## What’s next (later)

1. **Unified node count** — **GET /v1/graphs/summary** already returns `total_nodes` and `total_edges` across all five projections; use it for the “5 graphs, 3,188 nodes, 3,289 edges” banner (numbers come from your data). A single canonical graph registry would dedupe and normalize identity; for now the sum of projection sizes is the platform total.
2. **Canonical graph registry** — One `graph_nodes` / `graph_edges` (or `platform_graph_*`) identity layer so all five projections are views over one substrate (see `.cursor/plans/ai_factory_os_traversable_graph_plan.md`).
3. **Intent compiler** — NL → typed intent (BuildSpec, ExecutionPlan) so “launch landing page + email + SEO” becomes a machine-resolvable plan; LLM emits intent, runtime executes (no raw execution from LLM).
4. **Saved flows as first-class “forever” operators** — Save “this graph traversal + these steps” as a named operator; “ask to do X” resolves to “run saved flow X.”
5. **Approval and action policies** — Wire `requires_approval` and action_policies so high-impact actions go through approval; auto-execute only for low-risk graph queries and allowed actions.

## Summary

- **Yes, you can do this.** The repo already has graph + operators + runtime; topology and governance are now real projections; **POST /v1/ask** runs graph queries and returns the result.
- **Still pending for later:** one canonical graph identity layer, NL → typed intent compiler, saved “forever” flows as first-class, and explicit approval/action policy wiring. The hardest part—deterministic graph and operators—is in place; the rest is product surface and policy.

See also: `.cursor/plans/ai_factory_os_traversable_graph_plan.md`, `control-plane/src/graphs/`, `docs/GRAPH_OS_FOUNDATION.md`.
