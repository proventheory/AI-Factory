# WooCommerce + WordPress cross-reference (everything in one place)

This doc is the single reference for how WooCommerce and WordPress data are stored and cross-referenced with Airtable-sourced catalog in AI Factory.

---

## 1. Raw WooCommerce storage

- **Migration:** `supabase/migrations/20250331000005_raw_woocommerce_snapshots.sql`  
  Adds table **raw_woocommerce_snapshots** (`scope_key`, `store_url`, `entity_type`, `payload` jsonb).
- **Script:** `scripts/woocommerce-sync-pharmacy.mjs`
  - Fetches **all products** (and **variations** for variable products) and **all categories** from the Pharmacy Time WooCommerce store (`WOOCOMMERCE_URL`, e.g. pharmac7dev.wpenginepowered.com).
  - Writes full API responses into **raw_woocommerce_snapshots** (`entity_type`: `products`, `categories`) for replay and audit.

---

## 2. Canonical commerce and cross-reference

- **Stores:** Ensures a **stores** row: `channel` = `woocommerce`, `scope_key` = `pharmacy-time`, `external_ref` = store URL, `brand_profile_id` = Pharmacy Time brand.  
  (Table **stores** is created by `supabase/migrations/20250329000000_ads_commerce_canonical.sql`; run `npm run db:migrate:ads-commerce` if needed.)
- **Products (ads commerce):** Upserts into **products** (store_id, external_ref = WooCommerce product id, name; and when columns exist: price_cents, currency, image_url, description).
- **Cross-reference:** Builds keys from:
  - **WooCommerce:** meta `_product_key`, `_strength_key`, `size`.
  - **Airtable-sourced catalog:** `brand_catalog_products.metadata_json` (compound_display, form_display, category, Strength (mg/g), Size, etc.).  
  For each match the script sets on the **catalog** row:
  - **metadata_json.woocommerce_product_id**
  - **metadata_json.woocommerce_variation_id**
  - **metadata_json.woocommerce_permalink**  
  so each catalog record can drive actions in WooCommerce (e.g. update price, open storefront link).  
  See [AIRTABLE_METADATA_AND_PAGE_MAPPING.md](AIRTABLE_METADATA_AND_PAGE_MAPPING.md) for how this ties **one catalog row = one product/variation page**.

---

## 3. How to run

1. Use the **same DATABASE_URL** as for the Pharmacy Airtable import (the one where `brand_profiles` and Pharmacy Time data exist).
2. WooCommerce credentials from Pharmacy Repo `.env`: `WOOCOMMERCE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET` (or `CONSUMER_KEY` / `CONSUMER_SECRET`). Put them in AI Factory `.env` or export before running:
   ```bash
   export $(grep -E '^WOOCOMMERCE_|^CONSUMER_KEY=|^CONSUMER_SECRET=' "/path/to/Pharmacy Repo/Pharmacy/.env" | xargs)
   npm run woocommerce:sync:pharmacy
   ```
3. **Migrations:** Run **`npm run db:migrate`** once. It creates `brand_profiles` (and other core tables), then **stores** and **products** (ads_commerce_canonical), then **raw_woocommerce_snapshots**. No separate `db:migrate:ads-commerce` step needed. (If you use only the ads-commerce runner, `npm run db:migrate:ads-commerce` still works and requires `brand_profiles` to already exist.)

---

## 4. Docs and npm

- **PHARMACY_IMPORT.md** — “WooCommerce cross-reference and sync” section (what the sync does, how to run, migration note).
- **package.json** — Script: **`npm run woocommerce:sync:pharmacy`**.

---

## 5. Why the sync might have failed (and how to fix)

- **“relation stores does not exist”** or **“relation products does not exist”**  
  Run **`npm run db:migrate:ads-commerce`** so that `supabase/migrations/20250329000000_ads_commerce_canonical.sql` is applied (creates `stores` and `products`).

- **“brand_profiles does not exist”** or **Pharmacy Time brand not found**  
  Use the **same database** where you ran the Pharmacy Airtable import (`npm run airtable:import:pharmacy`). That DB has `brand_profiles` and the Pharmacy Time brand (slug `pharmacytime-com`).

- **Catalog cross-reference: linked 0 of N**  
  Key matching uses the same idea as the Pharmacy Repo Python script (compound|form|category and strength|size). If Airtable metadata uses different field names, extend the key builder in `catalogVariationKey()` and/or ensure WooCommerce products have `_product_key` (and `_strength_key` where applicable) set. After a successful run you should see:
  - Raw WooCommerce products/categories in **raw_woocommerce_snapshots**
  - **stores** and **products** populated for Pharmacy Time WooCommerce
  - **brand_catalog_products** rows updated with **woocommerce_product_id**, **woocommerce_variation_id**, **woocommerce_permalink** where keys match.

---

## 6. Related

- [PHARMACY_IMPORT.md](PHARMACY_IMPORT.md) — Pharmacy Airtable import + WooCommerce section.
- [AIRTABLE_METADATA_AND_PAGE_MAPPING.md](AIRTABLE_METADATA_AND_PAGE_MAPPING.md) — How catalog and taxonomy rows map 1:1 to product/compound/category pages.
