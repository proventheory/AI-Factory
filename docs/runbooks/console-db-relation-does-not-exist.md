# Runbook: Console shows "relation initiatives does not exist" or "Control Plane database schema is missing"

When the Console shows **"Control Plane database schema is missing"** (or `relation "initiatives" does not exist` on Initiatives, Email Design Generator, Launches, Cost Dashboard, **Analytics**, or `relation "webhook_outbox" does not exist` on Webhook Outbox), the **database the Control Plane talks to** is missing schema.

---

## Why didn’t migrations just run on their own?

**Production image (`Dockerfile.control-plane`):** On each start, the process runs **`node dist/control-plane-bundle.cjs`**. That bundle **starts the HTTP API first** (so Render `/health` can pass), then runs **in-process SQL migrations** via `runSqlMigrations()` in `control-plane/src/index.ts`, using `scripts/sql-migrations.manifest.json` + `schemas/` + `supabase/` on disk. Those files are only present if the image was **built with Docker context = repo root (`.`)** (`COPY` in `Dockerfile.control-plane`).

- If Render used a **narrow build context** (e.g. Dashboard **Root Directory** = `control-plane`, or context = `control-plane/` only), the image may omit `scripts/` / `supabase/` — migrations throw **“Missing migration manifest”** or the Docker build should **fail** (see `RUN test -f scripts/sql-migrations.manifest.json` in `Dockerfile.control-plane`).
- If **`SKIP_STARTUP_MIGRATIONS=true`** is set, startup migrations are skipped on purpose.
- If **Start Command** / **Docker Command** in Render overrides the image CMD with something that never runs the control-plane entrypoint, migrations never run.

**Preferred fix:** Use **`render.yaml`** (`dockerContext: .`, `dockerfilePath: ./Dockerfile.control-plane`) and redeploy. Legacy **`control-plane/Dockerfile`** (shell `run-migrate.mjs` before `node`) is an alternate path only when built from **repo root**; do not use it with context = `control-plane/` only.

---

## Self-heal: you should not run migrations manually (when the build is correct)

The system **self-heals** schema on every Control Plane start **when** the service uses **`Dockerfile.control-plane`** built from **repo root**:

- After the API is listening, **`runMigrationsOnStartup()`** runs the same manifest-driven SQL as `scripts/run-migrate.mjs`, using **`DATABASE_URL`** (or optional **`DATABASE_URL_MIGRATE`** for direct DDL).
- Every deploy/restart reapplies migrations (idempotent skips for objects that already exist).

You should **not** need to run migrations yourself once the Render build is fixed. If you see schema errors after a deploy, treat it as a build/configuration issue (see below) or use the one-time migrate (see §4).

---

## Why self-heal might not be running

Self-heal only runs if the image contains **`scripts/sql-migrations.manifest.json`**, **`schemas/`**, and **`supabase/`** (repo-root Docker build).

- **Root Directory** set to `control-plane` in the Dashboard (or any context that omits repo-root `scripts/`) breaks **`Dockerfile.control-plane`** — build should fail at `RUN test -f scripts/...` or runtime fails with missing manifest.
- **Fix (choose one):**
  - **Apply the repo Blueprint (recommended):** In Render Dashboard → **Blueprints** → open the blueprint linked to this repo → **Apply** (or **Sync**). The repo’s **`render.yaml`** sets `dockerContext: .`, `dockerfilePath: ./Dockerfile.control-plane`, and leaves **Start Command** / **Docker Command** empty. The bundle in **`Dockerfile.control-plane`** includes `scripts/`, `schemas/`, and `supabase/`; **migrations run in-process** after the API listens (`control-plane/src/index.ts`), not via a shell `node scripts/run-migrate.mjs` in CMD.
  - **Or set by hand:** In Render → your **Control Plane (API)** service → **Settings** → **Build & Deploy**:
    - **Root Directory:** leave **empty** (repo root). If this is set to `control-plane`, the Docker context is only that folder and the image will **not** contain `scripts/` or `supabase/` — builds should fail fast (see `Dockerfile.control-plane` `RUN test -f scripts/...`).
    - **Docker context:** repo root (`.`).
    - **Dockerfile path:** `./Dockerfile.control-plane`.
    - **Start Command:** empty (do not override CMD).
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
