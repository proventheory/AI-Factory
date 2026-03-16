# Runbook: Console shows "relation initiatives does not exist" or "Control Plane database schema is missing"

When the Console shows **"Control Plane database schema is missing"** (or `relation "initiatives" does not exist` on Initiatives, Email Design Generator, Launches, Cost Dashboard, **Analytics**, or `relation "webhook_outbox" does not exist` on Webhook Outbox), the **database the Control Plane talks to** is missing schema.

---

## Why didn’t migrations just run on their own?

Migrations run **only when** the Control Plane container starts and runs the **image CMD** that runs `node scripts/run-migrate.mjs` then the app. That CMD (and the migrate script + SQL files) only exist in an image that was **built with Docker context = repo root** and that copies `scripts/`, `schemas/`, and `supabase/` into the image.

- If Render used **`control-plane/Dockerfile`** with **build context = `control-plane/`** (the default when Dockerfile path is under a subdir), the image has no `scripts/` or `supabase/` and only runs `node dist/index.js`, so no migration step ever runs.
- If a **custom Start Command** was set and skips the migrate script, the DB never gets schema.

So self-heal only works when the image is built with **Docker context = repo root (`.`)**. Both **`Dockerfile.control-plane`** and **`control-plane/Dockerfile`** are written to assume context = repo root and to run migrate then the app. Fix the build (set context = `.` and use either Dockerfile; see below), then redeploy so the next start runs migrations.

---

## Self-heal: you should not run migrations manually (when the build is correct)

The system **self-heals** schema on every Control Plane start **when** the service uses the migrate-enabled image:

- **Render:** The image must be built with **Docker context = repo root (`.`)**. Use either **`Dockerfile.control-plane`** (repo root) or **`control-plane/Dockerfile`** (path `control-plane/Dockerfile` with context `.`). Both images run migrate then the API on every start. Every deploy/restart applies migrations using the same `DATABASE_URL` as the API. No manual step.
- **In-process:** The Control Plane bundle also calls `runMigrationsOnStartup()` before starting the API when the script and migration files exist in the image (i.e. when the image was built with context = repo root).

You should **not** need to run migrations yourself once the Render build is fixed. If you see schema errors after a deploy, treat it as a build/configuration issue (see below) or use the one-time migrate (see §4).

---

## Why self-heal might not be running

Self-heal only runs if the Control Plane image is built with **Docker context = repo root (`.`)** so the image contains `scripts/`, `schemas/`, and `supabase/` and the CMD runs migrate then the API.

- If your Render service uses **`control-plane/Dockerfile`** with **build context = `control-plane/`** (Render’s default when the Dockerfile path is under a subdir), the image has no migration files and does not run them. The API starts with `node dist/index.js` only.
- **Fix (choose one):**
  - **Apply the repo Blueprint:** In Render Dashboard → **Blueprints** → open the blueprint linked to this repo → **Apply**. The repo’s **`render.yaml`** sets `dockerContext: .`, `dockerfilePath: ./Dockerfile.control-plane`, and no Start Command, so the image runs migrate then the API.
  - **Or set by hand:** In Render → your **Control Plane (API)** service → **Settings** → **Build & Deploy**: set **Docker context** to repo root (`.`), set **Dockerfile path** to either `Dockerfile.control-plane` or `control-plane/Dockerfile`, and leave **Start Command** empty so the image CMD runs migrate then the API.
- Then **redeploy** (e.g. `node scripts/render-trigger-deploy.mjs --staging` or **Redeploy** in Render). After the new deploy, migrations run on startup and the Console should load.

**Built from GitHub:** When Render is connected to your repo and builds on push, it clones the repo and runs Docker with the service’s **Docker context** and **Dockerfile path**. The Blueprint (`render.yaml`) sets `dockerContext: .` and `dockerfilePath: ./Dockerfile.control-plane`, so the context is the **full repo** and the image includes migrations. Leave **Root Directory** blank for the Control Plane (API) service—if you set it to `control-plane`, the build context becomes that folder only, the image won’t have `scripts/` or `supabase/`, and migrations won’t run. No extra step is needed for “build from GitHub”; just ensure the service uses context = repo root and the correct Dockerfile.

## If you still see schema errors

1. **Render must use context = repo root and do not override Start Command**  
   See **Why self-heal might not be running** above. Set Docker context to `.` and use either `Dockerfile.control-plane` or `control-plane/Dockerfile`.

2. **Same DB for migrate and API**  
   The service must have **`DATABASE_URL`** set in the Render Environment. Migrate and the API both use that single env var, so they always target the same database.

3. **Redeploy**  
   Trigger a redeploy so the service restarts and runs migrate again. After that, Console (Initiatives, Launches, Analytics, Webhook Outbox, etc.) should load without schema errors.

4. **One-time manual migrate (if Console and API share a DB)**  
   If you can’t change the Render build yet: from your machine with **the same `DATABASE_URL`** the API uses (e.g. in `.env`), run:  
   **`npm run db:migrate:console`**  
   (or `node scripts/one-time-migrate-for-console.mjs`). Then refresh the Console. Prefer fixing the Render build so future deploys self-heal.

5. **Verify**  
   Initiatives, Cost Dashboard, Launches, Analytics, Webhook Outbox, and Secrets should load (lists may be empty). If they do not, check Render build logs to confirm the image was built with context = repo root and includes `scripts/run-migrate.mjs`, `schemas/`, and `supabase/`.

---

## New wizard / pipeline (ads, SEO migration, etc.)

When you add a **new** wizard or pipeline that needs DB tables: (1) Add the migration file under `supabase/migrations/`. (2) **Add an entry to the `migrations` array in `scripts/run-migrate.mjs`** (same PR). (3) Run `npm run verify:migrations`. On the next Control Plane deploy, migrations run automatically and your new wizard has its schema. If you add the migration file but forget to register it in run-migrate.mjs, the new tables will not exist after deploy. See **docs/HOW_TO_BUILD_NEW_PIPELINES.md** §5.

---

## If you use Supabase only (no run-migrate)

If you apply only Supabase migrations (e.g. via Supabase Dashboard or `supabase db push`), ensure the **core schema** is applied first (e.g. `schemas/001_core_schema.sql` and `002_state_machines_and_constraints.sql`), then all files in `supabase/migrations/` in order.
