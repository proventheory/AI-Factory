# Runbook: Test deploy-failure self-heal and migration-on-startup

Use this runbook to verify that (1) Render and Vercel deploy-failure self-heal trigger redeploys, and (2) the Control Plane runs migrations on startup so "Console schema missing" is fixed by redeploy or by running migrate.

**Verified (2026-03-16):** Control Plane deployed with trigger endpoint; `POST /v1/self_heal/deploy_failure_scan` runs Render + Vercel scan. Console and Control Plane were broken on purpose (syntax errors), scan was triggered, self-heal logic ran. Reverts pushed; health and health/db confirmed ok. Migration-on-startup: Dockerfile CMD runs `node scripts/run-migrate.mjs` then the API; successful deploy implies migrate ran (DB connected, API healthy). **Fix (2026-03-16):** Render API returns **build_failed** (not "failed") for failed builds; deploy-failure self-heal now treats `build_failed` so gateway (and api/runner) failed deploys are remediated by the 5‑min loop.

**Prerequisites**

- Control Plane has `ENABLE_SELF_HEAL=true`, `RENDER_API_KEY`, `RENDER_STAGING_SERVICE_IDS`, and `VERCEL_TOKEN` (or `VERCEL_API_TOKEN`) set. Push env: `node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs`.
- Control Plane is deployed with **POST /v1/self_heal/deploy_failure_scan** (trigger endpoint). If not yet deployed, deploy the Control Plane first.

---

## 1. Trigger deploy-failure scan on demand (no 5‑min wait)

```bash
curl -X POST "https://ai-factory-api-staging.onrender.com/v1/self_heal/deploy_failure_scan"
```

Expected: `{ "ok": true, "message": "..." }`. Then check Control Plane logs on Render and Render/Vercel deploy history to see if any redeploy was triggered.

---

## 2. Test Render deploy-failure self-heal

1. **Cause a failed deploy on Render** (e.g. api or runner):
   - Option A: Push a commit that breaks the build (e.g. syntax error in `control-plane/src/index.ts` or `runners/`). Wait for Render to build and report **Failed**.
   - Option B: In Render Dashboard → service → Deployments, **Cancel** the latest deploy so its status is **Canceled**.

2. **Run the scan** (so you don’t wait 5 minutes):
   ```bash
   curl -X POST "https://ai-factory-api-staging.onrender.com/v1/self_heal/deploy_failure_scan"
   ```

3. **Verify**: In Render → that service → Deployments, a **new** deploy should appear (triggered by the Control Plane). If you used Option A (broken commit), the new deploy will fail again; the point is that self-heal **did** trigger a redeploy.

4. **Clean up**: If you pushed a bad commit, push a fix and let the next deploy succeed.

---

## 3. Test Vercel deploy-failure self-heal

1. **Cause a failed or canceled deploy on Vercel** (Console project):
   - Option A: Push a commit that breaks the Console build (e.g. syntax error in `console/`). Wait for Vercel to build and report **Error**.
   - Option B: In Vercel → Project (ai-factory-console) → Deployments, **Cancel** the latest deployment.

2. **Run the scan**:
   ```bash
   curl -X POST "https://ai-factory-api-staging.onrender.com/v1/self_heal/deploy_failure_scan"
   ```

3. **Verify**: In Vercel → Deployments, a new deployment should be triggered. If the commit is still broken, it will fail again; self-heal is confirmed if a new deploy was created.

4. **Clean up**: Push a fix if you broke the build.

---

## 4. Test migration “self-heal” (Console schema missing)

The “self-heal” for missing DB schema is: **migrations run on every Control Plane startup** (see `Dockerfile.control-plane` CMD). So either (a) run migrate manually, or (b) redeploy the Control Plane so the new container runs migrate then starts the API.

**4a. Verify migrate-on-startup (safe)**

1. Migrations run **inside the Control Plane process** before the API starts (`control-plane/src/index.ts`: `runMigrationsOnStartup()`), so every deploy or restart applies migrations even if Render uses a custom start command.
2. Redeploy the Control Plane on Render (e.g. trigger deploy from dashboard or push a commit).
3. In Render → ai-factory-api-staging → **Logs**, open the logs for the **latest** deploy. You should see `[control-plane] Migrations complete.` then the API starting. Then `GET https://ai-factory-api-staging.onrender.com/v1/initiatives` should return 200 (not schema error). That proves migration self-heal.

**4b. Simulate “Console schema missing” then fix (optional, use staging DB only)**

1. **Reproduce the error**: Use a DB that has not had migrations applied (e.g. a temporary Supabase branch or a copy of staging with a table dropped). Point the Console at an API that uses that DB, or call `GET /v1/initiatives` (or similar) against that API — you should see schema/relation errors or "Control Plane database schema is missing".
2. **Fix**:  
   - Either run migrations against that DB:  
     `DATABASE_URL=<that_db_url> node --env-file=.env scripts/run-migrate.mjs`  
   - Or redeploy the Control Plane with `DATABASE_URL` set to that DB; on startup it will run `run-migrate.mjs` and then start the API.
3. **Verify**: Call `GET /health/db` and the failing endpoint again; the Console or API should succeed.

See [console-db-relation-does-not-exist.md](console-db-relation-does-not-exist.md) for the standard fix when the Console shows that message.

---

## 5. Quick sanity checks (no breaking)

- **Control Plane health**:  
  `curl -s "https://ai-factory-api-staging.onrender.com/health"`  
  Expect: `{"ok":true}` or similar.

- **DB used by API**:  
  `curl -s "https://ai-factory-api-staging.onrender.com/health/db"`  
  Expect: `database_hint` and connectivity ok.

- **Run migrate locally** (same DB as staging):  
  `node --env-file=.env scripts/run-migrate.mjs`  
  Expect: `Ran ...` / `Skipped ...` then `Migration complete.`
