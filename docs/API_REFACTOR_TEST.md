# Testing After api.ts Strangler Refactor

After the strangler refactor, all route handlers live in `control-plane/src/http/controllers/` and are mounted via `control-plane/src/http/routers/`. **api.ts** is a thin composition root (~90 lines) with no inline handlers.

Use this checklist to confirm **100% parity** with MCP, Console, and `.env`.

---

## 1. Build and type-check

From **repo root**:

```bash
npm run build
npm run lint
```

From **control-plane**:

```bash
cd control-plane && npx tsc --noEmit
```

All must pass with no errors.

---

## 2. .env (Control Plane + Console)

- **Control Plane** runs with the same `.env` you use for production/staging (e.g. `PORT`, `DATABASE_URL`, `CORS_ORIGIN`). Load it when starting locally:
  - From repo root: `node --env-file=.env node_modules/.bin/tsx control-plane/src/index.ts` or ensure your shell has `DATABASE_URL`, `PORT=3001`, etc.
  - Or: `npm run dev:control-plane` (if your environment already has `DATABASE_URL` and other vars).
- **Console** must point at the Control Plane:
  - In **console/.env.local** (or Vercel env):  
    `NEXT_PUBLIC_CONTROL_PLANE_API=http://localhost:3001` (local) or your deployed Control Plane URL (e.g. `https://ai-factory-api-staging.onrender.com`).
- Use the **same** Control Plane URL for both Console and any MCP tools that call the API.

---

## 3. Control Plane + curl (smoke)

With the Control Plane running (e.g. `npm run dev:control-plane` from repo root with `.env` loaded):

```bash
# Health
curl -s http://localhost:3001/health | head -c 200
curl -s http://localhost:3001/health/db | head -c 200

# Refactored route families (same paths as before)
curl -s http://localhost:3001/v1/dashboard
curl -s http://localhost:3001/v1/usage
curl -s http://localhost:3001/v1/initiatives
curl -s http://localhost:3001/v1/plans
curl -s http://localhost:3001/v1/runs
curl -s http://localhost:3001/v1/policies
curl -s http://localhost:3001/v1/audit
```

Expect **200** (or **503** for `/health/db` if DB is unreachable) and JSON. No path or response shape changes were made in the refactor.

Optional: run the script below for a minimal automated smoke set:

```bash
node --env-file=.env scripts/api-refactor-smoke.mjs
```

---

## 4. Console

1. Start Control Plane (see above).
2. Start Console: `cd console && npm run dev`.
3. In the browser, click through:
   - **Health** (or `/health`).
   - **Dashboard** (uses `/v1/dashboard`, `/v1/system_state`, etc.).
   - **Initiatives** (list/detail).
   - **Plans**, **Runs**, **Usage**, **Approvals**, **Artifacts**, etc.
4. Confirm **no regressions**: same status codes and data as before the refactor. If anything 404s or returns a different shape, the corresponding router/controller may need a route path or export fix.

---

## 5. MCP (Render and others)

- **Render MCP**: Use it to hit the same Control Plane base URL (e.g. staging or local with tunnel). Call endpoints such as:
  - `GET /health`
  - `GET /v1/dashboard`
  - `GET /v1/initiatives`
  - `GET /v1/usage`
  - Any other endpoints your workflows use.
- Confirm responses match **pre-refactor** behavior (status codes and top-level keys).
- **Optional**: Use the **browser MCP** against the Console UI to verify pages that call the refactored routes load and behave correctly.

---

## 6. Loop until 100%

- The refactor is **complete** when **api.ts** has **no** `app.get` / `app.post` / `app.patch` / `app.put` / `app.delete` left—only imports, `app.use(...)` for each router, global middleware, and `startApi()`.
- After each batch of extractions (or after PR 19):
  1. Run `npm run build` and `npm run lint` (or `tsc --noEmit`).
  2. Smoke the newly moved routes with curl or `scripts/api-refactor-smoke.mjs`.
  3. Run the full check: Console + MCP + .env as above.

---

## Route families (all in http/routers + http/controllers)

| Router            | Key paths |
|-------------------|-----------|
| health            | `/health`, `/health/db`, `/health/migrations`, `/health/schema`, `/v1/health`, `/v1/errors` |
| dashboard         | `/v1/dashboard`, `/v1/search`, `/v1/system_state`, `/v1/dashboard/drift`, `/v1/render/status`, `/v1/analytics` |
| usage             | `/v1/usage`, `/v1/usage/by_job_type`, `/v1/usage/by_model`, `/v1/policies`, `/v1/adapters`, `/v1/capability_grants`, `/v1/secret_refs`, `/v1/audit` |
| initiatives       | `/v1/initiatives` (CRUD, plan, replan, Google token) |
| plans             | `/v1/plans` |
| releases          | `/v1/releases` |
| runs              | `/v1/runs` (full CRUD, artifacts, logs, rerun, rollback, etc.) |
| approvals         | `/v1/approvals` |
| jobs              | `/v1/job_failures`, `/v1/job_runs` |
| artifacts         | `/v1/artifacts`, tool_calls, llm_calls, validations, template_proof |
| deploy            | `/v1/deploy_events`, vercel/register, self_heal |
| webhooks          | `/v1/webhook_outbox`, `/v1/webhooks/github`, `/v1/webhooks/vercel` |
| checkpoints       | `/v1/checkpoints`, `/v1/known_good`, `/v1/failure_clusters` |
| change-events     | `/v1/change_events`, `/v1/import_graph` |
| schema            | `/v1/schema_drift`, `/v1/contract_breakage_scan`, `/v1/schema_contracts`, `/v1/migration_guard` |
| incidents         | `/v1/incidents`, `/v1/incident_memory`, `/v1/decision_loop/*` |
| memory            | `/v1/memory/lookup`, `/v1/memory_entries`, agent_memory, mcp_servers, routing_policies, llm_budgets |
| seo               | `/v1/sitemap/products`, `/v1/products/from_url`, `/v1/seo/*`, brand_profiles/:id/google_* |
| brands            | `/v1/brand_profiles` (CRUD, usage, prefill, embeddings, assets), organizations, stores |
| taxonomy          | `/v1/taxonomy/*` |
| catalog           | `/v1/catalog/products` |
| templates         | `/v1/document_templates`, `/v1/pexels/search`, `/v1/campaign-images/copy` |
| email-designs     | `/v1/email_designs` |
| email-templates   | `/v1/email_templates` |
| email-components  | `/v1/email_component_library` |
| launches          | `/v1/build_specs`, `/v1/launches` |
| graph-legacy      | `/v1/graph/topology`, `/v1/graph/frontier`, `/v1/graph/repair_plan`, `/v1/graph/subgraph_replay`, `/v1/graph/audit`, `/v1/graph/missing_capabilities`, `/v1/graph/lineage` |

Plus **registerGraphRoutes(app)** and **evolutionRouter** at `/v1/evolution` (unchanged).
