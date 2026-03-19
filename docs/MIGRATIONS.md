# Migrations and schema

## How migrations run

- **Control Plane (Render / local):** On every startup, the Control Plane runs `scripts/run-migrate.mjs` (migrations listed there run in order). So every deploy applies migrations; no separate migrate step is required.
- **Local / CI:** From repo root: `npm run db:migrate` (or `node --env-file=.env scripts/run-migrate.mjs`) to apply migrations against the DB pointed at by `DATABASE_URL`.

## Migration numbering scheme

Migration filenames use a **timestamp-style prefix** so order is deterministic:

- Pattern: `YYYYMMDDHHMMSS_description.sql` (e.g. `20250404000000_evolution_loop_v1.sql`).
- **Date (YYYYMMDD):** When the migration was added (or the batch date).
- **Time (HHMMSS):** Sequence within the day (often `000000`, `100000`, …) to keep multiple migrations on the same day ordered.
- **Description:** Short snake_case name (e.g. `evolution_loop_v1`, `seo_url_risk_snapshots`).

Migrations in `supabase/migrations/` are either:

1. **Registered in `scripts/run-migrate.mjs`** — run by the Control Plane on startup and by `npm run db:migrate`. Every new migration file that should run automatically must be added there (with optional `skipIfErrorCode` / `skipMessage` for idempotency).
2. **Supabase-only (intentionally not run by run-migrate)** — These eight files exist on disk but are **not** in the run-migrate list; they are listed in `SKIP_NOT_IN_RUN_MIGRATE` in `scripts/verify-migrations-registered.mjs` so `npm run verify:migrations` passes:
   - `20250303000000_ai_factory_core.sql`, `20250303000001_ai_factory_state_machines.sql`, `20250303000002_ai_factory_rls.sql`, `20250303000003_brand_themes.sql`, `20250303000005_multi_framework.sql`, `20250303000006_gateway_and_mcp.sql`, `20250303000007_brand_engine.sql`, `20250303100005_runs_llm_source.sql`
   - Core schema is applied from **schemas/001_core_schema.sql** and **schemas/002_state_machines_and_constraints.sql**; run-migrate then runs from `20250303000008_vault_secret_refs.sql` onward. So the "gap" (86 files on disk vs 78 registered in run-migrate) is intentional.

## Migration recovery (production)

If production has **missing relations** or **migration out of order**:

1. **Identify:** Check Control Plane or Console logs for `relation "X" does not exist` or migration errors.
2. **Sync:** Ensure `scripts/run-migrate.mjs` lists every migration that should run (see [Adding a new migration](#adding-a-new-migration)). Run `npm run verify:migrations` from repo root.
3. **Apply:** Point `DATABASE_URL` at the target DB and run `npm run db:migrate` (or let the next Control Plane deploy run migrations on startup). Migrations are idempotent where they use `skipIfErrorCode` / `IF NOT EXISTS`.
4. **Rollback:** We do not ship automatic rollbacks. To reverse a migration, write a new migration that drops or alters objects, or restore from a DB backup. Prefer additive migrations and feature flags over rollbacks.

**Troubleshooting "migration exists but not registered":** If `npm run verify:migrations` fails with "these migration files are not in run-migrate.mjs", either (a) add the migration to the `migrations` array in `scripts/run-migrate.mjs` in the correct order, or (b) if the file is intentionally not run (e.g. core from schemas/), add it to `SKIP_NOT_IN_RUN_MIGRATE` in `scripts/verify-migrations-registered.mjs`.

## Adding a new migration

1. Create `supabase/migrations/YYYYMMDDHHMMSS_short_name.sql`.
2. Add an entry to the `migrations` array in `scripts/run-migrate.mjs` (path, name, and optional skip rules).
3. **Run `npm run verify:migrations`** — required before every PR that adds migrations. If a file is intentionally not run (e.g. core schema from schemas/), add it to `SKIP_NOT_IN_RUN_MIGRATE` in `scripts/verify-migrations-registered.mjs`.
4. Commit both the migration file and the change to `run-migrate.mjs`.

See also: [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md), [runbooks/console-db-relation-does-not-exist.md](runbooks/console-db-relation-does-not-exist.md). For why Render uses root Docker context, see OPERATIONS_RUNBOOK § Deploy staging and [runbooks/render-staging-failed-deploy-and-duplicate-runner.md](runbooks/render-staging-failed-deploy-and-duplicate-runner.md).
