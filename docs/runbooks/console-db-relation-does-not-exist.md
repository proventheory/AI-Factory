# Runbook: Console shows "relation initiatives does not exist" or "Control Plane database schema is missing"

When the Console shows **"Control Plane database schema is missing"** (or `relation "initiatives" does not exist` on Initiatives, Email Design Generator, Launches, Cost Dashboard), the **database the Control Plane talks to** is missing schema.

---

## Cause

- The Control Plane (e.g. on Render) uses `DATABASE_URL` to connect to Postgres.
- That database has **not** had the repo migrations applied (or is a different/empty DB).
- So tables like `initiatives`, `llm_calls`, `build_specs`, `launches` are missing.

---

## Fix (one-time)

1. **Use the same DB the Control Plane uses**  
   Use the same `DATABASE_URL` as the Control Plane (e.g. from Render → ai-factory-api-staging → Environment). Your repo `.env` should match that for migrations.

2. **Run migrations against that DB**  
   From the repo root:

   ```bash
   node --env-file=.env scripts/run-migrate.mjs
   ```

   Or with `pnpm db:migrate` (if it runs the same script). This applies core schema and all migrations in `scripts/run-migrate.mjs` (including `initiatives`, `build_specs`, `launches`).

3. **Refresh the Console**  
   Dashboard, Initiatives, and other views should load without the schema error.

---

## Why self-heal didn’t fix it

- **Migrations run on every Control Plane start:** (1) **In-process** — the bundle runs `scripts/run-migrate.mjs` before starting the API (`control-plane/src/index.ts`: `runMigrationsOnStartup()`). (2) **Docker CMD** — `Dockerfile.control-plane` runs migrate then the bundle. So every deploy or restart applies pending migrations.
- If you still see this error, run `node --env-file=.env scripts/run-migrate.mjs` once from repo root (same `DATABASE_URL` as the API). Ensure the Control Plane on Render has no custom Start Command that skips the image CMD.

3. **Redeploy Control Plane**  
   Ensure the Control Plane is deployed from a commit that includes the `/v1/launches` and `/v1/build_specs` API routes (and any other recent API changes). After redeploy, `GET /v1/launches` should return `{ "items": [] }` instead of 404.

4. **Verify**  
   - Initiatives: Console → Initiatives should load (list may be empty).  
   - Cost Dashboard: Should load; if there are no LLM calls yet, charts will be empty.  
   - Launches: Console → Launches should load with the usual menu; list may be empty.  
   - Klaviyo / Landing Page Generator: Should load with the usual menu.

---

## If you use Supabase only (no run-migrate)

If you apply only Supabase migrations (e.g. via Supabase Dashboard or `supabase db push`), ensure the **core schema** is applied first (e.g. `schemas/001_core_schema.sql` and `002_state_machines_and_constraints.sql`), then all files in `supabase/migrations/` in order. The `initiatives` table is created in the core schema; `build_specs` and `launches` are in `supabase/migrations/20250318100000_build_specs_launches.sql`.
