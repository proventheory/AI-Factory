# Evolution Loop V1 — Operational Proof

**Principle:** "Exists in repo" and "runs successfully against real control-plane + DB" are not the same. The evolution loop is **fully complete** only when smoke passes in a **live** environment.

## 1. Via API (primary)

Run the smoke script against the **live** Control Plane:

```bash
CONTROL_PLANE_API=https://ai-factory-api-staging.onrender.com node scripts/evolution-smoke.mjs
```

For local (after restarting control plane so it loads evolution routes):

```bash
CONTROL_PLANE_API=http://localhost:3001 node scripts/evolution-smoke.mjs
```

**What it does:** Health → GET /v1/evolution/targets → POST mutation → POST experiment → POST experiments/:id/decide. All must succeed against the same host + DB.

**Manual checks (optional):**

- `GET /v1/evolution/targets` — list evolution targets (e.g. 5 for deploy_repair)
- `GET /v1/evolution/mutations`, `GET /v1/evolution/experiments`, `GET /v1/evolution/scoreboard`

## 2. Via MCP

- **Render MCP** (`user-render`): `get_service` with `serviceId: srv-d6ka7mhaae7s73csv3fg` (ai-factory-api-staging). Confirms the service is live and returns `url` (e.g. `https://ai-factory-api-staging.onrender.com`). The same host serves `/health` and `/v1/evolution/*`.
- There is no dedicated "Control Plane API" MCP; evolution is exercised via the smoke script or curl/fetch against the Control Plane URL.

## 3. Via webhooks

- **Evolution has no dedicated webhook.** It is **API-driven** (POST mutations, POST experiments, POST decide). The same Control Plane that receives **Vercel** (`POST /v1/webhooks/vercel`) and **GitHub** (`POST /v1/webhooks/github`) webhooks also serves `/v1/evolution/*`. So the live env that passes evolution smoke is the same one that handles deploy and GitHub events; no extra webhook integration is required for evolution.

## Checklist (operational proof)

| Check | How to verify |
|-------|----------------|
| Smoke passes against **live** Control Plane + DB | Run `evolution-smoke.mjs` with staging (or prod) URL |
| Evolution API reachable at same host as /health | Smoke uses same base URL for health and evolution |
| MCP: Render service live | Render MCP `get_service` for ai-factory-api-staging |
| Webhooks | Evolution is API-only; same host as Vercel/GitHub webhooks |

See also: [EVOLUTION_LOOP_V1.md](EVOLUTION_LOOP_V1.md), [.cursor/plans/evolution_loop_v1_relevance_and_estimate_6a891ee9.plan.md](../.cursor/plans/evolution_loop_v1_relevance_and_estimate_6a891ee9.plan.md) §15.
