# Enablement: environment variables that turn features on

Set these in `.env` (local), Render/Vercel env (deployed), or GitHub Actions secrets so the corresponding features are enabled.

---

## Feature toggles

| Variable | Where | Effect when set |
|----------|--------|-------------------|
| **ENABLE_SELF_HEAL** | Control Plane (Render or local) | `true` — Enables self-healing: no-artifacts remediation (scan + Render worker env fix), render-worker remediate, and GitHub webhook creating self-heal initiatives. Requires `RENDER_API_KEY` for Render MCP. See [RUNNERS_DEPLOYMENT.md](RUNNERS_DEPLOYMENT.md) and [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md). |
| **ENABLE_AUTO_REPAIR** | Control Plane | `true` — Enables Dev Kernel V1 auto-repair: every 5 min, process runs with failed job_runs and run subgraph_replay when policy allows; record resolution on success. See [GRAPH_ENGINE_AND_SELF_HEAL.md](GRAPH_ENGINE_AND_SELF_HEAL.md). |
| **OPTIMIZER_APPLY** | Runner / script env (when running optimizer) | `true` — Optimizer script applies routing/budget suggestions to the DB instead of only printing them. See [LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md) Phase 5. |
| **NEXT_PUBLIC_FEATURE_WEBHOOK_OUTBOX** | Console (Vercel or local) | `false` — Hides the "Webhook Outbox" nav item. Default (unset) = visible. Set to `false` only if you want to hide it. |

---

## Required for features to work

| Variable | Needed for |
|----------|------------|
| **RENDER_API_KEY** | Self-heal no-artifacts remediation (Control Plane calls Render API to fix worker env). Set in Control Plane env. |
| **LLM_GATEWAY_URL** or **OPENAI_API_KEY** | Runners: LLM job types (copy_generate, plan_compile, etc.). |
| **DATABASE_URL** | Control Plane and Runner: same DB so runners see jobs. |
| **CONTROL_PLANE_URL** | Runner | Control Plane base URL (e.g. `http://localhost:3001`). Used to call `POST /v1/job_failures` on job failure so control-plane can classify and record incident_memory. |
| **SENTRY_DSN** | Optional: error reporting in Control Plane, Runner, Console. |

---

## Quick reference

- **Self-heal:** `ENABLE_SELF_HEAL=true` + `RENDER_API_KEY` in Control Plane.
- **Auto-repair (Dev Kernel V1):** `ENABLE_AUTO_REPAIR=true` in Control Plane; Runner needs `CONTROL_PLANE_URL` so job failures are sent to `POST /v1/job_failures`.
- **Optimizer to apply changes:** `OPTIMIZER_APPLY=true` when running `npm run optimizer`.
- **Hide Webhook Outbox in Console:** `NEXT_PUBLIC_FEATURE_WEBHOOK_OUTBOX=false` in Console env.
