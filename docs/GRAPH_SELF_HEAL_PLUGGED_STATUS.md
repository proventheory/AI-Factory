# Graph & Self-heal: API and self-healing plug-in status

This doc shows how each **GRAPH & SELF-HEAL** Console feature is wired to the API, to self-healing (Render, Vercel, Supabase, Console), and where there are gaps.

---

## Summary

| Feature | Console page | API | API status | Data / self-heal source |
|--------|---------------|-----|------------|--------------------------|
| Graph Explorer | `/graph/explorer` | GET /v1/graph/topology/:planId, GET /v1/graph/frontier/:runId | **Real** (plan_nodes, plan_edges, node_progress) | DB |
| Decision loop | `/graph/decision-loop` | GET /v1/decision_loop/observe, POST /v1/decision_loop/tick | **Stub** (empty anomalies/baselines + message; KPI storage not wired) | — |
| Deploy events | `/graph/deploys` | GET /v1/deploy_events, GET /v1/deploy_events/:id/repair_plan | **Real** (DB) | POST /v1/deploy_events; **POST /v1/webhooks/vercel**; **POST /v1/deploy_events/sync** (Render), **POST /v1/deploy_events/sync_github** (GitHub Actions) |
| Import graph | `/graph/import-graph` | GET/POST /v1/import_graph | **Real** (DB) | Runner or API |
| Schema & contracts | `/graph/schema-contracts` | GET /v1/schema_contracts | **Real** (artifact_types, operators from capability graph) | DB |
| Change Impact | `/graph/change-impact` | GET/POST /v1/change_events, GET /v1/change_events/:id/impacts, POST :id/impact, GET :id/backfill_plan | **Real** (change_events, graph_impacts); **POST :id/impact stub** | DB |
| Repair Preview | `/graph/repair-preview` | GET /v1/graph/repair_plan/:runId/:nodeId | **Real** (incidentLookup from job_runs + incident_memory) | DB |
| Migration Guard | `/graph/migration-guard` | POST /v1/migration_guard | **Real** (parses SQL for CREATE/ALTER/DROP tables, returns tables_touched + risks) | Request body |
| Graph health | `/graph/diagnostics` | GET /v1/graph/audit/:runId, GET /v1/graph/missing_capabilities/:planId | **Real** (run + job_runs summary; plan job_types vs operators) | DB |
| Memory (incidents) | `/graph/memory` | GET/POST /v1/incident_memory | **Real** (DB) | Runners / repair flow; used by decision loop & repair |
| Checkpoints | `/graph/checkpoints` | GET/POST /v1/checkpoints, GET /v1/checkpoints/:id | **Real** (DB) | API |
| Checkpoint diff | `/graph/checkpoint-diff` | GET /v1/checkpoints/:id/diff | **Partial** (returns checkpoint + message; snapshot_diff requires postMigrationAudit) | DB |
| Lineage viewer | `/graph/lineage` | GET /v1/graph/lineage/:artifactId | **Real** (artifacts + artifact_consumption) | Producer from artifact; consumers from artifact_consumption |
| Failure clusters | `/graph/failure-clusters` | GET /v1/failure_clusters | **Real** (DB, from incident_memory) | incident_memory |

---

## How self-healing and providers connect

- **Render:** Deploy-failure self-heal runs every 5 min (`deploy-failure-self-heal.ts`). When `ENABLE_SELF_HEAL=true` and `RENDER_API_KEY` (+ optional `RENDER_STAGING_SERVICE_IDS`), it checks api/gateway/runner; on failed/canceled deploy it triggers redeploy (up to 2× per commit) or creates an initiative. **Does not** write to `deploy_events`; Console “Deploy events” is populated by **POST /v1/deploy_events** or (when implemented) **POST /v1/webhooks/vercel**.
- **Vercel:** **POST /v1/webhooks/vercel** is implemented: Vercel deployment events (deployment.ready, deployment.error, etc.) are normalized and written to `deploy_events`. The 5‑min scan (`vercel-redeploy-self-heal.ts`) still runs for redeploy-on-failure; projects are registered via **POST /v1/vercel/register** (webhook URL `.../v1/webhooks/vercel`).
- **Supabase:** Control Plane and Console use the same Postgres (Supabase or other). Migrations run on every Control Plane start; schema for graph/self-heal (`deploy_events`, `incident_memory`, `change_events`, `graph_checkpoints`, `import_graph`, `artifact_consumption`, etc.) is applied by `scripts/run-migrate.mjs`.
- **Console:** All Graph & Self-heal pages call the Control Plane API above. When APIs are stubs, pages load but show empty or placeholder data. Self-heal **configuration** (one-time setup) is documented on **Self-heal** and **Operator guide**; **fix-me** → GitHub webhook → initiative is fully wired.

---

## Gaps (what is not fully plugged in)

1. **POST /v1/webhooks/vercel** — Implemented. Vercel deployment webhooks are normalized to `deploy_events` via `createDeployEventFromPayload`.
2. **GET /v1/graph/lineage/:artifactId** — Implemented. Returns declared producer (from `artifacts.producer_plan_node_id` + plan_nodes) and observed consumers (from `artifact_consumption`).
3. **POST /v1/deploy_events/sync** and **POST /v1/deploy_events/sync_github** — **Implemented.** Sync from Render (RENDER_API_KEY + RENDER_STAGING_SERVICE_IDS or RENDER_WORKER_SERVICE_ID) and from GitHub Actions (GITHUB_TOKEN + GITHUB_REPOS) into `deploy_events` by `external_deploy_id` (no duplicates). Optional for self-heal (5‑min scan already handles remediation).
4. **Decision loop** — GET observe and POST tick return empty anomalies/baselines with a `message` that KPI storage is not configured. Add `kpi_baselines` / `kpi_observations` tables to wire.
5. **Repair Preview, Migration Guard, Graph health** — Implemented (repair_plan uses incidentLookup; migration_guard parses SQL; audit + missing_capabilities use runs/job_runs/operators).
6. **Checkpoint diff** — Returns checkpoint + `message`; `snapshot_diff` remains null until post-migration audit / artifact content is used.
7. **Schema & contracts** — **GET /v1/schema_contracts** implemented; returns `artifact_types` and `operators` from capability graph.

---

## What works end-to-end

- **Deploy events (list + repair plan):** Real. Populate by calling **POST /v1/deploy_events** (e.g. from a CI script or future webhook). Console shows list and repair plan.
- **Memory (incidents):** Real. Runners or repair flow can POST resolutions; Failure clusters and repair logic use them.
- **Change Impact:** change_events and impacts in DB; POST :id/impact (compute impacts) is stub.
- **Import graph, Checkpoints:** Real CRUD; Console and API aligned.
- **Self-heal (platform):** GitHub **fix-me** → **POST /v1/webhooks/github** → initiative + plan; Render/Vercel **deploy-failure scan** every 5 min; **migrations** on Control Plane start. Console and Operator guide describe one-time setup; no manual steps per incident.

---

## Terraform / infra

“Terra” in your question may mean Terraform. Control Plane env (e.g. `DATABASE_URL`, `ENABLE_SELF_HEAL`, `RENDER_API_KEY`, `VERCEL_TOKEN`) is typically set in Render Dashboard or via Terraform; the same env is used by migrations and self-heal. No separate “Terraform API” in the graph/self-heal list; infra is out of scope for this status.

---

See also: [GRAPH_ENGINE_AND_SELF_HEAL.md](GRAPH_ENGINE_AND_SELF_HEAL.md), [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md), [WEBHOOKS.md](WEBHOOKS.md).
