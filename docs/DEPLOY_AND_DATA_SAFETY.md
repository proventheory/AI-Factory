# Deploy and data safety

**Policy:** The Console must not be left empty after a deploy or heavy infrastructural change. We must always be able to trace back what data we had and restore it. Losing templates, components, brands, or mappings with no way to recover is not acceptable.

This doc is the entry point for that. Follow it on every significant deploy or when changing DB / environment.

---

## Before heavy infra or deploy

- [ ] **Export email templates** and commit the snapshot:
  ```bash
  CONTROL_PLANE_URL=<your_api> node scripts/export-email-templates-from-control-plane.mjs
  git add data/cultura-templates/exported-templates.json
  git commit -m "chore: snapshot email templates before deploy"
  ```
- [ ] **Commit Cultura mapping** if you use it: ensure `data/cultura-templates/template-mapping.json` exists and is committed (no secrets; only name/type overrides).
- [ ] **Document current state:** Note which DB the Control Plane uses and which seeds/exports were last run (e.g. in a runbook or README). So we can trace back.

Details: [runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md#2-before-any-heavy-infra-change-or-deploy-mandatory).

---

## After deploy or DB switch

- [ ] **Run migrations** against the same DB the Control Plane uses: `DATABASE_URL=<that_url> npm run db:migrate`.
- [ ] **Repopulate so the Console is not empty:**
  - Seed components: `node scripts/seed-email-component-library.mjs <CONTROL_PLANE_URL>`
  - Restore or seed templates: `node scripts/import-email-templates-from-export.mjs` or `seed-email-templates.mjs` or Cultura sync with `--mapping`
  - Seed Sticky Green: `seed-brand-sticky-green.mjs` then `seed-sticky-green-composed-template.mjs`
  - First Capital: re-run Airtable import if the DB was new/empty
- [ ] **Verify in the Console:** Component Registry, Document Templates, and Brands have data; Initiatives/Cost/Launches load with the menu.

Details: [runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md#3-after-deploy-or-db-switch-mandatory).

---

## If the Console is empty (recovery)

Follow the runbook: [runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md#5-if-the-console-is-already-empty-recovery).

---

## Where data lives and how to restore

| Data | Restore / trace |
|------|------------------|
| Email templates | Export → commit `exported-templates.json`; restore with `import-email-templates-from-export.mjs`. Or Cultura sync + `template-mapping.json`. |
| Email components | Seed script in repo: `seed-email-component-library.mjs`. |
| Brands (Sticky Green, etc.) | Seeds; First Capital = Airtable re-import or DB backup. |

Full table and script list: [runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md).
