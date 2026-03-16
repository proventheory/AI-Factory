# Graph OS Foundation (Phase 0)

This document captures the foundation decisions for the AI Factory OS / traversable graph implementation.

## 1. Canonical vs execution graph naming (Option B)

**Decision: Option B.** Existing migration `20250321000000_phase6_durable_graph_runtime.sql` already defines `graph_runs`, `graph_nodes` (execution steps with `graph_run_id`), and `graph_edges` (execution). We do **not** rename those. The **canonical** (platform-wide identity) layer uses:

- **platform_graph_nodes** — canonical node registry (identity, state, backing refs)
- **platform_graph_edges** — canonical edge registry

So: **canonical** = `platform_graph_nodes`, `platform_graph_edges`; **execution** = existing `graph_nodes`, `graph_edges` (per `graph_run`).

## 2. Canonical ID strategy

- **One initiative** = one canonical node (when registered in platform graph).
- **One artifact** = one canonical node (when registered).
- **One plan / plan_node** = one canonical node or one transient execution node (execution uses existing `graph_nodes` in Phase 6).
- **One service / deploy target** = one canonical node when registered.
- **Stable synthetic ID for backed nodes:** `g:${nodeKind}:${backingTable}:${backingId}` (e.g. `g:plan:plans:123`).
- **Synthetic nodes:** `s:${projection}:${nodeKind}:${syntheticKey}` (e.g. `s:topology:environment:production`).

## 3. Node state model

Core states (used in `platform_graph_nodes.state` and execution):

- **declared** — Exists in graph, not yet ready to run.
- **ready** — Dependencies satisfied, can be executed.
- **blocked** — Waiting on dependencies.
- **running** — Execution in progress.
- **produced** — Output produced.
- **validated** — Validation passed.
- **published** — Live/published (terminal for “live”).
- **failed** — Execution or validation failed (terminal failure).
- **stale** — Out of date, can be refreshed.
- **superseded** — Replaced by another node (terminal).
- **archived** — Retired (terminal).

Which node kinds can occupy which states is defined in `graph_node_states` (optional refinement). Default: any non-terminal state can transition per `graph_state_transitions`.

## 4. Action policy (before /v1/ask is broad)

- **Auto-execute:** graph query, draft generation, preview deploy, validation run, internal brief generation, metadata repair.
- **Require approval:** production deploy, domain cutover, live email send, schema migration apply, pricing changes, compliance-sensitive medical content, destructive schema migrations.
- Stored in **action_policies** table (Phase 6); `requires_approval` routes to existing approval machinery.

## 5. References

- Plan: `.cursor/plans/ai_factory_os_traversable_graph_plan.md`
- Migrations: `supabase/migrations/20250401*_graph_os_*.sql`
  - `20250401000000_graph_os_kinds.sql` — graph_node_kinds, graph_edge_kinds + seeds
  - `20250401000001_graph_os_registry.sql` — platform_graph_nodes, platform_graph_edges
  - `20250401000002_graph_os_projection_mappings.sql` — graph_projections, node/edge mappings, query_presets + seeds
  - `20250401000003_graph_os_projection_views.sql` — v_graph_projection_*_expanded views
  - `20250401000004_graph_os_operators_saved_flows.sql` — operator_definitions, contracts, saved_flows, saved_flow_versions, saved_flow_bindings
  - `20250401000005_graph_os_intent_build_specs.sql` — intent_documents, intent_resolutions, build_specs, build_spec_nodes
  - `20250401000006_graph_os_reconciliation_action_policies.sql` — reconciliation_tasks (idempotency_key), reconciliation_events, action_policies, approval_policies
  - `20250401000007_graph_os_seed_action_policies.sql` — seed action_policies (auto-execute vs approval-required)
  - `20250401000008_graph_os_approval_requests_v2.sql` — approval_requests_v2 (graph_node_id, operator_definition_id, action_key)
