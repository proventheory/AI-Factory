# Autonomous deploy and env

## Git and push

- **Commit and push on your own when shipping changes.** When the user asks to deploy, ship, or "push to GitHub" (or equivalent), run **`node scripts/git-commit-and-push.mjs [message]`** (or `GIT_COMMIT_MESSAGE="…" node scripts/git-commit-and-push.mjs`) from repo root so changes are committed and pushed without asking the user to push. Push requires GitHub auth: set **GITHUB_TOKEN** (HTTPS) or use SSH. See `docs/OPERATIONS_RUNBOOK.md` if push fails.

## Environment and secrets

- **Always use repo root `.env` for scripts.** Scripts in this repo (e.g. `scripts/render-trigger-deploy.mjs`, `scripts/run-migrate.mjs`) expect to run from repo root and load `.env` either via `import "dotenv/config"` or via `node --env-file=.env`. When you run deploy, migrate, or any script that needs `RENDER_API_KEY`, `DATABASE_URL`, etc., **run from repo root**; do not assume keys are "not set" without running with `.env` loaded.
- **Do not ask the user to "get a Render API key" or paste keys** when `.env` exists in the repo. Run the script from repo root (e.g. `node scripts/render-trigger-deploy.mjs --staging` or `node --env-file=.env scripts/render-trigger-deploy.mjs --staging`). If the script uses `dotenv/config`, it will load `.env` automatically when cwd is repo root.
- **Staging Control Plane URL** for Gate B / API checks: `https://ai-factory-api-staging.onrender.com` (unless overridden in docs or env).

## Deploy + migrate (one flow)

- **Full staging deploy and DB migrate:** Run **`node --env-file=.env scripts/deploy-staging-and-migrate.mjs`** from repo root. This triggers deploy for api + gateway + runner, waits for deploys to be live (or use `--no-wait` to skip wait), then runs `scripts/run-migrate.mjs` so Supabase migrations are applied. Use this when the user asks for "deploy and migrate" or "deploy staging and run migrations".

## Self-heal: provider status (so self-heal works without human intervention)

- **Do not assume** Render or Vercel status/state values. The Control Plane only remediates when the **exact** status the provider returns is in our code. If a failed deploy is not self-healing, or when you add a provider or change status logic:
  1. Run **`node --env-file=.env scripts/verify-provider-status-values.mjs`** from repo root. It calls the live APIs and prints the actual `status` (Render) and `state` (Vercel) returned.
  2. Open **`docs/SELF_HEAL_PROVIDER_STATUS_REFERENCE.md`** and the self-heal modules (`control-plane/src/deploy-failure-self-heal.ts`, `control-plane/src/vercel-redeploy-self-heal.ts`). If the API returns a failure value not in `FAILED_STATUSES` / `FAILED_STATES`, add it in code and in the reference doc, then deploy the Control Plane so the 5‑minute loop remediates it.
- This keeps self-heal correct for agents and for autonomous operation: the code and doc are updated from **actual API response**, not from assumption.

## Vercel and self-heal (100% automatic for new projects)

- **New Vercel project / new site / connect domain:** When the user (or the launch flow) adds a Vercel project, call **POST /v1/vercel/register** on the Control Plane with body `{ "projectId": "<vercel-project-id-or-slug>", "teamId": "<optional>" }`. This creates the webhook on Vercel and adds the project to the redeploy scan—no manual Vercel dashboard or env edit. See `docs/VERCEL_SELF_HEAL.md`.
- **Launching a project with AI Factory:** Include **projectId** (and optional **teamId**) in the build spec `spec` (e.g. `vercel_project_id` / `projectId`) or in the launch action body. The Control Plane **automatically** registers that Vercel project for deploy-failure self-heal (same as POST /v1/vercel/register). So every new project gets tokens/variables established for self-heal without a separate registration step. See `docs/SELF_HEAL_REQUIRED_ENV.md`.
- **Every project/brand:** Control Plane must have **ENABLE_SELF_HEAL**, **RENDER_API_KEY**, **RENDER_STAGING_SERVICE_IDS**, and (for Vercel) **VERCEL_TOKEN** and **CONTROL_PLANE_URL** set. Push from repo: `node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs`. See `docs/SELF_HEAL_REQUIRED_ENV.md` for the full checklist.

## MCP and APIs

- **Render:** You have MCP access to Render (list services, list deploys, update env, etc.). Use it to check deploy status, logs, or env. For **triggering a deploy**, the repo script `scripts/render-trigger-deploy.mjs` (with `.env` loaded) calls the Render API; use it from repo root.
- **Supabase / DB:** You have MCP access to Supabase and/or Neon. Use it for Gate B checks (e.g. "do tables `artifact_consumption`, `operators` exist?") when available. Otherwise run a small Node script from repo root with `DATABASE_URL` from `.env` (project has `pg` and `dotenv`).
- **Autonomous behavior:** When the user asks to "deploy and finish Gate B" or "run deploy", (1) commit and push if there are uncommitted changes (see Git and push above), (2) run the deploy (or use `deploy-staging-and-migrate.mjs` for deploy + migrate), then run the Gate B verification steps (tables, runner log, lineage API, capability resolver, capability loop) per `docs/runbooks/large-deploy-verification.md`. Do not stop at "RENDER_API_KEY is not set" if `.env` exists—use it.
