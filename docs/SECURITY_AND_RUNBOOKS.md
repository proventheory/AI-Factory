# Security Assumptions and Operational Runbooks

## Security assumptions

1. **API keys live only in gateway env.** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` are set on the gateway service (Render/Fly env), never in Runner or Console env.
2. **MCP secrets via env or Supabase secrets.** MCP server auth tokens (`auth_header` in `mcp_server_config`) are passed via env to the Runner or set in the DB; never committed to repo. See `.env.example`.
3. **RLS enabled on all tables.** `supabase/migrations/20250303000002_ai_factory_rls.sql` enables RLS on all core tables. Service role (Control Plane pool) bypasses RLS; Console uses anon key with RLS.
4. **RBAC stub.** `x-role` header in Control Plane (viewer/operator/approver/admin). In production, replace with Supabase Auth JWT + custom claim.
5. **No secrets in logs.** Handlers and MCP client do not log request/response bodies. Gateway (LiteLLM) redacts API keys in logs by default.
6. **CORS configured.** `CORS_ORIGIN` env on Control Plane limits allowed origins. Default is `*` (development); set to Console domain in production.

## Key rotation

### Gateway API keys
1. Generate new key from provider (OpenAI/Anthropic dashboard).
2. Update env var on gateway service (Render → Environment → OPENAI_API_KEY).
3. Restart gateway. Verify `/health` returns 200.
4. Old key is no longer in use after restart.

### MCP server tokens
1. Generate new token from MCP server provider (e.g. GitHub PAT).
2. Update `auth_header` in `mcp_server_config` via `PATCH /v1/mcp_servers/:id` or Supabase Studio.
3. Runner picks up new config on next job claim (config is loaded per-process, restart Runner if config is cached).
4. Test connection via `POST /v1/mcp_servers/:id/test`.

### Supabase keys
1. Rotate via Supabase Dashboard → Settings → API.
2. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Console (Vercel) and `DATABASE_URL` in Control Plane/Runner (Render).
3. Redeploy all services.

## Rate limits

### Control Plane
- No built-in rate limiting. In production, add rate limiting via:
  - Render/Fly proxy (e.g. Cloudflare WAF or nginx rate_limit).
  - Express middleware: `express-rate-limit` (add to `api.ts`).
  - Recommended: 100 req/min per IP for write endpoints, 500 req/min for read.

### Gateway (LiteLLM)
- LiteLLM supports `max_budget` and `max_parallel_requests` in config.
- Add to `gateway/config.yaml` under `general_settings:` when needed.

## Runbooks

### Gateway down
1. Check Render dashboard for service status and logs.
2. Verify `OPENAI_API_KEY` is set and valid.
3. Try `curl https://llm-gateway.onrender.com/health`.
4. If Redis is down, gateway should fall back to in-memory cache (check logs for Redis errors).
5. Restart service if needed.

### Control Plane down
1. Check Render dashboard.
2. Verify `DATABASE_URL` is correct and Supabase is reachable.
3. Try `curl https://control-plane.onrender.com/health/db`.
4. If DB connection fails, check Supabase status page.
5. Restart service.

### Email templates missing (Email Marketing wizard shows “we don’t have templates”)
The Email Marketing wizard (Brand → Products → Template → Generate) lists templates from the Control Plane API. If the list is empty, the database the Control Plane uses does not have the `email_templates` table and/or no rows in it.

**1. Create the table (once per environment)**  
Use the same database as the Control Plane (e.g. Render `DATABASE_URL` or your Supabase/Neon connection string):

```bash
DATABASE_URL="postgresql://user:pass@host:5432/dbname" node scripts/run-email-templates-migration.mjs
```

**2. Seed templates**  
Point at your deployed Control Plane URL:

```bash
CONTROL_PLANE_URL=https://ai-factory-api-staging.onrender.com node scripts/seed-email-templates.mjs
```

(Replace with your actual Control Plane base URL if different.)

**3. Verify**  
- `GET https://<control-plane-url>/v1/email_templates` should return the seeded templates.
- In Console, open Email Marketing → New campaign → Template step; the list should show 6 templates (e.g. Simple Newsletter, Promo / Product Grid, Hero + CTA, etc.).

**Env vars**
- `DATABASE_URL` — same as the one used by the Control Plane (Render/Supabase/Neon).
- `CONTROL_PLANE_URL` — base URL of the deployed API (e.g. `https://ai-factory-api-staging.onrender.com`).

**Pull from Cultura/Focuz Supabase**  
To copy templates from an existing Cultura Supabase project into our Control Plane:

```bash
CULTURA_SUPABASE_URL=https://aimferclcnvhawzpruzn.supabase.co \
CULTURA_SUPABASE_ANON=<publishable-key> \
CONTROL_PLANE_URL=https://ai-factory-api-staging.onrender.com \
node scripts/sync-email-templates-from-cultura.mjs
```

Only rows that have MJML are synced. See `.env.example` for the variable names.

### Pipeline runs: Top error column (lease_expired, LLM_GATEWAY_URL, transaction aborted, 404)
The **Top error** column on Pipeline Runs shows the main failure reason for that run. Common values and what to do:

| Top error | Cause | Fix |
|-----------|--------|-----|
| **lease_expired** | Runner stopped or lost heartbeat before the job finished; reaper marked the job failed. | Ensure the Runner (Render worker) is **Running** and has no crashes. Check Render worker logs; increase heartbeat interval or fix the job so it doesn’t run too long. |
| **LLM_GATEWAY_URL is not set** / **Neither LLM_GATEWAY_URL nor OPENAI_API_KEY** | The Runner needs an LLM endpoint to run copy_generate, email_generate, etc. | On the **Render worker** (e.g. `ai-factory-runner-staging`), set **Environment**: either `LLM_GATEWAY_URL` = your gateway URL (e.g. LiteLLM) or `OPENAI_API_KEY` = your OpenAI key. Alternatively set `LLM_GATEWAY_URL` on the **Control Plane** and use self-heal (see [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md)) so the worker is synced and restarted. See [RUNNERS_DEPLOYMENT.md](RUNNERS_DEPLOYMENT.md). |
| **LLM gateway error 404** | The gateway URL is wrong or the gateway is down. | Check `LLM_GATEWAY_URL` on the worker; open the URL in a browser or `curl <url>/health`. Fix the URL or bring the gateway up. |
| **current transaction is aborted** | A DB statement failed and a later statement ran in the same transaction (bug, now fixed with savepoints). | Ensure Control Plane and Runner are on the **latest deploy** from `main` (plan-compiler and scheduler use savepoints). Redeploy the Control Plane on Render if needed. Old runs will still show this until new runs are created. |

After fixing env or redeploying, start a **new run** (or use Re-run on a failed run) to verify.

### Runner not claiming jobs
1. **Same DB as Control Plane:** Start both from the same repo root so they load the same `.env` and `DATABASE_URL`. If the Runner uses a different DB, it will never see queued jobs.
2. Check Runner logs for errors (and for “Executing job” when work exists).
3. Verify `DATABASE_URL` is correct.
4. Check `worker_registry` table for Runner heartbeat.
5. Check `job_runs` for queued jobs: `SELECT * FROM job_runs WHERE status = 'queued' LIMIT 5`.
6. Check `job_claims` for stale leases: `SELECT * FROM job_claims WHERE released_at IS NULL AND heartbeat_at < now() - interval '2 minutes'`.
7. Restart Runner if needed.

### No artifacts on runs (e.g. landing page “Open preview” missing)
Runs exist and jobs may be queued, but the Artifacts tab stays empty. Usually the same root cause as “Runner not claiming jobs” or the worker has wrong env so jobs never complete.

**Self-heal:** When `ENABLE_SELF_HEAL=true` and `RENDER_API_KEY` are set on the Control Plane, it auto-detects runs with no artifacts (via API) and remediates (sync worker env, create new run). See [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md). Use the steps below when self-heal is disabled or for manual fix.

1. **Render worker env (most common):** In Render Dashboard open the **worker** service (e.g. `ai-factory-runner-staging`), not the API. Under **Environment** set the same values as the API:
   - `DATABASE_URL` — same Supabase connection string as the Control Plane API.
   - `CONTROL_PLANE_URL` — e.g. `https://ai-factory-api-staging.onrender.com`.
   - `LLM_GATEWAY_URL` — e.g. your LiteLLM/gateway URL.
   Save; Render redeploys the worker. Wait until the worker is **Running** and healthy.
2. **Verify runner is connected:** Check `worker_registry` for recent heartbeats; check Runner logs for “Executing job” and no repeated “No eligible job” when there is work.
3. **Re-run or start a new run:** In Console open the run → **Re-run**, or create a new initiative → Compile plan → Start run. Then open the run → **Artifacts** tab; after jobs complete you should see artifacts and “Open preview” for landing_page.
4. **If still no artifacts:** See “Runner not claiming jobs” above and [RUNNERS_DEPLOYMENT.md](RUNNERS_DEPLOYMENT.md). For a structured debug (hypotheses + logs), see [DEBUG_ARTIFACTS_HYPOTHESES.md](DEBUG_ARTIFACTS_HYPOTHESES.md) (used with Cursor debug-mode instrumentation).

### Log-based validations (Validations tab)
When log mirror is enabled (`ENABLE_RENDER_LOG_INGEST=true` or one-off **Refresh logs** on a run), the Control Plane parses runner log messages and inserts **runner_log_check:*** validations (e.g. `runner_log_check:logo_missing`, `runner_log_check:campaign_copy_missing`). These are **visibility only**: they show up in the run’s Validations tab so you see "logo not loading" or "campaign copy not found" without pasting logs. **No automatic fix:** self-heal does not change brand data or templates. Fix the cause manually (e.g. set logo URL in Brand edit, fix campaign prompt) and **Re-run** the run. Optional future: suggested-fix links in the UI or webhook/ticket.

### Evals failing in CI
1. Check GitHub Actions → "Evals (Prompt CI)" workflow.
2. Download eval report artifact for details.
3. If score is below threshold: review which test cases failed, update prompts or assertions.
4. If API key issue: verify `OPENAI_API_KEY` secret is set in GitHub repo settings.

### MCP server unreachable
1. Check MCP server status externally.
2. Use `POST /v1/mcp_servers/:id/test` to verify connectivity.
3. If stdio server: verify Runner has permissions to spawn the process and the command is installed.
4. Check Runner logs for MCP timeout or connection errors.

### Cache issues
1. Check Redis connectivity: `redis-cli -u $REDIS_URL ping`.
2. If Redis is down, gateway falls back to in-memory (check logs).
3. To clear cache: `redis-cli -u $REDIS_URL FLUSHDB`.
4. Monitor hit rate via Langfuse trace metadata (look for `cache_hit` field).

### Cost spike
1. Check `/admin/costs` page for usage by tier and job type.
2. Check `GET /v1/usage/by_model` for which model is driving cost.
3. Run optimizer: `CONTROL_PLANE_API=... npx tsx scripts/optimizer.ts` to get routing suggestions.
4. Apply suggested routing policies to shift traffic to cheaper models.

### Self-healing not triggering
1. Verify `ENABLE_SELF_HEAL=true` is set in Control Plane env.
2. Verify GitHub webhook is configured: repo Settings → Webhooks → `POST /v1/webhooks/github`.
3. Check webhook delivery logs in GitHub for recent events.
4. Verify the `fix-me` label exists on the issue/PR.

## QA release checklist

- [ ] `tsc --noEmit` passes (root project)
- [ ] Console `npm run lint` passes
- [ ] Console `npm run build` succeeds
- [ ] Promptfoo evals pass locally: `npx promptfoo@latest eval`
- [ ] E2E smoke tests pass: `npx playwright test` (in console/)
- [ ] Migrations applied to staging: `psql $DATABASE_URL -f supabase/migrations/...`
- [ ] Control Plane health: `curl /health/db`
- [ ] Gateway health: `curl /health`
- [ ] Console loads in browser
- [ ] Admin pages load without errors
- [ ] No secrets committed (check `.env.example` vs `.env`)
