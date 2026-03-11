# Render staging: failed deploy and duplicate runner

## 1. Failed deploy (build_failed in ~2s)

If **ai-factory-api-staging**, **ai-factory-gateway-staging**, or **ai-factory-runner-staging** show **Failed deploy** with the build failing in a few seconds:

1. **Render Dashboard** → select the service → **Events** (or **Deploys**) → open the **failed** deploy.
2. Open **Build logs** (or **Logs**). Look for the first **error** or **failed** line.
3. Common causes:
   - **Docker build**: Missing file, wrong `dockerfilePath`, or build step failing (e.g. `npm ci`, `esbuild`).
   - **Blueprint / repo**: Service points at wrong branch or repo; sync Blueprint again.
   - **Cache**: Try **Clear build cache & deploy** in the deploy menu (if available).
4. Fix the cause in the repo or in the service’s Render settings, then trigger a new deploy (e.g. **Deploy latest commit** or push a new commit).

The Render MCP does not return the build log body for failed deploys; the Dashboard is the source of truth.

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
