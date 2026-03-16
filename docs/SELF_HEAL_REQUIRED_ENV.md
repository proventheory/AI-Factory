# Self-heal: required tokens and variables

**Every project and brand** that uses AI Factory for deploys (Render, Vercel) should have the Control Plane configured so deploy-failure self-heal runs. When you **launch a new project** with AI Factory, the system can auto-register Vercel projects for self-heal; the **Control Plane** must have these tokens set once.

---

## Control Plane (Render) — set once

On **ai-factory-api-staging** and **ai-factory-runner-staging** (and optionally **ai-factory-api-prod** with `--prod`), set these in the Render dashboard or run `node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs` from repo root (the script pushes to staging API + staging runner; add `--prod` and `RENDER_PROD_API_SERVICE_ID` to also push to prod):

| Variable | Required for | Purpose |
|----------|----------------|--------|
| **ENABLE_SELF_HEAL** | All self-heal | `true` — enables deploy-failure scan, no-artifacts remediation, Vercel redeploy scan. |
| **RENDER_API_KEY** | Render deploy-failure | So the Control Plane can call Render API to list deploys and trigger redeploys for api/gateway/runner. |
| **RENDER_STAGING_SERVICE_IDS** | Render deploy-failure | Comma-separated service IDs for api, gateway, runner (e.g. `srv-xxx,srv-yyy,srv-zzz`). Set on both **Control Plane** and **Runner** so when api-staging is down, the runner’s 5‑min scan can still trigger redeploys. |
| **VERCEL_TOKEN** (or **VERCEL_API_TOKEN**) | Vercel deploy-failure | So the Control Plane can list deployments and trigger redeploys. Same token as Terraform (`infra/` uses `VERCEL_API_TOKEN`); you can set either name in `.env` and both Terraform and self-heal will use it. |
| **VERCEL_PROJECT_IDS** | Vercel (env list) | Optional. Comma-separated Vercel project IDs to monitor (e.g. Console). Projects can also be added via **POST /v1/vercel/register** (see below). |
| **CONTROL_PLANE_URL** | Vercel webhook | Base URL of the Control Plane (e.g. `https://ai-factory-api-staging.onrender.com`) so Vercel webhooks point to the right host. |

Without these, the **deploy-failure loop** (every 5 min) will not redeploy failed Render or Vercel builds.

### Allow self-heal to push fixes to the repo

When a deploy keeps failing because of a **code** issue (e.g. missing migration file), self-heal can create an initiative and run an LLM to produce a patch. By default that flow ends with a **PR** (issue_fix template). If you want the system to **apply the patch and push directly to main**, set:

| Variable | Where | Purpose |
|----------|--------|---------|
| **ALLOW_SELF_HEAL_PUSH** | Control Plane | `true` — use `deploy_fix` template (analyze → write_patch → push_fix) instead of `issue_fix` when a deploy has failed 2+ times for the same commit. |
| **GITHUB_TOKEN** | Runner | Token with push access to the repo (e.g. fine-grained repo token or `repo` scope). Required for the `push_fix` job to clone, apply patch, and push to `main`. |
| **GITHUB_REPOSITORY** | Runner | `owner/repo` (e.g. `proventheory/AI-Factory`). Used as clone target and push target. |

With these set, after 2 failed redeploys for the same commit the Control Plane creates an initiative with template **deploy_fix**. The Runner runs **analyze_repo** → **write_patch** → **push_fix**. The **push_fix** job clones the repo, applies the patch (including e.g. new migration stubs), commits, and pushes to `main`. The next Render deploy then picks up the new commit and can succeed.

**Security:** Only enable `ALLOW_SELF_HEAL_PUSH` if you accept automated pushes to `main` from the Runner. Use a token with minimal required scope.

**Staging down?** The scan runs on the Control Plane. When **ai-factory-api-staging** has a failed deploy, that service is not running, so it cannot trigger its own redeploy. **Patch:** set the same variables on **ai-factory-api-prod** so prod’s 5‑min scan triggers staging redeploys. One command (get prod service ID from Render Dashboard first):  
`RENDER_PROD_API_SERVICE_ID=srv-xxxx node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs --prod`  
See [runbooks/render-staging-failed-deploy-and-duplicate-runner.md](runbooks/render-staging-failed-deploy-and-duplicate-runner.md) (§ Why didn’t self-heal fix the failed deploy? / Patch).

---

## New project / new brand — what the system does automatically

When you **launch a project** with AI Factory and that project is on Vercel:

1. **Include `projectId` (and optional `teamId`) when creating a build spec or calling a launch action.**  
   - In **POST /v1/build_specs**, put `vercel_project_id` or `projectId` (and optionally `vercel_team_id` / `teamId`) in `spec`.  
   - In **POST /v1/launches/actions/:action**, send `projectId` (and optional `teamId`) in the body.  
   The Control Plane will **automatically** call the same logic as **POST /v1/vercel/register**: add the project to `vercel_self_heal_projects` and create the Vercel webhook (if `VERCEL_TOKEN` and `CONTROL_PLANE_URL` are set). So the new project is included in the 5‑minute redeploy scan and receives deployment webhooks.

2. **Or call POST /v1/vercel/register yourself** once per Vercel project:  
   `POST /v1/vercel/register` with body `{ "projectId": "<id>", "teamId": "<optional>" }`.

---

## Checklist for new projects / brands

- [ ] **Control Plane** has `ENABLE_SELF_HEAL`, `RENDER_API_KEY`, `RENDER_STAGING_SERVICE_IDS` set (so Render deploy-failure self-heal runs).
- [ ] **Control Plane** has `VERCEL_TOKEN` and `CONTROL_PLANE_URL` set (so Vercel redeploy and webhooks work).
- [ ] (Optional) **Control Plane** has `ALLOW_SELF_HEAL_PUSH=true` and **Runner** has `GITHUB_TOKEN` and `GITHUB_REPOSITORY=owner/repo` if you want self-heal to push deploy-fix patches to `main`.
- [ ] **Console** (Operator UI) is in the self-heal list: either in `VERCEL_PROJECT_IDS` or registered once via **POST /v1/vercel/register** with the Console’s Vercel project ID.
- [ ] **Each new AI Factory–launched Vercel project** is registered: either pass `projectId` (and optional `teamId`) in build_spec `spec` or in launch action body so it’s auto-registered, or call **POST /v1/vercel/register** once per project.

See also: [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) (autonomous ops env checklist), [VERCEL_SELF_HEAL.md](VERCEL_SELF_HEAL.md). **If a failed deploy isn't self-healing:** [SELF_HEAL_PROVIDER_STATUS_REFERENCE.md](SELF_HEAL_PROVIDER_STATUS_REFERENCE.md) lists which provider status values we remediate; add any missing value there and in code.
