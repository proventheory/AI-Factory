# Runbook: Console data safety and traceability

**Rule:** The Console must never be left empty after a deploy or infra change, and we must always be able to trace back what data we had and how to restore it. Losing templates, components, brands, or mappings with no way to recover is not acceptable.

This runbook defines **what to do before and after** heavy infrastructural changes (new DB, env switch, major deploy) so the console stays populated and every data source is traceable.

---

## 1. Source of truth (what lives where)

| Data | Lives in | How to restore if lost |
|------|----------|-------------------------|
| **Email templates** | DB (`email_templates`). Optional snapshot in repo: `data/cultura-templates/exported-templates.json` | Export script → commit; restore via import script or Cultura sync + mapping. See [CULTURA_TEMPLATES_AND_MAPPING.md](../CULTURA_TEMPLATES_AND_MAPPING.md). |
| **Template name/type mapping** (Cultura) | Repo only if you commit it: `data/cultura-templates/template-mapping.json` | Commit the mapping file; use `--mapping` when syncing from Cultura. |
| **Email components** | DB (`email_component_library`). Seed script in repo: `scripts/seed-email-component-library.mjs` | Run seed against Control Plane URL. No export script yet — seed is source of truth. |
| **Brands / Sticky Green** | DB (`brand_profiles`, etc.). Seeds: `seed-brand-sticky-green.mjs`, `seed-sticky-green-composed-template.mjs` | Run seeds. |
| **First Capital brands / Airtable** | DB only (no export in repo). Import: `scripts/airtable-import.mjs` + mapping in `data/first-capital-group/` | Re-run Airtable import with same base ID and scope, or restore from DB backup. |
| **Initiatives, plans, runs** | DB only | Migrations + restore from DB backup if you switched DB. |

**Critical:** If the only copy of something is in the DB and you point the Control Plane at a new or empty DB, that data is gone unless you have a backup or a committed export/mapping.

---

## 2. Before any heavy infra change or deploy (mandatory)

Do these **before** switching `DATABASE_URL`, replacing the Control Plane DB, or pushing a deploy that might re-run migrations or reseed.

### 2.1 Export and commit

1. **Email templates**  
   Export so you have a restorable snapshot in the repo:
   ```bash
   CONTROL_PLANE_URL=<your_live_or_staging_api> node scripts/export-email-templates-from-control-plane.mjs
   ```
   This writes `data/cultura-templates/exported-templates.json`. **Commit that file** (and the folder if new) so the set is traceable and restorable.

2. **Cultura mapping**  
   If you use Cultura sync and have name/type overrides, keep them in the repo:
   - Copy or create `data/cultura-templates/template-mapping.json` (see `template-mapping.json.example`).
   - **Commit it** so a future sync can re-apply the same names/types.

3. **First Capital / client data**  
   There is no generic “export brands” script. Options:
   - **DB backup:** Take a snapshot of the DB the Control Plane uses (e.g. Supabase backup, `pg_dump`), so you can restore or compare.
   - **Document:** In a runbook or `data/first-capital-group/README.md`, record the Airtable base ID, scope key, and that “brands were imported on &lt;date&gt; from this base.” So you know how to re-run the import.

### 2.2 Document current state (traceability)

Record somewhere (e.g. in a runbook, README, or one-off doc) so the next person (or you in six months) can trace back:

- **Which DB** the Control Plane is using (e.g. “Render Postgres” or “Supabase project X”). Don’t put secrets in the repo; “Supabase project X” or “staging DB” is enough.
- **Which export/mapping files** were used for the last known good state (e.g. “exported-templates.json from 2025-03-11”).
- **Which seeds** were run (e.g. “seed-email-component-library, seed-brand-sticky-green, seed-sticky-green-composed-template, then Cultura sync with template-mapping.json”).

---

## 3. After deploy or DB switch (mandatory)

1. **Run migrations**  
   Against the **same** DB the Control Plane uses:
   ```bash
   DATABASE_URL=<that_db_url> npm run db:migrate
   ```
   See [runbooks/console-db-relation-does-not-exist.md](console-db-relation-does-not-exist.md) if you see “relation initiatives does not exist”.

2. **Repopulate the Console so it is not empty**  
   In order:
   - **Email components:**  
     `node scripts/seed-email-component-library.mjs <CONTROL_PLANE_URL>`
   - **Templates:**  
     Either restore from export:  
     `node scripts/import-email-templates-from-export.mjs`  
     (reads `data/cultura-templates/exported-templates.json` by default)  
     Or run the full template seed:  
     `node scripts/seed-email-templates.mjs <CONTROL_PLANE_URL>`  
     Or sync from Cultura with mapping:  
     `node scripts/sync-email-templates-from-cultura.mjs --mapping data/cultura-templates/template-mapping.json`
   - **Sticky Green brand + composed template:**  
     `node scripts/seed-brand-sticky-green.mjs <CONTROL_PLANE_URL>` then  
     `node scripts/seed-sticky-green-composed-template.mjs <CONTROL_PLANE_URL>`
   - **First Capital brands:**  
     Re-run Airtable import for First Capital if the DB was new/empty (see [WHERE_EMAIL_AND_BRANDS_LIVE.md](../WHERE_EMAIL_AND_BRANDS_LIVE.md)).

3. **Verify**  
   Open the Console and confirm:
   - [ ] BRAND & DESIGN → Component Registry has entries.
   - [ ] BRAND & DESIGN → Document Templates has templates.
   - [ ] BRAND & DESIGN → Brands shows expected brands (e.g. Sticky Green; First Capital if you re-ran import).
   - [ ] Initiatives, Cost Dashboard, Launches load (menu visible, no “relation does not exist”).

If anything is empty, **stop and fix** using the restore steps above before considering the deploy complete.

---

## 4. Quick reference: scripts that affect Console data

| Script | Purpose |
|--------|---------|
| `scripts/export-email-templates-from-control-plane.mjs` | Snapshot all templates to `data/cultura-templates/exported-templates.json`. Run before infra changes; commit the file. |
| `scripts/import-email-templates-from-export.mjs` | Restore templates from that JSON. Use after DB switch or to repopulate. |
| `scripts/sync-email-templates-from-cultura.mjs` | Pull from Cultura Supabase; use `--mapping data/cultura-templates/template-mapping.json` to apply name/type overrides. |
| `scripts/seed-email-templates.mjs` | Insert the 8 built-in templates (no Cultura-specific or Emma). |
| `scripts/seed-email-component-library.mjs` | Populate Component Registry. |
| `scripts/seed-brand-sticky-green.mjs` | Create Sticky Green brand. |
| `scripts/seed-sticky-green-composed-template.mjs` | Create Sticky Green composed template. |
| `scripts/seed-email-for-console.mjs` | One-shot: delete 7 default templates by name, seed components, add Sticky Green composed. Use with care. |

---

## 5. If the Console is already empty (recovery)

1. **Schema:** Run migrations against the DB the Control Plane uses ([console-db-relation-does-not-exist.md](console-db-relation-does-not-exist.md)).
2. **Templates:** If you have `data/cultura-templates/exported-templates.json` in the repo, run `import-email-templates-from-export.mjs`. Otherwise use `seed-email-templates.mjs` or Cultura sync + mapping.
3. **Components:** Run `seed-email-component-library.mjs`.
4. **Brands / Sticky Green:** Run `seed-brand-sticky-green.mjs` and `seed-sticky-green-composed-template.mjs`.
5. **First Capital:** Re-run Airtable import or restore from DB backup.

See also [WHERE_EMAIL_AND_BRANDS_LIVE.md](../WHERE_EMAIL_AND_BRANDS_LIVE.md) and [CULTURA_TEMPLATES_AND_MAPPING.md](../CULTURA_TEMPLATES_AND_MAPPING.md).
