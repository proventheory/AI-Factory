# Pharmacy Time (Pharmacytime) Airtable → AI Factory mapping

The **Pharmacy Repo** is the Pharmacy Time / Pharmacytime brand. Its Airtable base has **Products** and **Variations** tables (no Websites/Vocabulary/Terms). This document describes how that base is mapped into the [taxonomy schema and mapping](../../../docs/TAXONOMY_SCHEMA_AND_MAPPING.md). All imported records are associated with the **Pharmacy Time** brand (slug `pharmacytime-com`).

## Source structure (Pharmacy Time Airtable)

| Source table   | Description |
|----------------|-------------|
| **Products**   | Parent products: compound_display, Compound Name, form_display, Form, category, Benefits, Product Benefits, Product FAQs, active_ingredients, Prescriber Directions, etc. |
| **Variations** | Child rows linked via `parent_product` or `parent_compound`: Strength (mg/g), Price, Size, SKU, Concentration, pricing_unit, active_ingredient, etc. |

## Target mapping (canonical schema)

| Canonical entity          | Source / logic |
|---------------------------|----------------|
| **organizations**         | One row: name "Pharmacy Time", slug `pharmacy-time` (created on first import if missing). |
| **taxonomy_websites**     | One synthetic website: name "Pharmacy Time", url `https://pharmacytime.com`, same org; `airtable_record_id = 'pharmacy-time-website'`. |
| **brand_profiles**        | **Pharmacy Time** brand: name "Pharmacy Time", slug `pharmacytime-com` (existing brand from Console/seeds, or created if missing). `website_id` → taxonomy_websites.id so the brand is fully associated. |
| **brand_catalog_products**| **Products** + **Variations**: each sellable item = one row. Parent-only products (no variations) → one catalog product. Each variation → one catalog product (parent fields merged into metadata_json). Columns: `brand_profile_id` = Pharmacy Time brand (`pharmacytime-com`), `source_system = 'airtable'`, `external_ref` = Airtable record id, `name`, `description`, `image_url`, `price_cents`, `currency`, `metadata_json` = full combined fields. |

## Field mapping (Products/Variations → brand_catalog_products)

| Canonical column   | Airtable source |
|--------------------|-----------------|
| name               | compound_display / Compound Name + form_display / Form + strength (e.g. "300 mg/g"); or Product Name if present. |
| description        | Benefits / Product Benefits / Short Description (first available). |
| image_url          | First attachment URL from Image / Product Image / similar. |
| price_cents        | Parsed from Price (e.g. "$12.99" → 1299). |
| currency           | Default USD. |
| external_ref       | Airtable record id (`rec...`). |
| metadata_json       | Full merged fields (parent + variation) for replay and downstream use. |

## Running the import

From AI Factory repo root:

```bash
# Set Pharmacy Airtable credentials (base ID and token from Pharmacy Repo .env or Airtable)
export AIRTABLE_BASE_ID="appXXXXXXXXXXXXXX"
export AIRTABLE_TOKEN="patXXXXXXXX"   # or AIRTABLE_API_KEY

# Optional: use same DB as rest of AI Factory
export DATABASE_URL="..."

node --env-file=.env scripts/airtable-import-pharmacy.mjs
# or with explicit base (overrides env):
node --env-file=.env scripts/airtable-import-pharmacy.mjs --base-id "$AIRTABLE_BASE_ID"
```

After import: `GET /v1/catalog/products?brand_profile_id=<pharmacy_brand_uuid>` returns all Pharmacy products/variations.
