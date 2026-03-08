# Deploying Supabase / Postgres email campaign schema

Email design flow (Console: **Email Design Generator**) uses initiatives with **`intent_type = 'email_design_generator'`** and the following schema. Cultura-style templates need:

- `email_templates` (with `template_json`, `sections_json`, optional `brand_profile_id`)
- `initiatives.template_id`
- `email_design_generator_metadata.metadata_json`

All migrations in `supabase/migrations/` are idempotent where possible.

## Option A: Script with DATABASE_URL (Supabase or any Postgres)

From repo root, with your **Supabase** (or Render Postgres) connection string:

```bash
# Full email schema: email_templates table + initiatives.template_id + email_design_generator_metadata.metadata_json
DATABASE_URL='postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres' node scripts/run-email-templates-migration.mjs
```

Get the connection string: **Supabase Dashboard** → your project → **Settings** → **Database** → **Connection string** (URI, Session pooler, paste your password).

For **Render**: use the same `DATABASE_URL` you set on the Control Plane service (staging or prod). Run the script once per environment if they use different databases.

## Option B: Supabase Dashboard SQL Editor

1. **Supabase Dashboard** → your project → **SQL Editor**.
2. Paste and run the combined schema (one shot):
   - Open `scripts/email-schema-supabase-paste.sql` (or run `node scripts/run-email-templates-migration.mjs --print-sql` and copy the output).
   - Paste into SQL Editor and run. This creates `email_templates`, adds `initiatives.template_id` and `initiatives.brand_profile_id`, and `email_design_generator_metadata.metadata_json`.

## Option C: Neon MCP (if AI Factory DB is on Neon)

If your Control Plane uses a **Neon** project (not Supabase), use the Neon MCP in Cursor:

1. Get your Neon **project ID** (e.g. from Neon dashboard or MCP `list_projects`).
2. Run the migration SQL against that project:
   - Use MCP tool **run_sql** with `projectId` and `sql` = contents of the migration file(s), or
   - Use **prepare_database_migration** then **complete_database_migration** for a temporary-branch workflow.

To get the exact SQL for **run_sql** (no DB needed):

```bash
node scripts/run-email-templates-migration.mjs --print-sql
```

Paste that output into the Neon MCP **run_sql** `sql` parameter with your `projectId` (and optional `branchId`, `databaseName`).

## Option D: Supabase CLI

With the repo linked to your remote project:

```bash
export SUPABASE_ACCESS_TOKEN=your_token
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This applies all pending files in `supabase/migrations/` in order.

## Verify

After deploy, check:

- `email_templates` exists and has columns `template_json`, `sections_json`.
- `initiatives` has `template_id` (and optionally `brand_profile_id`).
- `email_design_generator_metadata` has `metadata_json`.

Example (replace with your connection details):

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name IN ('template_json','sections_json');
SELECT column_name FROM information_schema.columns WHERE table_name = 'initiatives' AND column_name = 'template_id';
SELECT column_name FROM information_schema.columns WHERE table_name = 'email_design_generator_metadata' AND column_name = 'metadata_json';
```
