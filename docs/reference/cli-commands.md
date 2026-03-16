# CLI commands and Control Plane RPCs

Quick reference for operator CLI-style commands and Control Plane API endpoints used in runbooks and automation.

---

## Repo root (npm / node)

| Command | Purpose |
|---------|---------|
| `npm run db:migrate` | Run all migrations (`scripts/run-migrate.mjs`). Requires `DATABASE_URL`. |
| `npm run verify:migrations` | Ensure every `supabase/migrations/*.sql` is in `run-migrate.mjs`. Run before PRs that add migrations. |
| `npm run doctor` | Health/state checks (project-specific). |
| `npm run self-heal` | Local self-heal loop (stash, branch, doctor, LLM patches). See [SELF_HEAL_HOW_TO_TRIGGER.md](../SELF_HEAL_HOW_TO_TRIGGER.md). |
| `npm run dev:control-plane` | Start Control Plane locally (e.g. port 3001). |
| `npm run dev:runner` | Start runner locally (polls DB, claims jobs). |

**Deploy staging:**  
`RENDER_API_KEY=xxx node scripts/render-trigger-deploy.mjs --staging`  
Optional: `--staging --clear` to clear build cache. See [runbooks/render-staging-failed-deploy-and-duplicate-runner.md](../runbooks/render-staging-failed-deploy-and-duplicate-runner.md).

---

## Control Plane API (REST)

Base URL: e.g. `https://ai-factory-api-staging.onrender.com` or `http://localhost:3001`.

### Health

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness. |
| GET | `/health/db` | DB connectivity. |
| GET | `/v1/health` | Versioned health. |

### Initiatives and plans

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/v1/initiatives` | List/create initiatives. |
| GET | `/v1/plans`, `/v1/plans/:id` | List plan, get plan by id. |
| POST | `/v1/initiatives/:id/plan` | Compile plan. |
| POST | `/v1/initiatives/:id/replan` | Replan. |

### Runs and artifacts

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/v1/runs` | List runs, create run. |
| GET | `/v1/runs/:id`, `/v1/runs/:id/artifacts`, `/v1/runs/:id/status` | Run detail, artifacts, status. |
| POST | `/v1/runs/:id/cancel`, `/v1/runs/:id/rerun` | Cancel, rerun. |
| POST | `/v1/runs/by-artifact-type` | Body `{ produces, initiative_id?, environment? }`. Resolve operator → create plan + run. |

### Graph and capability

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/graph/lineage/:artifactId` | Lineage: declared_producer, observed_consumers. |
| GET | `/v1/capability/resolve?produces=<type>&consumes=a,b` | Resolve operators that produce (and optionally consume) artifact types. |
| POST | `/v1/capability/resolve` | Body `{ produces, consumes? }`. Same as GET with body. |

### Admin / list

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/job_runs`, `/v1/artifacts`, `/v1/tool_calls`, `/v1/llm_calls` | List job runs, artifacts, tool calls, LLM calls. |
| GET | `/v1/usage` | Cost/usage. |
| GET | `/v1/releases` | Releases. |
| GET | `/v1/approvals/pending`, `/v1/approvals` | Pending approvals, list. |
| POST | `/v1/approvals` | Approve/reject. |

### Deploy and webhooks

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/deploy_events` | Record deploy event (optional `build_log_text`). |
| GET | `/v1/deploy_events/:id/repair_plan` | Suggested repair actions. |
| POST | `/v1/webhooks/github` | GitHub webhook (e.g. fix-me label → self-heal initiative). |
| POST | `/v1/webhooks/vercel` | Vercel deployment webhook (native payload). Normalizes to deploy_events; on failure creates self-heal initiative. |
| POST | `/v1/vercel/register` | Register a Vercel project for self-heal. Body: `{ "projectId": "<id>", "teamId": "<optional>" }`. Creates webhook on Vercel and adds project to redeploy scan (no manual Vercel or env steps). Use when launching a new project or connecting a domain. |

### MCP servers

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/mcp_servers` | List MCP server configs (name, type, url_or_cmd, active). Query: `limit`, `offset`. |
| GET | `/v1/mcp_servers/:id` | Get one MCP server by id. |
| POST | `/v1/mcp_servers` | Create MCP server. Body: `{ name, server_type: "http"|"stdio", url_or_cmd, args_json?, env_json?, auth_header?, capabilities?, active? }`. |
| PATCH | `/v1/mcp_servers/:id` | Update MCP server (same fields as POST). |
| DELETE | `/v1/mcp_servers/:id` | Delete MCP server (header `x-role: admin`). |
| POST | `/v1/mcp_servers/:id/test` | Test connection (HTTP ping for http; optional connectivity check). |

Runners load config from `mcp_server_config` (or env `MCP_SERVERS_JSON`) and call MCP tools when executing jobs. Console: **MCP Servers** (`/mcp-servers`), **Admin → MCP Servers** for full CRUD.

---

See [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md), [STACK_AND_DECISIONS.md](../STACK_AND_DECISIONS.md) §3.1, [WHAT_YOU_CAN_DO_WITH_PROFESSORX.md](../WHAT_YOU_CAN_DO_WITH_PROFESSORX.md).
