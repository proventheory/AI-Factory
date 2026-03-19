# Control Plane api.ts refactor plan

**Problem:** `control-plane/src/api.ts` is ~5,600 lines and registers ~100 routes in a single file. That leads to:

- Business logic embedded in route handlers
- Weak module boundaries and harder testing
- Harder onboarding and safe refactoring
- One-file bottleneck for reliability

**Goal:** Split by domain into routers and handlers, keeping `api.ts` as a thin composition layer.

---

## Principles

1. **Extract by domain** — One router (or small handler module) per bounded context; route handlers delegate to service/use-case functions.
2. **Keep api.ts thin** — Mount routers, apply global middleware (CORS, rate limit, security headers), and centralize error handling where it makes sense.
3. **Testability** — Handlers and services should be unit-testable without starting Express; shared DB/pool injected or accessed via a single `db` module.
4. **No big-bang** — Migrate one domain at a time; each PR should leave the system deployable and tests green.

---

## Proposed module layout

| Domain | Routes (prefix or pattern) | Suggested module | Notes |
|--------|----------------------------|------------------|--------|
| **Health** | `/health`, `/health/db`, `/health/migrations`, `/health/schema` | `routes/health.ts` | Tiny; good first extraction. |
| **Dashboard / system state** | `/v1/dashboard`, `/v1/dashboard/drift`, `/v1/system_state`, `/v1/search` | `routes/dashboard.ts` | Uses pool, computeDrift, release_routes. |
| **Initiatives** | `/v1/initiatives`, `/v1/initiatives/:id`, PATCH, POST, plan, Google OAuth sub-routes | `routes/initiatives.ts` | Already has seo-google-oauth; keep OAuth in one place. |
| **Email designs** | `/v1/email_designs`, `/v1/email_designs/:id`, sitemap/products, products/from_url | `routes/email-designs.ts` | Plus sitemap-products and products-from-url helpers. |
| **SEO** | `/v1/seo/*` (GSC, GA4, Google auth/callback, credentials) | `routes/seo.ts` | Depends on seo-google-oauth. |
| **Plans** | `/v1/plans`, `/v1/plans/:id`, POST plan/start | `routes/plans.ts` | |
| **Runs** | `/v1/runs`, `/v1/runs/:id`, artifacts, status, log_entries, ingest_logs, image_assignment, cancel, rerun, by-artifact-type | `routes/runs.ts` | Largest surface; consider sub-splits (runs vs run-artifacts vs run-actions). |
| **Releases / canary** | `/v1/releases`, `/v1/releases/:id`, rollout, canary, rollback | `routes/releases.ts` | Uses release-manager, upgrade-gates. |
| **Approvals / job failures** | `/v1/approvals/*`, `/v1/job_failures`, `/v1/job_runs`, retry | `routes/approvals.ts` or `routes/jobs.ts` | |
| **Artifacts** | `/v1/artifacts`, `/v1/artifacts/:id`, content, analyze, knowledge, referenced_by | `routes/artifacts.ts` | |
| **Observability** | `/v1/llm_calls`, `/v1/usage`, `/v1/tool_calls`, `/v1/audit` | `routes/observability.ts` | |
| **Policies / config** | `/v1/policies`, `/v1/adapters`, `/v1/capability_grants`, `/v1/secret_refs` | `routes/policies.ts` | |
| **Incidents / memory** | `/v1/incidents`, `/v1/incident_memory`, `/v1/memory/*`, `/v1/decision_loop/*` | `routes/incidents.ts` | incident-memory, decision-loop. |
| **Deploy / self-heal** | `/v1/deploy_events/*`, `/v1/vercel/register` | `routes/deploy-events.ts` | deploy-events, vercel-redeploy-self-heal. |
| **Checkpoints / known good** | `/v1/checkpoints`, `/v1/known_good`, `/v1/failure_clusters` | `routes/checkpoints.ts` | |
| **Change events / import** | `/v1/change_events/*`, `/v1/import_graph` | `routes/change-events.ts` | |
| **Schema / contracts** | `/v1/schema_drift`, `/v1/contract_breakage_scan`, `/v1/schema_contracts` | `routes/schema.ts` | |

**Already extracted:** `registerGraphRoutes(app)`, `evolutionRouter` at `/v1/evolution`. Use the same pattern: `const router = express.Router(); router.get(...); app.use("/v1/...", router);`.

---

## Extraction pattern

1. **Create `control-plane/src/routes/<domain>.ts`**
   - Import `express`, `pool` (or `getPool()`), and any existing services (e.g. `computeDrift` from release-manager).
   - Define `router = express.Router()` and attach handlers.
   - Export `router` or `function registerXxxRoutes(app: express.Application) { app.use("/v1/...", router); }`.

2. **Move handler logic**
   - Copy the route handler from api.ts into the new file. Keep shared helpers (e.g. `normalizeRiskLevel`, `getRole`, `handleDbMissingTable`) in a shared `api-common.ts` or pass them in so routers stay thin.

3. **Mount in api.ts**
   - Replace the block of `app.get(...)` with `registerHealthRoutes(app);` (or `app.use("/v1/dashboard", dashboardRouter);`).

4. **Add tests**
   - At least one integration test per router that hits the mounted path (e.g. GET /health, GET /v1/dashboard) and asserts status/body shape.

---

## Shared pieces to factor

- **`handleDbMissingTable`** — Used in many handlers; put in `api-common.ts` or `db.ts`.
- **`normalizeRiskLevel`, `getRole`** — Move to `api-common.ts` or a small `auth-utils.ts`.
- **`LLM_PRICING`, `llmProvider`, `llmCostUsd`** — Move to `control-plane/src/llm-pricing.ts` (or similar) and import where usage/llm_calls need it.
- **Constants** — `DEFAULT_LIMIT`, `MAX_LIMIT`, `CONTROL_PLANE_BASE`, `SEO_GOOGLE_CALLBACK_PATH` can live in a small `constants.ts` or stay in api.ts until the file is small.

---

## Order of work (suggested)

1. **Health** — Small, no DB or trivial DB; establishes the pattern.
2. **Dashboard** — system_state, dashboard, drift, search; medium complexity.
3. **Observability** — llm_calls, usage, tool_calls, audit; read-only, good for testing.
4. **Policies** — policies, adapters, capability_grants, secret_refs; read-heavy.
5. Then **Runs** (split into runs + run-artifacts if needed), **Initiatives**, **Releases**, etc.

---

## Success criteria

- api.ts under ~1,500 lines (or under ~800 if we move all route blocks out).
- Every new route goes into a domain router, not api.ts.
- `npm run lint` and existing tests pass after each extraction.
- No change to public API surface (same paths, same behavior).
