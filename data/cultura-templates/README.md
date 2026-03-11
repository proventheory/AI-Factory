# Cultura email templates and mapping

Templates synced from the Cultura/Focuz Supabase live in the Control Plane DB. This folder is for **mapping overrides** and **exported snapshots** so you can version your names/types and restore templates without re-syncing from Cultura.

## Optional mapping file

When syncing from Cultura, you can pass a mapping so names/types (and `img_count`) match how you want them in the console:

- **File:** `template-mapping.json` (or any path via `--mapping` / `CULTURA_TEMPLATE_MAPPING`)
- **Format:** `{ "<cultura_template_id>": { "name": "Display Name", "type": "newsletter", "img_count": 1 }, ... }`

Example:

```json
{
  "abc-123-uuid": { "name": "Product - Emma", "type": "newsletter", "img_count": 1 },
  "def-456-uuid": { "name": "Hero + CTA (Cultura)", "type": "promo" }
}
```

Sync with mapping:

```bash
CULTURA_SUPABASE_URL=... CULTURA_SUPABASE_ANON=... CONTROL_PLANE_URL=... \
  node scripts/sync-email-templates-from-cultura.mjs --mapping data/cultura-templates/template-mapping.json
```

## Export (snapshot from Control Plane)

To save the current set of templates (including any you adjusted after sync) into the repo:

```bash
CONTROL_PLANE_URL=https://ai-factory-api-staging.onrender.com \
  node scripts/export-email-templates-from-control-plane.mjs
```

This writes `data/cultura-templates/exported-templates.json`. Commit that file to restore the same set later via the import script.

## Import (restore from export)

To restore templates from a previous export (e.g. after a wipe or new environment):

```bash
CONTROL_PLANE_URL=https://ai-factory-api-staging.onrender.com \
  node scripts/import-email-templates-from-export.mjs
```

By default it reads `data/cultura-templates/exported-templates.json`. Use `--in path/to/export.json` to point elsewhere.

## Where the original work lives

- **Cultura source:** Cultura/Focuz Supabase `templates` table (id, type, img_count, imageUrl, mjml, json, sections). Sync script: `scripts/sync-email-templates-from-cultura.mjs`.
- **Our DB:** Control Plane `email_templates` table. Names/types you changed only live here (or in an export) unless you put them in a mapping file and re-sync.
- **This repo:** No Cultura mapping or full template set was in git history; use `template-mapping.json` and/or `exported-templates.json` here to keep your adjustments under version control.
