# Staging Render checklist (non‑prod)

Use this after checking Environment for **ai-factory-api-staging**, **ai-factory-gateway-staging**, and **ai-factory-runner-staging**.

---

## ai-factory-api-staging (Control Plane)

| Variable | Required | You have | Notes |
|----------|----------|----------|--------|
| DATABASE_URL | Yes | ✓ | Same DB as runner. |
| CORS_ORIGIN | Yes | ✓ (*) | Set to console origin in prod; * is OK for staging. |
| PORT | Yes | ✓ (10000) | — |
| NODE_ENV | No | ✓ (production) | Fine. |

If you see **"operator does not exist: run_status = text"** in logs (no-artifacts scan), the fix is in `main` (cast `r.status::text`). Redeploy the Control Plane from the latest `main`; if the error persists, use **Clear build cache & deploy** in Render so the bundle is rebuilt from source.

**MaxClientsInSessionMode (Supabase session pooler limit):**  
If the API or Console shows `{"error":"MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size"}`, the **Supabase session pooler** has run out of connections. Control Plane and Runner each use a pg pool (default `max: 5` via `DATABASE_POOL_MAX`). Fix by either:

1. **Reduce app-side pools** so total stays under Supabase’s pool_size: on **ai-factory-api-staging** and **ai-factory-runner-staging**, set **`DATABASE_POOL_MAX`** = `3` (or `2`). Then save env and let Render redeploy. Code respects this in [control-plane/src/db.ts](control-plane/src/db.ts) and [runners/src/index.ts](runners/src/index.ts).
2. **Increase Supabase pool_size** (if your plan allows): Supabase Dashboard → Database → Connection pooling → Session pooler settings.

Render logs show this as `[reaper] Error: error: MaxClientsInSessionMode: ...` when the lease reaper (or any background job) can’t get a connection.

**Optional (for self‑heal to sync worker env):**

- **ENABLE_SELF_HEAL** = `true`
- **RENDER_API_KEY** = (Render API key)
- **LLM_GATEWAY_URL** = `https://ai-factory-gateway-staging.onrender.com` (or your gateway URL)

If these are set, the control plane can push DATABASE_URL, CONTROL_PLANE_URL, and LLM_GATEWAY_URL to the runner and restart it when runs have no artifacts.

**Verdict:** Nothing critical missing for basic runs. Add the optional three only if you want self‑heal.

---

## ai-factory-gateway-staging (LLM Gateway)

| Variable | Required | You have | Notes |
|----------|----------|----------|--------|
| OPENAI_API_KEY | Yes | ✓ | — |
| CONTROL_PLANE_URL | For routing | ✓ | https://ai-factory-api-staging.onrender.com |
| NODE_ENV | No | ✓ (production) | Fine. |

**LLM_GATEWAY_URL** on this service points to `https://llm-gateway.onrender.com`. If this *is* your LiteLLM gateway, the **runner** should call this service; if your actual gateway is **ai-factory-gateway-staging**, the runner’s `LLM_GATEWAY_URL` should be `https://ai-factory-gateway-staging.onrender.com`.

**Verdict:** OK as long as the runner’s LLM_GATEWAY_URL matches the gateway that’s actually serving LLM requests.

---

## ai-factory-runner-staging (Web + job loop)

The runner is deployed as a **web** service so Render can run a health check (GET /health). It still runs the job-poll loop; it also listens on PORT and responds 200 to /health so the service check (and Render MCP) passes.

| Variable | Required | You have | Notes |
|----------|----------|----------|--------|
| DATABASE_URL | Yes | ✓ | **Must be identical to ai-factory-api-staging.** See below. |

**What DATABASE_URL should the runner have (staging)?**  
The **exact same** connection string as **ai-factory-api-staging**. Easiest: **Render → ai-factory-api-staging → Environment** → copy `DATABASE_URL` → **ai-factory-runner-staging → Environment** → paste as `DATABASE_URL`.  
Use **Session pooler** (port **5432**) or **Direct connection** — not Transaction pooler (6543). With Transaction pooler, the runner can commit the artifact but the next query may hit a different backend (e.g. replica) and see no rows; then the UI shows no artifacts. In Supabase → Database → Connection string, pick **Session** (or **Direct**) and use that URI for both API and runner.
| CONTROL_PLANE_URL | Yes | ✓ | **Check for typo:** must be `https://**ai**-factory-api-staging.onrender.com` (not `a1-factory`). |
| LLM_GATEWAY_URL or OPENAI_API_KEY | Yes | ✓ (both) | Runner can call gateway or OpenAI direct. |

**Critical:** If `CONTROL_PLANE_URL` is `https://a1-factory-api-staging.onrender.com`, change **a1** to **ai**. Wrong URL causes runner to fail loading brand/routing and can contribute to pipeline failures.

**LLM_GATEWAY_URL:** If you use **ai-factory-gateway-staging** as the LLM gateway, set:

- `LLM_GATEWAY_URL` = `https://ai-factory-gateway-staging.onrender.com`

If you use a separate **llm-gateway** service, keep `https://llm-gateway.onrender.com`.

**Done when:** Runner has `LLM_GATEWAY_URL` = `https://ai-factory-gateway-staging.onrender.com`. You do not need `llm-gateway.onrender.com` for the runner unless you use that as a separate gateway.

**Self-heal (optional):** If you see "Worker service 'ai-factory-runner-staging' not found in Render", set on the Control Plane either **`RENDER_WORKER_SERVICE_ID`** (recommended: service ID from Render dashboard → worker service → URL or API) or **`RENDER_WORKER_SERVICE_NAME`** to the exact service slug (default: `ai-factory-runner-staging`). Ensure `RENDER_API_KEY` is set and is from the same Render account that owns the services.

**Verdict:** Confirm CONTROL_PLANE_URL is `ai-factory` (not `a1-factory`). Confirm LLM_GATEWAY_URL points to the gateway service that’s actually deployed and healthy.

---

## "No artifacts" even though runner uses same Supabase — verify same DB

If the run **succeeds** but the Artifacts tab is empty and the message says "ensure a runner is connected to the same database as the Control Plane", the runner and Control Plane must both talk to the **exact same** database. Same Supabase project is not enough: both services must use the **same connection string** (same host, e.g. session pooler).

**1. Check Control Plane DB hint**

```bash
curl -s https://ai-factory-api-staging.onrender.com/health/db
```

You should see something like:

```json
{ "status": "ok", "db": "connected", "database_hint": { "host": "aws-1-us-east-1.pooler.supabase.com", "port": "5432" } }
```

**2. Compare with runner**

The runner logs its DB at startup: in Render → **ai-factory-runner-staging** → Logs, look for `[runner] DATABASE_URL hint (verify same as Control Plane): host=... port=...`. That **host** and **port** must match the Control Plane’s `database_hint`. You can also open Environment → `DATABASE_URL` and compare the URL’s host/port. For project `anqhihkvovuhfzsyqtxu` with session pooler you expect:

- Host: `aws-1-us-east-1.pooler.supabase.com`
- Port: `5432`

If the Control Plane’s `database_hint` is different (e.g. another host or port), then **ai-factory-api-staging** is using a different database. Set its `DATABASE_URL` in Render to the **same** value as the runner’s (same Supabase project, same pooler), save, and let it redeploy.

**3. Optional — confirm artifact in DB**

After a run that “succeeded” with no artifacts in the UI, open Supabase → SQL Editor and run:

```sql
SELECT id, run_id, artifact_type, created_at FROM artifacts WHERE run_id = '9de6dbf0-2583-4bec-8187-59b7c2c31519' ORDER BY created_at;
```

Replace the UUID with your actual run id (from the run detail URL, e.g. `/runs/9de6dbf0-...`). If you see a row, the runner wrote to this DB but the API might not be returning it. If you see **no rows** but the runner logs show `[runner] handler transaction committed (artifacts persisted)` with `artifact_count: 1` for that run_id, you are likely querying a **different database** (e.g. wrong Supabase project in the dashboard, or SQL Editor on a read replica). Confirm the Supabase project is **anqhihkvovuhfzsyqtxu** and run `SELECT id, status FROM runs WHERE id = 'YOUR_RUN_ID'` — if the run exists here, you're in the right DB; then re-check the artifacts query.

To list recent runs and artifact counts (runs table has `started_at`, not `created_at`):

```sql
SELECT r.id AS run_id, r.status, r.started_at, (SELECT count(*) FROM artifacts a WHERE a.run_id = r.id) AS artifact_count FROM runs r ORDER BY r.started_at DESC NULLS LAST LIMIT 20;
```

---

## Is https://llm-gateway.onrender.com needed?

- **This repo:** The blueprint defines **ai-factory-gateway-staging** (`https://ai-factory-gateway-staging.onrender.com`). That service uses LiteLLM (Dockerfile.gateway) and exposes `/health` and `/health/readiness`; use it for runner `LLM_GATEWAY_URL` and for health checks.
- **llm-gateway.onrender.com** is a separate Render service. If it returns `{"Hello":"World"}` at `/` and `{"detail":"Not Found"}` at `/health` and `/health/readiness`, it is **not** running the LiteLLM proxy from this repo—it's a different app (e.g. a stub). Nothing in this repo needs to change; use **ai-factory-gateway-staging** for health-checkable gateways, or redeploy the "llm-gateway" service from this repo's **Dockerfile.gateway** (same as ai-factory-gateway-staging) if you want that URL to have LiteLLM and health endpoints.

**How to verify a gateway (LiteLLM from this repo):**

1. **ai-factory-gateway-staging:** `curl -s -o /dev/null -w "%{http_code}" https://ai-factory-gateway-staging.onrender.com/health/readiness` — expect **200**.
2. **If you don't use llm-gateway:** Point the runner at **ai-factory-gateway-staging** only; you can ignore llm-gateway.onrender.com.
3. **If you want llm-gateway to support /health:** Deploy it from this repo with `Dockerfile.gateway` (and gateway/config.yaml) so it runs LiteLLM; then `/health` and `/health/readiness` will work.

---

## Next steps (in order)

1. **Fix CONTROL_PLANE_URL on the runner** (if it says `a1-factory`): Edit env → set `CONTROL_PLANE_URL` = `https://ai-factory-api-staging.onrender.com` → Save (worker will redeploy).
2. **Align LLM gateway URL on the runner:** If your only gateway is ai-factory-gateway-staging, set the runner’s `LLM_GATEWAY_URL` = `https://ai-factory-gateway-staging.onrender.com`; otherwise leave as is and ensure that gateway is up and `/health` returns 200.
3. **Optional – self‑heal on Control Plane:** On **ai-factory-api-staging**, add `ENABLE_SELF_HEAL=true`, `RENDER_API_KEY`, and optionally `LLM_GATEWAY_URL`; then the API can sync worker env when runs have no artifacts.
4. **Deploy code:** Ensure the latest commit (run ordering, started_at, wizard redirect, runbook, empty-state copy) is pushed to `main`; trigger deploy on Render for **ai-factory-api-staging** and **ai-factory-runner-staging** (and gateway if you changed its code). Vercel will auto-deploy the console from `main`.

After that, run the email wizard again and check Pipeline Runs (filter **All**, newest at top).

---

## Render MCP (Cursor) – logs and workspace

To check Render logs from Cursor (e.g. for MaxClientsInSessionMode or build failures):

1. **Workspace:** The Render MCP needs a workspace selected before `list_services` or `list_logs`. If you have **only one workspace**, call **`list_workspaces`** first — the MCP will auto-select it. Then `list_services` and `list_logs` work. Service IDs: **ai-factory-api-staging** = `srv-d6ka7mhaae7s73csv3fg`, **ai-factory-runner-staging** = `srv-d6l0ba7gi27c738vbqog`.
2. **Fetch API logs:** `list_logs` with `resource: ["srv-d6ka7mhaae7s73csv3fg"]`, `type: ["app"]`, optional `text: ["MaxClients", "pool"]` to find connection errors.
3. **Fetch runner logs:** Same with `resource: ["srv-d6l0ba7gi27c738vbqog"]`.
