# Canonical graph registry (future)

**Status:** Deferred. The five graph **projections** (dependency, topology, strategy, governance, catalog) are built from existing tables and work today. A single **canonical** identity layer is a later step.

## Current state

- **Projections:** Each of the five graphs is built by its projection module (e.g. `dependency-graph.ts`, `catalog-graph.ts`) from backing tables (artifact_consumption, plans, runs, policies, saved_flows, etc.).
- **No shared identity:** Nodes and edges are produced per projection; there is no single `graph_nodes` / `graph_edges` (or `platform_graph_*`) table that all five are views over.

## Goal (when implemented)

- **One substrate:** `platform_graph_nodes` and `platform_graph_edges` (or equivalent) as the single source of identity.
- **Projections as views:** The five projections become queries or views over this substrate so that:
  - Node identity is deduped and stable across projections.
  - Unified queries (e.g. “all nodes of type X”) and “one navigable graph” are straightforward.

## References

- `.cursor/plans/ai_factory_os_traversable_graph_plan.md` — naming (Option A: rename execution to graph_run_*; use graph_nodes/graph_edges for canonical), migration order, Ship 1–5.
- `docs/TRAVERSABLE_GRAPH_STATUS.md` — what works today (GET /v1/graphs/summary, POST /v1/ask, etc.).
- `docs/HOW_FAR_FROM_TRAVERSABLE_VISION.md` — gap list and what was implemented.

## Optional next steps

1. Add migrations for `platform_graph_nodes` / `platform_graph_edges` (or adopt names from the plan).
2. Populate them from existing backing tables and keep in sync (e.g. on run/plan/artifact writes).
3. Change projection builders to read from the canonical tables instead of querying backing tables directly.

Until then, the platform remains “traversable” via the five projections and Ask; the canonical registry is an improvement for dedupe and unified querying, not a prerequisite for “ask anything / do anything.”
