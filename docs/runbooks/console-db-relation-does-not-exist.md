# Runbook: Console shows "relation initiatives does not exist" (or cost dashboard empty, launches 404)

When the Console returns `{"error":"relation \"initiatives\" does not exist"}` on Initiatives, Email Design Generator, Landing Page Generator, or when the Cost Dashboard shows no data or the Launches page returns `Cannot GET /v1/launches`, the **database the Control Plane talks to** is missing schema.

---

## Cause

- The Control Plane (e.g. on Render) uses `DATABASE_URL` to connect to Postgres.
- That database has **not** had the repo migrations applied (or is a different/empty DB).
- So tables like `initiatives`, `llm_calls`, `build_specs`, `launches` are missing.

---

## Fix

1. **Use the same DB the Control Plane uses**  
   Get `DATABASE_URL` from the environment of the service that runs the Control Plane (e.g. Render → Service → Environment). Use that exact URL for the steps below.

2. **Run migrations against that DB**  
   From the repo root, with `DATABASE_URL` set to that URL:

   ```bash
   export DATABASE_URL="postgresql://..."   # from Render / your Control Plane env
   pnpm db:migrate
   ```

   Or with a `.env` that has `DATABASE_URL`:

   ```bash
   pnpm db:migrate
   ```

   This runs `scripts/run-migrate.mjs`, which applies core schema (including `initiatives`, `llm_calls`) and all Supabase migrations (including `build_specs`, `launches`).

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
