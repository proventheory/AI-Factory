# Migration Naming Convention

Standard naming for Supabase and Control Plane migrations to avoid drift and keep order clear.

## Convention

**Format:** `YYYYMMDD00000_short_snake_case_description.sql`

- **YYYYMMDD** — Date of the change (UTC or team timezone, be consistent).
- **00000** — Zero-padded sequence number for the same day (00–99). Use one block per day if you prefer (e.g. `20250315000000`, `20250315000001`), or a single increment across the repo (e.g. `20250303100000`, `20250303110000`).
- **short_snake_case_description** — Lowercase, snake_case, descriptive (e.g. `artifact_knowledge_graph`, `seo_url_risk_snapshots`).

## Examples

- `20250331000013_schema_snapshots.sql` — Schema snapshot table for drift detection.
- `20250320000000_seo_url_risk_snapshots.sql` — SEO risk snapshots table.
- `20250306120000_email_campaign_schema_ensure.sql` — Email campaign schema fixes.

## Rules

1. **One logical change per file** — Easier rollback and review.
2. **Order matters** — Migrations run in filename order; ensure dependencies (e.g. `brand_profiles` before `brand_design_tokens_flat`) are reflected in the sequence.
3. **Idempotency** — Prefer `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `skipIfErrorCode` in `run-migrate.mjs` for already-applied objects.
4. **Register in run-migrate.mjs** — Every migration in `supabase/migrations/` that the Control Plane should apply must have an entry in `scripts/run-migrate.mjs` (see [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)).

## Validation

Run the naming validator to list migrations that don’t match the convention:

```bash
node scripts/validate-migration-names.mjs
```

Exit code 0: all names valid. Exit code 1: at least one non-standard name (see output for details).

## Legacy names

Existing migrations use mixed patterns (e.g. `20250303100000` vs `20250305100000`). New migrations should follow this doc; renaming old files is optional and can break applied-migration tracking, so do it only when you have a clear strategy (e.g. Supabase CLI history).
