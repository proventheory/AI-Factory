# Render staging: failed deploy and duplicate runner

## Why didn’t self-heal fix the failed deploy?

Deploy-failure self-heal runs **inside the Control Plane**: a 5‑minute loop in **ai-factory-api-staging** (and/or api-prod) that checks Render and triggers redeploys when the latest deploy is failed/canceled. So:

- **When api-staging itself has a failed deploy**, that service is **not running**. The Control Plane can’t trigger its own redeploy — but the **runner** (ai-factory-runner-staging) also runs the same 5‑min deploy-failure scan when it has ENABLE_SELF_HEAL, RENDER_API_KEY, and RENDER_STAGING_SERVICE_IDS set. So when the API is down, the **runner** can still trigger redeploys for api (and gateway/runner). Staging can self-heal as long as the runner is up.
- If **both** api-staging and runner-staging have failed deploys, nothing in staging is running. Then **prod** (or a manual trigger) must run the scan; see Patch below.

**What to do right now:** Trigger redeploys manually (see §1 below), or call the one-shot scan from **prod** if prod is up:  
`POST https://<api-prod-url>/v1/self_heal/deploy_failure_scan` (no body). That triggers redeploys for any staging service in the failed list (if prod has `RENDER_API_KEY` and `RENDER_STAGING_SERVICE_IDS` set).

**Patch (one-time): so staging fixes itself** — The script pushes self-heal env to **staging API** and **staging runner**. So when api-staging is down, the runner’s 5‑min scan triggers redeploys. Optionally add **prod** so when both api and runner are down, prod heals staging:

1. From repo root:  
   `node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs`  
   This pushes ENABLE_SELF_HEAL, RENDER_API_KEY, RENDER_STAGING_SERVICE_IDS to **staging API** and **staging runner**. After that, when api-staging has a failed deploy, the runner will trigger a redeploy. No manual step.
2. (Optional) For a second line of defense when both api and runner are down: get **ai-factory-api-prod**’s service ID from Render Dashboard, then run  
   `RENDER_PROD_API_SERVICE_ID=srv-xxxxxxxxxx node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs --prod`  
   so prod’s 5‑min scan also triggers staging redeploys.

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
