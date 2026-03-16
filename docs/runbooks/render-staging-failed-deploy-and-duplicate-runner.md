# Render staging: failed deploy and duplicate runner

## Why didn’t self-heal fix the failed deploy?

Deploy-failure self-heal runs **inside the Control Plane**: a 5‑minute loop in **ai-factory-api-staging** (and/or api-prod) that checks Render and triggers redeploys when the latest deploy is failed/canceled. So:

- **When api-staging itself has a failed deploy**, that service is **not running**. The **runner** (ai-factory-runner-staging) also runs the same 5‑min deploy-failure scan when it has the right env; so when the API is down, the runner can still trigger redeploys for api (and gateway/runner).
- **When BOTH api-staging and runner-staging have failed deploys**, nothing in staging is running. **Prod (ai-factory-api-prod)** is the backup healer: the script now **always** pushes self-heal env to prod, so prod’s 5‑min scan will trigger staging redeploys. Run the script once (see Patch below); after that, even if all of staging is down, prod will heal it within 5 minutes.

**Why staging kept failing even though self-heal was triggering redeploys:**  
Self-heal **was** working (Render deploys show `trigger: "api"`). Each new deploy failed at **runtime** with `relation "runs"`, `relation "job_claims"`, or `relation "job_runs" does not exist` because **DATABASE_URL** on the staging services was missing or pointed at a DB where the core schema was never applied. The script did not set DATABASE_URL, so staging relied on Render/Blueprint defaults. **Fix:** The script now sets **DATABASE_URL** (from `.env`) on staging API and runner so they use the same Supabase DB as migrations. Re-run the script after any env change; we also set it via Render MCP when diagnosing.

**What to do right now:**  
1. **One-time:** Run `node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs` so staging API, staging runner, **and api-prod** all have self-heal env **and DATABASE_URL** (staging = same DB as migrations). Prod is then the backup healer when both api and runner are down.  
2. **Immediate (don’t wait 5 min):** Call the one-shot scan on **prod**:  
   `POST https://<api-prod-url>/v1/self_heal/deploy_failure_scan` (no body).  
   That triggers redeploys for any staging service in the failed list. Use this when staging is down and you want redeploys now instead of waiting for the next 5‑min tick.

**Runner is up but api-staging still didn’t self-heal?** Two common causes:

1. **Runner missing RENDER_STAGING_SERVICE_IDS** — The runner only checks services in **RENDER_STAGING_SERVICE_IDS**. If that’s unset, it only uses **RENDER_WORKER_SERVICE_ID** (itself). Fix: run the script below so the runner gets `RENDER_STAGING_SERVICE_IDS=api_id,gateway_id,runner_id`. To confirm: set `DEBUG_SELF_HEAL=1` on the runner and check logs for “monitoring N service(s)” — you should see 3, not 1.
2. **Render API status not in our list** — Render returns **`update_failed`** (not `failed`) for many failed deploys. Self-heal only remediates statuses in `FAILED_STATUSES`; we now include `update_failed`. If a new failure type appears, add it in `deploy-failure-self-heal.ts` and `deploy-failure-scan-trigger-only.ts` and see [SELF_HEAL_PROVIDER_STATUS_REFERENCE.md](../SELF_HEAL_PROVIDER_STATUS_REFERENCE.md).

3. **Env is set but api-staging still shows Failed deploy (verified via Render MCP):** Self-heal **is** running: the runner (or prod) triggers redeploys for api-staging every ~5 minutes (Render deploys show `trigger: "api"`). The deploy stays red because **each redeploy fails for the same reason**: the migration `20250320000000_seo_url_risk_snapshots.sql` hits `policy "seo_url_risk_snapshots_select" already exists` (Postgres 42710). The image was built from a commit that didn’t yet have the idempotent fix (`DROP POLICY IF EXISTS` before `CREATE POLICY`). **Fix applied in repo:** (1) Migration has `DROP POLICY IF EXISTS` before `CREATE POLICY`. (2) `run-migrate.mjs` lists this migration with `skipIfErrorCode: "42710"` so older images can skip “policy already exists” and continue. **Commit and push** these changes; the next self-heal redeploy (or manual deploy) should bring api-staging live.

**LLM self-fix (after 2 redeploys):** When the same commit fails 2+ times, self-heal no longer only creates an initiative — it fetches Render logs, stores them in the initiative’s `goal_metadata.deploy_failure`, compiles the **issue_fix** plan (analyze_repo → write_patch → …), and **auto-starts a run**. The runner’s **analyze_repo** and **write_patch** handlers use the deploy logs in the LLM prompt so the model can diagnose (e.g. migration order, policy already exists) and propose a patch. You still need to apply the patch (e.g. from the run’s patch artifact) and merge/push; So the system *does* fix itself: **detect → logs → LLM → suggested patch**. The **remaining part** is applying that patch (and optionally automating PR creation). See [AUTONOMOUS_RECOVERY_SPEC.md](../AUTONOMOUS_RECOVERY_SPEC.md) for the full incident/recovery subsystem.

**Patch (one-time): so staging fixes itself** — The script pushes self-heal env **and DATABASE_URL** to **staging API** and **staging runner**. So when api-staging is down, the runner’s 5‑min scan triggers redeploys. The script now always pushes to api-prod too (backup healer) with prod’s DATABASE_URL. Run once from repo root:

1. From repo root (ensure `.env` has `DATABASE_URL` and `DATABASE_URL_PROD`):  
   `node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs`  
   This pushes ENABLE_SELF_HEAL, RENDER_API_KEY, RENDER_STAGING_SERVICE_IDS, **DATABASE_URL** (staging DB for API/runner, prod DB for api-prod) to all three. Staging must use the same DB as migrations or you get "relation runs/job_claims does not exist" at runtime.
2. No `--prod` flag needed; script pushes to api-prod by default.

See [SELF_HEAL_REQUIRED_ENV.md](../SELF_HEAL_REQUIRED_ENV.md) and [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md).

---

## 1. Failed deploy (build_failed in ~2s)

If **ai-factory-api-staging**, **ai-factory-gateway-staging**, or **ai-factory-runner-staging** show **Failed deploy** with the build failing in a few seconds:

1. **Render Dashboard** → select the service → **Events** (or **Deploys**) → open the **failed** deploy.
2. Open **Build logs** (or **Logs**). Look for the first **error** or **failed** line.
3. **Paste that first error line** (or the last 20 lines of the build log) so the cause can be fixed in the repo or Render config.
4. Common causes:
   - **Docker build**: Missing file, wrong `dockerfilePath`, or build step failing (e.g. `npm ci`, `esbuild`).
   - **Blueprint / repo**: Service points at wrong branch or repo; sync Blueprint again.
   - **Cache**: Trigger deploy with **Clear build cache** (see below).
5. Fix the cause in the repo or in the service’s Render settings, then trigger a new deploy.

**Direct links (open → Events → failed deploy → Build logs):**

| Service | Dashboard |
|--------|-----------|
| ai-factory-api-staging | https://dashboard.render.com/web/srv-d6ka7mhaae7s73csv3fg |
| ai-factory-gateway-staging | https://dashboard.render.com/web/srv-d6l25d1aae7s73ftpvlg |
| ai-factory-runner-staging (web) | https://dashboard.render.com/web/srv-d6oig7450q8c73ca40q0 |

**Trigger deploy (with optional cache clear):**

```bash
RENDER_API_KEY=xxx node scripts/render-trigger-deploy.mjs --staging          # all three services
RENDER_API_KEY=xxx node scripts/render-trigger-deploy.mjs --staging --clear  # clear build cache then deploy
```

**Why MCP/API can’t show the error:** The Render MCP and Render API do not return build log content for failed deploys. For builds that fail in ~2–3 seconds, **no build log lines are written at all** (failure happens before Docker or clone finishes). So the only way to see the failure reason is the **Dashboard** → service → Events → failed deploy → **Build logs**. If the Dashboard also shows empty or no build logs for that deploy, the failure is **pre-build** (e.g. repo clone, GitHub connection, or Render job setup). In that case: reconnect the GitHub repo in Render (Dashboard → service → Settings → Build & Deploy → Connect repository), or trigger **Clear build cache & deploy** from the Dashboard, or contact Render support.

**Isolate pre-build vs build failure:** Use the minimal test Dockerfile to see if *any* Docker build works. In Dashboard → **ai-factory-api-staging** → **Settings** → **Build & Deploy** → set **Dockerfile Path** to `./Dockerfile.render-minimal` → **Save** → **Manual Deploy**. If that deploy **succeeds**, the problem is in our real Dockerfile (e.g. `npm ci` or `esbuild`); switch the path back to `./Dockerfile.control-plane` and fix the step that fails (check Build logs). If **Dockerfile.render-minimal** also fails in ~2s with no logs, the problem is pre-build (clone, GitHub connection, or Render); try reconnecting the repo and Clear build cache, or contact Render support.

---

## 1b. Failed deploy (update_failed — migrations fail at startup)

If the **build** succeeds (image pushes) but the deploy shows **Failed deploy** and status **update_failed**, the container is exiting during **startup** (e.g. migrations). Check **Logs** (runtime, not Build logs) for the service.

**Common migration errors:**

- **`relation "operators" does not exist`** — A migration references `operators` before it’s created. Fix: in `scripts/run-migrate.mjs`, run **capability_graph** (which creates `operators`) **before** **phase6_durable_graph_runtime** (which references `operators(id)`).
- **`policy "seo_url_risk_snapshots_select" ... already exists`** — The migration isn’t idempotent. Fix: in the migration SQL use `DROP POLICY IF EXISTS "..." ON table; CREATE POLICY ...` so re-runs don’t fail.

**Runtime "relation does not exist" (migrations finished, app crashes after start):** If **Logs** show migrations completing but then errors like `relation "runs" does not exist` or `relation "job_claims" does not exist`, the app is talking to a DB where core tables are missing.

1. **Set DATABASE_URL on Render** — In Render → service → **Environment**, set **DATABASE_URL** to your staging Supabase pooler URL (same as in `.env`). Re-deploy. The script `scripts/set-render-vercel-self-heal-env.mjs` now pushes DATABASE_URL for staging API and runner when you run it.
2. **If it still fails after setting DATABASE_URL** — The staging DB may never have had migrations applied (e.g. new or empty Supabase project). **Bootstrap the DB once** from your machine: from repo root run  
   `DATABASE_URL='<staging-pooler-URL-from-.env>' node scripts/run-migrate.mjs`  
   Use the exact same URL as in `.env` for staging (e.g. `postgres.anqhihkvovuhfzsyqtxu` pooler). Then trigger a new deploy on Render (or wait for self-heal). After that, the container’s migration step will be a no-op (already applied) and the app will see the tables.

After fixing migrations or run order, commit, push, and trigger a new deploy (or let self-heal trigger it).

---

## 2. Duplicate runner (two ai-factory-runner-staging services)

You may have **two** runner services:

| Service | Type | ID | Keep? |
|--------|------|-----|--------|
| **ai-factory-runner-staging** | Background worker | `srv-d6l0ba7gi27c738vbqog` | No (optional to remove) |
| **ai-factory-runner-staging** (slug `ai-factory-runner-staging-n7p1`) | Web service | `srv-d6oig7450q8c73ca40q0` | Yes (has `/health`, passes service check) |

**What to do**

- **Keep the web service** (`srv-d6oig7450q8c73ca40q0`): it listens on PORT and serves GET `/health`, so Render (and MCP) service checks pass.
- **Optional:** In Render Dashboard, **suspend** or **delete** the **background worker** (`srv-d6l0ba7gi27c738vbqog`) so only one runner remains. Copy its env vars (e.g. `DATABASE_URL`, `CONTROL_PLANE_URL`, `LLM_GATEWAY_URL`) into the web runner if they are not already there.
- Ensure the **web** runner has the same env as the worker had (same DB, Control Plane URL, LLM gateway or API key).

There is no “delete service” or “suspend service” in the Render MCP; use the Dashboard.

---

## 3. First Capital import and MaxClientsInSessionMode

If the First Capital Airtable import fails with **MaxClientsInSessionMode**:

- The script uses a **single** DB client and **retries** the connection (up to 10 times, 15s apart).
- Run the import when DB usage is lower (e.g. after suspending staging workers), or use a **direct** Supabase connection string (not session pooler) for the import so it doesn’t share the same small pool.

Command (token in env or inline):

```bash
AIRTABLE_TOKEN='pat...' AIRTABLE_BASE_ID=app6pjOKnxdrZsDWR node --env-file=.env scripts/airtable-import-first-capital.mjs
```
