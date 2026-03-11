# Cultura templates and mapping

## Where the work went

Templates and mapping adjustments from the **Cultura repo** (or a fork) were never committed to *this* repo as a mapping file or as a full template export. In this codebase we only have:

- **Sync script:** `scripts/sync-email-templates-from-cultura.mjs` — pulls from Cultura/Focuz **Supabase** (`templates` table) and POSTs to our Control Plane. Names are derived from `imageUrl` (or type + id); there was no mapping file in git.
- **Seed templates:** `scripts/seed-email-templates.mjs` — 8 built-in templates (no Emma, no Cultura-specific set).
- **Git history:** No Cultura mapping file or exported template set was found in this repo’s branches (main, prod, doctor/autofix).

So the “tons of mapping adjustments” either:

1. Lived only in **Cultura’s Supabase** (you edited names/types there) — then re-sync with the same credentials will bring them back.
2. Lived only in **our Control Plane DB** after a one-off sync — then they’re gone unless you have a DB backup or had exported them.
3. Lived in **another repo or only locally** — you’d need to recover from that repo or machine.

## What we added so it doesn’t happen again

1. **Optional mapping file**  
   You can commit a JSON mapping (Cultura template id → name/type/img_count) and pass it when syncing:
   - File: `data/cultura-templates/template-mapping.json` (see `template-mapping.json.example`).
   - Run: `node scripts/sync-email-templates-from-cultura.mjs --mapping data/cultura-templates/template-mapping.json`  
   So your name/type adjustments live in the repo and are re-applied on every sync.

2. **Export from Control Plane**  
   Snapshot the current templates (including any you changed after sync) into the repo:
   - `node scripts/export-email-templates-from-control-plane.mjs`  
   Writes `data/cultura-templates/exported-templates.json`. Commit that file.

3. **Import from export**  
   Restore templates from that snapshot (e.g. after a wipe or in a new env):
   - `node scripts/import-email-templates-from-export.mjs`  
   Reads `data/cultura-templates/exported-templates.json` by default; use `--in path/to/export.json` for another file.

See **data/cultura-templates/README.md** for exact commands and file formats.

## Restoring “all templates from Cultura” with your adjustments

- **If you still have Cultura Supabase access:**  
  Run the sync with mapping. If your adjustments were in Cultura’s DB, sync as-is. If your adjustments were only in our DB, re-create them in `data/cultura-templates/template-mapping.json` (you can build it from a backup or from memory) and run sync with `--mapping`.

- **If you have a Control Plane DB backup** that has the templates:  
  Restore that backup, then run the export script and commit `exported-templates.json`. From then on you can use the import script to restore that set anywhere.

- **If the mapping lived in another repo (e.g. CULTURA-AI):**  
  Copy the mapping into `data/cultura-templates/template-mapping.json` (adapt keys to Cultura template ids if needed), then run the sync with `--mapping`.
