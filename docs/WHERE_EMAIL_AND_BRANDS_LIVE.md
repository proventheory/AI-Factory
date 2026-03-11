# Where the email engine, components, templates, and First Capital brands live

Nothing was deleted from the **repo**. Everything lives in one of two places: **code + DB** or **DB only**. If the UI looks empty, it’s almost always because the **database** the Control Plane uses is missing schema (migrations not run) or missing data (seeds/imports not run).

**To avoid an empty Console and lost work on deploy:** follow **[DEPLOY_AND_DATA_SAFETY.md](DEPLOY_AND_DATA_SAFETY.md)** and the runbook **[runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md)** (export templates before infra changes, repopulate after, keep mapping in repo).

---

## 1. Email components (Component Registry)

| Where | What |
|-------|------|
| **Console** | [BRAND & DESIGN → Component Registry](/components) — `console/app/components/page.tsx` |
| **API** | Control Plane: `GET/POST/PATCH/DELETE /v1/email_component_library` and `/v1/email_component_library/:id`, plus `/assembled` |
| **DB** | Table `email_component_library` (id, component_type, name, mjml_fragment, html_fragment, placeholder_docs, position, use_context, …) |
| **Seeds** | **You must run a seed** or the table stays empty. After migrations: `node scripts/seed-email-component-library.mjs <CONTROL_PLANE_URL>` (see [POST_DEPLOY_SEEDS.md](POST_DEPLOY_SEEDS.md)). |

So: the **components** are in the DB. The UI and API are in the repo. If the Registry is empty, run migrations then the seed script against the same DB the Control Plane uses.

---

## 2. Email templates (Document Templates)

| Where | What |
|-------|------|
| **Console** | [BRAND & DESIGN → Document Templates](/document-templates) — `console/app/document-templates/page.tsx` (unified list: document + email templates) |
| **API** | Control Plane: `GET/POST/PATCH/DELETE /v1/email_templates`, `GET /v1/email_templates/:id`, `GET /v1/email_templates/:id/preview`, `GET /v1/email_templates/:id/lint`; plus document_templates CRUD |
| **DB** | Tables `email_templates`, `document_templates`. Email: name, mjml, component_sequence, brand_profile_id, image_url, template_image_contracts, etc. |
| **Seeds** | Sticky Green composed template: `node scripts/seed-sticky-green-composed-template.mjs <CONTROL_PLANE_URL>`. One-shot console setup: `node scripts/seed-email-for-console.mjs <CONTROL_PLANE_URL>` (see [EMAIL_SEED_AND_DELETE.md](EMAIL_SEED_AND_DELETE.md)). |

So: **templates** are in the DB. If Document Templates is empty or missing “Sticky Green - Composed”, run migrations then the seed scripts. The “email engine” (generation, preview, lint, contracts) is in the Control Plane API and runners; the **data** (templates and components) is in Postgres.

---

## 3. First Capital Group and brands from Airtable

| Where | What |
|-------|------|
| **DB** | **Organization:** One row is **seeded in a migration**: `organizations` gets `('First Capital Group', 'first-capital-group')` in `supabase/migrations/20250331000002_organizations_and_brand_website.sql`. So once that migration runs, the org exists. **Brands** and **websites** are **not** in migrations — they come from imports or seeds. |
| **Repo** | Config and artifacts per client: intended under `data/first-capital-group/` (README, mapping, discovery, exports). Right now the repo has `data/pharmacy/` (Pharmacy Time) and no `data/first-capital-group/` folder with actual Airtable discovery/mapping; see [ORGANIZATION_AND_CLIENT_GROUPING.md](ORGANIZATION_AND_CLIENT_GROUPING.md). |
| **Import** | Airtable → organizations / taxonomy_websites / brand_profiles / brand_catalog_products is done by **scripts + API**, not stored in the repo. The **actual brands you imported** (names, slugs, website links) live only in the **database**. If you point the Control Plane at a new or empty DB, that data is gone unless you re-run the import. |

So: **First Capital Group** the org = one row, created by migration. The **brands and websites** you had from Airtable = rows in `brand_profiles` and `taxonomy_websites` created when you ran an import (or seed). To get them back you must either restore the DB that had them or re-run the Airtable import for First Capital (with the right base ID and scope key `first-capital-group`). There is no “file of brands” in the repo — only schema, migrations, and docs.

**Taxonomy/Airtable schema applied directly in Supabase:** The migration files `20250331000000_airtable_import_and_brand_catalog.sql` through `20250331000004_taxonomy_terms_url_value.sql` are **not in the repo** (only `20250331000005_raw_woocommerce_snapshots.sql` is). They are referenced in `scripts/run-migrate.mjs`, so if you ran migrations from an older branch or a different source, those tables may exist. It’s also common to **apply the equivalent SQL directly in the Supabase SQL editor** (paste or run from a script). If you did that, your Supabase DB already has `organizations`, `import_batches`, `raw_airtable_bases`, `raw_airtable_tables`, `raw_airtable_batches`, `raw_airtable_rows`, `taxonomy_websites`, `taxonomy_vocabularies`, `taxonomy_terms`, etc. The First Capital import script (`scripts/airtable-import.mjs`) expects that schema. To re-run the import: use the same DB (e.g. `DATABASE_URL` from Supabase), run discovery to get `docs/airtable-discovery/schema_<baseId>.json`, then `node scripts/airtable-import.mjs --base-id app6pjOKnxdrZsDWR --scope-key first-capital-group --live` with `AIRTABLE_TOKEN` set (see [AIRTABLE_AND_PRODUCT_IMPORT_PLUGIN_ANALYSIS.md](AIRTABLE_AND_PRODUCT_IMPORT_PLUGIN_ANALYSIS.md) and [TAXONOMY_SCHEMA_AND_MAPPING.md](TAXONOMY_SCHEMA_AND_MAPPING.md)).

---

## 4. Quick “everything’s empty” checklist

1. **Migrations** — Same DB the Control Plane uses: `DATABASE_URL=<that_url> npm run db:migrate`. Fixes “relation initiatives does not exist” and creates all tables (initiatives, email_templates, email_component_library, organizations, brand_profiles, etc.).  
2. **Email components** — `node scripts/seed-email-component-library.mjs <CONTROL_PLANE_URL>`.  
3. **Templates** — Restore from repo snapshot: `node scripts/import-email-templates-from-export.mjs` (reads `data/cultura-templates/exported-templates.json`). Or run `seed-email-templates.mjs` or Cultura sync with mapping.  
4. **Sticky Green brand + template** — `node scripts/seed-brand-sticky-green.mjs <CONTROL_PLANE_URL>` then `node scripts/seed-sticky-green-composed-template.mjs <CONTROL_PLANE_URL>`.  
5. **First Capital brands** — No seed in repo. Re-import from Airtable using the import pipeline for First Capital (scope `first-capital-group`) or restore from a DB backup that had them.

See also: [DEPLOY_AND_DATA_SAFETY.md](DEPLOY_AND_DATA_SAFETY.md), [runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md), [POST_DEPLOY_SEEDS.md](POST_DEPLOY_SEEDS.md), [runbooks/console-db-relation-does-not-exist.md](runbooks/console-db-relation-does-not-exist.md), [ORGANIZATION_AND_CLIENT_GROUPING.md](ORGANIZATION_AND_CLIENT_GROUPING.md).
