# Pharmacy Time (Pharmacytime) Airtable import

Import the **Pharmacy Repo** Airtable (Products + Variations) into AI Factory using the [taxonomy schema and mapping](TAXONOMY_SCHEMA_AND_MAPPING.md). All products and variations are written to **brand_catalog_products** and associated with the **Pharmacy Time** brand (slug `pharmacytime-com`). Organization **Pharmacy Time** (slug `pharmacy-time`) and one taxonomy website are created/linked so the brand is fully associated.

## Prerequisites

- **DATABASE_URL** — AI Factory DB (same as for taxonomy/catalog).
- **AIRTABLE_BASE_ID** — Pharmacy Airtable base ID (from Pharmacy Repo `.env` as `AIRTABLE_BASE_ID`).
- **AIRTABLE_TOKEN** or **AIRTABLE_API_KEY** — Airtable API token (from Pharmacy Repo `.env` as `AIRTABLE_API_KEY`).

## Mapping summary

| Source (Pharmacy Time Airtable) | Target (AI Factory) |
|----------------------------------|---------------------|
| Base (Products + Variations tables) | Raw landing: `raw_airtable_bases`, `raw_airtable_tables`, `raw_airtable_batches`, `raw_airtable_rows` |
| — | **organizations**: one row **Pharmacy Time** (slug `pharmacy-time`) |
| — | **taxonomy_websites**: one row **Pharmacy Time** (url https://pharmacytime.com, synthetic id `pharmacy-time-website`) |
| — | **brand_profiles**: **Pharmacy Time** (slug `pharmacytime-com`), linked to taxonomy_website via `website_id` |
| **Products** + **Variations** (merged per variation; parent-only if no variations) | **brand_catalog_products**: all records under Pharmacy Time brand; name, description, image_url, price_cents, currency, metadata_json, external_ref = Airtable record id |

Details: [data/pharmacy/mapping/pharmacy-airtable-mapping.md](../data/pharmacy/mapping/pharmacy-airtable-mapping.md).

## Run import

From AI Factory repo root:

```bash
# Option 1: env in .env (AIRTABLE_BASE_ID, AIRTABLE_TOKEN or AIRTABLE_API_KEY, DATABASE_URL)
npm run airtable:import:pharmacy

# Option 2: override base ID
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX AIRTABLE_TOKEN=patXXX npm run airtable:import:pharmacy

# Option 3: direct script (with .env loaded)
node --env-file=.env scripts/airtable-import-pharmacy.mjs --base-id appXXXXXXXXXXXXXX
```

After a successful run you get:

- **organizations**: Pharmacy Time (slug `pharmacy-time`).
- **taxonomy_websites**: one website for Pharmacy Time (url https://pharmacytime.com).
- **brand_profiles**: Pharmacy Time brand (slug `pharmacytime-com`) with `website_id` set to the taxonomy website.
- **brand_catalog_products**: one row per variation (or per product when there are no variations), all associated with the Pharmacy Time brand; full payload in `metadata_json`.

## Status

Import has been run successfully: **222 Products**, **703 Variations** → **724** `brand_catalog_products` rows (all associated with Pharmacy Time / `pharmacytime-com`). Organization **Pharmacy Time** (`pharmacy-time`), one taxonomy website, and the Pharmacy Time brand are created/linked.

## Verify

- **DB:** `npm run verify:taxonomy-db` (includes organizations). Catalog count: `SELECT COUNT(*) FROM brand_catalog_products b JOIN brand_profiles p ON b.brand_profile_id = p.id WHERE p.slug = 'pharmacytime-com'` (expect 724).
- **API:** Ensure control-plane is running, then  
  `GET /v1/catalog/products?brand_profile_id=<pharmacy_time_brand_uuid>`  
  (get uuid from `SELECT id FROM brand_profiles WHERE slug = 'pharmacytime-com'`).

## WooCommerce cross-reference and sync

To have **100% of data** (Airtable + WordPress/WooCommerce) in AI Factory for later actions:

1. **Run the WooCommerce sync** (after Airtable import and with the **same** DATABASE_URL that has `brand_profiles` and Pharmacy Time data):
   ```bash
   # WooCommerce credentials from Pharmacy Repo .env
   export $(grep -E '^WOOCOMMERCE_|^CONSUMER_KEY=|^CONSUMER_SECRET=' "/path/to/Pharmacy Repo/Pharmacy/.env" | xargs)
   npm run woocommerce:sync:pharmacy
   ```
   Or: copy `WOOCOMMERCE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET` (or `CONSUMER_KEY`/`CONSUMER_SECRET`) into AI Factory `.env` and run `npm run woocommerce:sync:pharmacy`.

2. **What the sync does:**
   - Fetches all **products** and **variations** from the Pharmacy Time WooCommerce store (e.g. pharmac7dev.wpenginepowered.com).
   - Fetches all **categories**.
   - Stores full payloads in **raw_woocommerce_snapshots** (entity_type `products`, `categories`) for replay and audit.
   - Ensures a **stores** row (channel `woocommerce`, scope_key `pharmacy-time`, linked to Pharmacy Time brand) and upserts **products** in the ads commerce table (store_id, external_ref = WC product id, name, price_cents, etc.).
   - **Cross-references** catalog ↔ WooCommerce: matches catalog rows to WC by product/variation key (compound|form|category|strength from Airtable metadata vs. WC meta `_product_key`, `_strength_key`). For each match, sets **brand_catalog_products.metadata_json** → `woocommerce_product_id`, `woocommerce_variation_id`, `woocommerce_permalink` so you can take actions (e.g. update WC, link to storefront) from a single record.

3. **Migration:** Run `supabase/migrations/20250331000005_raw_woocommerce_snapshots.sql` (adds `raw_woocommerce_snapshots`) before the first sync.

## Pharmacy Repo location

The project and Airtable/WooCommerce usage live under:

- **Path:** `Pharmacy Repo/Pharmacy/` (e.g. on this machine: `~/Documents/Pharmacy Repo/Pharmacy/`).
- **Airtable → WooCommerce:** `project/scripts/core/import-from-airtable-enhanced.py` (reads Products + Variations from Airtable, pushes to WooCommerce).
- **AI Factory:** Airtable import fills **brand_catalog_products**; WooCommerce sync fills **raw_woocommerce_snapshots**, **stores**, **products**, and cross-links catalog rows to WC via `metadata_json.woocommerce_*`.
