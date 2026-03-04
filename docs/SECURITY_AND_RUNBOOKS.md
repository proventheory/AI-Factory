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

### Runner not claiming jobs
1. Check Runner logs for errors.
2. Verify `DATABASE_URL` is correct.
3. Check `worker_registry` table for Runner heartbeat.
4. Check `job_runs` for queued jobs: `SELECT * FROM job_runs WHERE status = 'queued' LIMIT 5`.
5. Check `job_claims` for stale leases: `SELECT * FROM job_claims WHERE released_at IS NULL AND heartbeat_at < now() - interval '2 minutes'`.
6. Restart Runner if needed.

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
