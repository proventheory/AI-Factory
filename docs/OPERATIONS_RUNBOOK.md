# AI Factory Operator Runbook

**Start here** when something breaks, before/after a migration, or when you need the mental model for **commands and APIs** (not just the Vercel URL). The Console (**ProfessorX**) is one control surface; many operations are done via CLI, Control Plane API, and runbooks.

---

## Commands at a glance

| What | Command or API |
|------|----------------|
| **Migrations** | `npm run db:migrate` (uses `scripts/run-migrate.mjs`; set `DATABASE_URL`). Runner also runs this on startup. |
| **Verify migrations registered** | `npm run verify:migrations` — fails if any `supabase/migrations/*.sql` is missing from `run-migrate.mjs`. Run before every PR that adds migrations. |
| **Health** | Control Plane: `GET /health`, `GET /health/db`, `GET /v1/health`. |
| **Lineage** | `GET /v1/graph/lineage/:artifactId` — declared producer + observed consumers. |
| **Capability resolve** | `GET /v1/capability/resolve?produces=copy` — which operator produces that artifact type. |
| **Run by artifact type** | `POST /v1/runs/by-artifact-type` body `{ produces: "copy" }` — resolve → create run → runner produces artifact. |
| **Deploy staging** | From **repo root:** `node scripts/render-trigger-deploy.mjs --staging` (loads `RENDER_API_KEY` from `.env`). Use `--staging --clear` to clear build cache. Migrations run automatically on Control Plane start; no need to run migrate after deploy. |
| **Deploy staging + wait (optional)** | From **repo root:** `node --env-file=.env scripts/deploy-staging-and-migrate.mjs` — triggers staging deploy, waits for live, optionally runs migrate. Use `--no-wait` to skip wait; `--clear` to clear build cache. Only run migrate manually if you need to target a DB that the Control Plane is not using. |
| **Commit and push (agent)** | From **repo root:** `node scripts/git-commit-and-push.mjs [message]` or `GIT_COMMIT_MESSAGE="…" node scripts/git-commit-and-push.mjs`. Push requires GitHub auth (**GITHUB_TOKEN** or SSH). Agents use this to ship changes without asking the user to push. |
| **Deploy Console (Vercel)** | Console is on Vercel. Push to `main` to trigger auto-deploy, or use Vercel Dashboard → Project → Deployments → Redeploy. No script in repo; use Git push or Vercel UI. |
| **Self-heal (local)** | `npm run self-heal` (see [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md)). |
| **Migrations (autonomous)** | Control Plane runs `node scripts/run-migrate.mjs` on **every startup** (Docker CMD). No manual step after deploy if the Control Plane starts successfully. |

---

## Self-heal: required tokens (every project / brand)

**Control Plane** must have these set so the deploy-failure loop and Vercel self-heal run: **ENABLE_SELF_HEAL**, **RENDER_API_KEY**, **RENDER_STAGING_SERVICE_IDS**, and (for Vercel) **VERCEL_TOKEN** or **VERCEL_API_TOKEN** (same token as Terraform), **VERCEL_PROJECT_IDS** or projects registered via **POST /v1/vercel/register**. When you **launch a new project** with AI Factory, pass **projectId** (and optional **teamId**) in the build spec `spec` or in the launch action body so the project is **automatically** registered for self-heal. See **[SELF_HEAL_REQUIRED_ENV.md](SELF_HEAL_REQUIRED_ENV.md)** for the full checklist and how new projects get tokens/variables established. **If a failed deploy (Render or Vercel) isn't self-healing,** check that the provider's failure status is in our list: **[SELF_HEAL_PROVIDER_STATUS_REFERENCE.md](SELF_HEAL_PROVIDER_STATUS_REFERENCE.md)** (canonical list; add any missing status there and in code). **To verify what each system actually returns:** run `node --env-file=.env scripts/verify-provider-status-values.mjs` (calls Render and Vercel APIs and prints status/state values).

**Terraform (infra/):** Terraform still provisions **Supabase** (staging + optional prod) and **Vercel** (Console project + env vars). It reads **VERCEL_API_TOKEN** and **SUPABASE_ACCESS_TOKEN** from the environment. The Control Plane and `scripts/set-render-vercel-self-heal-env.mjs` accept **VERCEL_API_TOKEN** as well as **VERCEL_TOKEN**, so the same token in `.env` works for both Terraform and deploy-failure self-heal. Run Terraform from `infra/` with env loaded (e.g. `export VERCEL_API_TOKEN=...` or `node --env-file=../.env` in a wrapper) so your AI Factory token is used. See [infra/README.md](../infra/README.md).

---

## How self-heal and migrations run without you

- **Deploy-failure self-heal:** The Control Plane starts a **5‑minute loop** that checks Render (api, gateway, runner) and Vercel projects. If the latest deploy is failed or canceled, it triggers a redeploy (up to 2× per commit, then creates an initiative). This loop only runs when **ENABLE_SELF_HEAL**, **RENDER_API_KEY**, and **RENDER_STAGING_SERVICE_IDS** are set on the Control Plane. So once the Control Plane is live, you don’t need to manually redeploy failed staging services.
- **Migrations:** On every **Control Plane** container start, the Docker CMD runs `node scripts/run-migrate.mjs` then starts the API. So every deploy of the Control Plane applies pending migrations to the same DB the API and runner use. No separate “run migrate” step after deploy.

---

## Playbooks

### When a pipeline run fails

1. **Doctor / bundle:** Use Control Plane and runner state to build a **debug bundle** (run, job_runs, artifacts, tool_calls, lineage). Give Cursor (or your repair process) the bundle instead of raw logs.
2. **Repair plan:** Use `GET /v1/deploy_events/:id/repair_plan` when the failure is deploy-related; or follow self-heal/repair docs.
3. **Replay:** After fixing, rerun or use subgraph replay as per plan.

**Runbooks:** [runbooks/render-staging-failed-deploy-and-duplicate-runner.md](runbooks/render-staging-failed-deploy-and-duplicate-runner.md) (Render failures), [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md) (self-heal paths). **Test self-heal:** [runbooks/self-heal-test.md](runbooks/self-heal-test.md) (break Vercel/Render on purpose, trigger scan, verify migration-on-startup).

### Before/after migrations

1. **Before:** Every new migration file must be in `scripts/run-migrate.mjs` in the same PR. Run `npm run verify:migrations`. **New wizards/pipelines (ads, SEO, etc.):** register their migration in run-migrate.mjs so the next Control Plane deploy runs it automatically (self-heal).
2. **Apply:** Control Plane runs migrate on every start. For a DB the Control Plane does not use (e.g. local dev), run `DATABASE_URL=<that_db> npm run db:migrate` once.
3. **After (large deploy):** Use [runbooks/large-deploy-verification.md](runbooks/large-deploy-verification.md) — tables present, runner migrate→start, lineage API, capability resolver, capability loop. This is **Gate B** for the graph engine; see [GRAPH_ENGINE_IMPLEMENTATION_STATUS.md](GRAPH_ENGINE_IMPLEMENTATION_STATUS.md).

**Runbooks:** [runbooks/console-db-relation-does-not-exist.md](runbooks/console-db-relation-does-not-exist.md) (Console "relation does not exist"), [runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md) (data safety).

### Vercel deployment stuck in Error (Console or other project)

The screenshot you see is **Vercel** (Console), not Render. Both have self-heal, but they use different env and project lists.

- **Render:** When a Render service (api, gateway, runner) has a failed/canceled deploy, the Control Plane **does** self-heal: every 5 minutes it checks and triggers a redeploy — **but only if** the Control Plane (ai-factory-api-staging) has **`ENABLE_SELF_HEAL=true`**, **`RENDER_API_KEY`** (so it can call Render API), and **`RENDER_STAGING_SERVICE_IDS`** (comma-separated api, gateway, runner service IDs). If any of these are missing on the Control Plane, the scan does nothing. One-shot to sync from repo: `node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs` (pushes ENABLE_SELF_HEAL, RENDER_API_KEY, RENDER_STAGING_SERVICE_IDS, VERCEL_PROJECT_IDS, and VERCEL_TOKEN if in .env).
- **Vercel:** The same idea applies to Vercel: every 5 minutes the Control Plane checks **configured Vercel projects** and, if the latest deploy is ERROR or CANCELED, it triggers a redeploy. For that to run you need on the **Control Plane** (the same one your Console talks to):
  - `ENABLE_SELF_HEAL=true`
  - `VERCEL_TOKEN` set
  - The Console (or this project) in the project list: either **`VERCEL_PROJECT_IDS`** (or `VERCEL_PROJECT_ID`) in env, or the project registered via **POST /v1/vercel/register** (which also adds it to the DB table `vercel_self_heal_projects`).

**If you don't see an update on Vercel** after a failure:

1. **Check Control Plane env** (Render dashboard for ai-factory-api-staging or prod): `ENABLE_SELF_HEAL`, `VERCEL_TOKEN`, and either `VERCEL_PROJECT_IDS` (Console project ID/slug) or that you called **POST /v1/vercel/register** for the Console project once.
2. **If you use staging:** Ensure the **staging** Control Plane has these set (Console might be pointing at staging).
3. **Redeploy limit:** After **2 redeploys** for the same commit, the Control Plane stops and creates a **self-heal initiative** instead of redeploying again. Check **Initiatives** in the Console for something like "Vercel deploy repeatedly failing".
4. **Manual fix now:** In Vercel Dashboard → Deployments → open the failed deployment → **Redeploy**, or push a new commit to trigger a fresh deploy.

See [VERCEL_SELF_HEAL.md](VERCEL_SELF_HEAL.md) for register API and webhook setup.

### Artifact and lineage debugging

- **Lineage:** `GET /v1/graph/lineage/:artifactId` or Admin → Artifacts → open artifact. Shows who produced and who consumed.
- **Consumers:** Table `artifact_consumption`; populated by runner when a job run reads an artifact. Use in debug bundles or Console.

**Docs:** [CAPABILITY_GRAPH.md](CAPABILITY_GRAPH.md), [WHAT_YOU_CAN_DO_WITH_PROFESSORX.md](WHAT_YOU_CAN_DO_WITH_PROFESSORX.md) (§2b Graph and resolution).

---

## Mental model

- **State lives in Postgres** (initiatives, plans, runs, job_runs, artifacts, artifact_consumption, capability graph). Console and API are views and triggers.
- **Runner** claims jobs, runs handlers, writes artifacts and consumption records, runs migrations on startup.
- **Graph:** Artifact graph (lineage) + capability graph (resolve "who produces X"). No raw artifact body in LLM context — use `loadArtifactContentForLlm` (see CONTRIBUTING.md).

---

## Console and Cursor

- **Operator guide** in Console: `/operator-guide` — explains that workflow is driven by **commands and APIs**, not only the Vercel URL.
- **Cursor:** When debugging, provide a **structured debug bundle** (run + job_runs + artifacts + lineage) so the agent has a single case file. See runbooks and [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md).

---

## Secrets and scripts (security)

- **No secrets in repo.** Scripts under `scripts/*.mjs` (e.g. `set-render-vercel-self-heal-env.mjs`, `verify-render-control-plane-env.mjs`) **never** contain API keys, tokens, or DB URLs. They only read from **`process.env`** (e.g. `RENDER_API_KEY`, `VERCEL_TOKEN`). Keys stay in **`.env`** (local) or in **Render/Vercel dashboard** (server).
- **`.env` is gitignored.** It is never committed or pushed. Do not add `.env` to the repo. Use `node --env-file=.env scripts/...` when running from repo root so the script gets env vars from the local file.
- **On Render/Vercel,** env vars are set in the service project settings (or via Render API / MCP). The script source code is public (in GitHub); only the **values** are secret and live in env, not in the repo. So the .mjs files are safe to be on the server and on the web (e.g. in a public repo)—attackers cannot get keys from the script text.

---

## Index of runbooks

| Runbook | Purpose |
|---------|---------|
| [runbooks/large-deploy-verification.md](runbooks/large-deploy-verification.md) | Post-deploy checklist for artifact_consumption + capability graph; **Gate B sign-off**. |
| [runbooks/render-staging-failed-deploy-and-duplicate-runner.md](runbooks/render-staging-failed-deploy-and-duplicate-runner.md) | Render staging: failed deploy, 42P01, pipeline minutes, duplicate runner. |
| [runbooks/console-db-relation-does-not-exist.md](runbooks/console-db-relation-does-not-exist.md) | Console "relation does not exist" — run migrations against Control Plane DB. |
| [runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md) | Never leave Console empty; export/commit/repopulate; recovery. |
| [runbooks/phase-0-verification-baseline.md](runbooks/phase-0-verification-baseline.md) | Phase 0 verification baseline. |
| [VERCEL_SELF_HEAL.md](VERCEL_SELF_HEAL.md) | Vercel webhook + redeploy self-heal (Console and AI Factory–launched projects). |

See also: [DEPLOY_AND_DATA_SAFETY.md](DEPLOY_AND_DATA_SAFETY.md), [GRAPH_ENGINE_AND_SELF_HEAL.md](GRAPH_ENGINE_AND_SELF_HEAL.md).

---

## Autonomous ops: env checklist

For the system to **commit/push**, **deploy staging**, **migrate**, and **self-heal** without manual steps:

| Where | Variable | Purpose |
|-------|----------|---------|
| **Repo root `.env`** (local / agent) | `RENDER_API_KEY` | Deploy scripts and deploy-staging-and-migrate. |
| **Repo root `.env`** (local / agent) | `DATABASE_URL` | Migrate script and deploy-staging-and-migrate. |
| **Repo root `.env`** (local / agent) | `GITHUB_TOKEN` | So `git-commit-and-push.mjs` can push (HTTPS). Alternatively use SSH keys; no token needed. |
| **Render — ai-factory-api-staging** | `ENABLE_SELF_HEAL` | `true` = no-artifacts + deploy-failure self-heal + GitHub webhook initiatives. |
| **Render — ai-factory-api-staging** | `RENDER_API_KEY` | Same key as in `.env`; used by Control Plane for Render API. |
| **Render — ai-factory-api-staging** | `RENDER_STAGING_SERVICE_IDS` | `srv-d6ka7mhaae7s73csv3fg,srv-d6l25d1aae7s73ftpvlg,srv-d6oig7450q8c73ca40q0` so deploy-failure self-heal monitors api + gateway + runner. |
| **Render — ai-factory-api-staging** | `LLM_GATEWAY_URL` | Optional; pushed to runner during no-artifacts remediation. |
| **Supabase** | Connection string → `DATABASE_URL` | Used by Control Plane, Runner, and migrate script. |
| **Render — ai-factory-api-staging** | `VERCEL_TOKEN` | Optional. Enables **Vercel deploy-failure self-heal**: every 5 min, if a configured Vercel project's latest deploy is ERROR/CANCELED, trigger redeploy (like Render). Set with `VERCEL_PROJECT_IDS` (or `VERCEL_PROJECT_ID`). |
| **Render — ai-factory-api-staging** | `VERCEL_PROJECT_IDS` or `VERCEL_PROJECT_ID` | Comma-separated Vercel project IDs (or single ID) to monitor for deploy-failure. Use Console project + any AI Factory–launched sites. Optional `VERCEL_TEAM_ID` for team-scoped projects. |
| **Vercel (new project)** | **100% automatic:** Call **POST /v1/vercel/register** with `{ "projectId": "<id>", "teamId": "<optional>" }`. Control Plane creates the webhook on Vercel (via API) and adds the project to the redeploy scan. No Vercel dashboard or env edit needed. See [VERCEL_SELF_HEAL.md](VERCEL_SELF_HEAL.md). |
| **Vercel (Console)** | Console env (e.g. `NEXT_PUBLIC_*`, API URL) | Per [STAGING_RENDER_CHECKLIST](STAGING_RENDER_CHECKLIST.md). |

**RENDER_STAGING_SERVICE_IDS** is set on **ai-factory-api-staging** (via Render dashboard or MCP `update_environment_variables`). After changing env on Render, a new deploy is triggered automatically.
