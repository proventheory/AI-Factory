# Runbook: Console shows "relation initiatives does not exist" or "Control Plane database schema is missing"

When the Console shows **"Control Plane database schema is missing"** (or `relation "initiatives" does not exist` on Initiatives, Email Design Generator, Launches, Cost Dashboard, **Analytics**, or `relation "webhook_outbox" does not exist` on Webhook Outbox), the **database the Control Plane talks to** is missing schema.

---

## Self-heal: you should not run migrations manually

The system **self-heals** schema on every Control Plane start:

- **Render (production):** The image is built from repo-root **`Dockerfile.control-plane`**. Its **CMD** runs `node scripts/run-migrate.mjs` then `node dist/control-plane-bundle.js`. So every deploy/restart applies migrations using the **same `DATABASE_URL`** the API uses. No manual step.
- **In-process:** The Control Plane bundle also calls `runMigrationsOnStartup()` before starting the API, so even if the CMD were changed, migrate would still run with `process.env.DATABASE_URL`.

You should **not** need to run `node scripts/run-migrate.mjs` yourself or copy `DATABASE_URL` from Render. If you see schema or webhook_outbox errors after a deploy, treat it as a deploy/configuration issue (see below), not as a request to run migrate locally.

---

## If you still see schema errors

1. **Render must use the default CMD**  
   In Render → Control Plane service → **Settings**: do not set a custom **Start Command** that skips the migrate step. The image CMD is `sh -c "node scripts/run-migrate.mjs && exec node dist/control-plane-bundle.js"`.

2. **Same DB for migrate and API**  
   The service must have **`DATABASE_URL`** set in the Render Environment. Migrate and the API both use that single env var, so they always target the same database.

3. **Redeploy**  
   Trigger a redeploy so the service restarts and runs migrate again. After that, Console (Initiatives, Launches, Analytics, Webhook Outbox, etc.) should load without schema errors.

4. **Verify**  
   Initiatives, Cost Dashboard, Launches, Analytics, Webhook Outbox, and Secrets should load (lists may be empty). If they do not, check Render build logs to confirm the image includes `scripts/run-migrate.mjs`, `schemas/`, and `supabase/` (root `Dockerfile.control-plane` copies them from the builder).

---

## New wizard / pipeline (ads, SEO migration, etc.)

When you add a **new** wizard or pipeline that needs DB tables: (1) Add the migration file under `supabase/migrations/`. (2) **Add an entry to the `migrations` array in `scripts/run-migrate.mjs`** (same PR). (3) Run `npm run verify:migrations`. On the next Control Plane deploy, migrations run automatically and your new wizard has its schema. If you add the migration file but forget to register it in run-migrate.mjs, the new tables will not exist after deploy. See **docs/HOW_TO_BUILD_NEW_PIPELINES.md** §5.

---

## If you use Supabase only (no run-migrate)

If you apply only Supabase migrations (e.g. via Supabase Dashboard or `supabase db push`), ensure the **core schema** is applied first (e.g. `schemas/001_core_schema.sql` and `002_state_machines_and_constraints.sql`), then all files in `supabase/migrations/` in order.
