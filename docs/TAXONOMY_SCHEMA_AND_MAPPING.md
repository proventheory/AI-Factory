# Taxonomy schema and mapping

This document describes the **canonical taxonomy schema** used in AI Factory: how data is structured, how entities relate, and how external sources map into it. The schema is source-agnostic; the last section notes how one legacy source was mapped for reference.

---

## 1. Overview

The taxonomy models:

- **Organizations** — top-level client/tenant (e.g. First Capital Group).
- **Websites** — each org has one or more “sites” (e.g. 7-OH Factory, Simply Tabs). Each website has its own set of vocabularies and terms.
- **Vocabularies** — named groupings of terms per website (e.g. Unit Strength, Family Type, Active Ingredient, Strain).
- **Terms** — the actual values: category labels, product variants, strengths, ingredients, etc. Terms belong to one vocabulary and one website. **Product-like items** (e.g. “15mg per tablet”, “20mg MGM-15 Tablets”) are terms under vocabularies such as Unit Strength or Family Type.
- **Master reference tables** — shared lookup data: strains, terpenes, effects, scents, restrictions (not per-website).
- **Facet paths** — ordered sequences of terms used for navigation or filtering; linked to terms via `taxonomy_facet_path_terms`.
- **Brand catalog** — products and pricing **per brand** (separate from taxonomy); filled from Shopify or other commerce sources, not from the taxonomy import.

Relationships:

```
organizations (1) ──► (N) taxonomy_websites
taxonomy_websites (1) ──► (N) taxonomy_vocabularies
taxonomy_websites (1) ──► (N) taxonomy_terms
taxonomy_vocabularies (1) ──► (N) taxonomy_terms  [terms have both website_id and vocabulary_id]
taxonomy_websites (1) ──► (N) taxonomy_facet_paths
taxonomy_facet_paths (N) ◄──► (N) taxonomy_terms  [via taxonomy_facet_path_terms]
brand_profiles (0..1) ──► (1) taxonomy_websites  [optional website_id]
```

---

## 2. Canonical tables and columns

### 2.1 Organizations

| Column          | Type   | Description |
|-----------------|--------|-------------|
| `id`            | uuid   | Primary key. |
| `name`          | text   | Display name (e.g. First Capital Group). |
| `slug`          | text   | Unique key for APIs and import scope (e.g. `first-capital-group`). |
| `metadata_json` | jsonb  | Optional extra attributes. |

Used to scope websites and import batches; no direct link to terms.

---

### 2.2 Taxonomy websites

| Column               | Type   | Description |
|----------------------|--------|-------------|
| `id`                 | uuid   | Primary key. |
| `organization_id`   | uuid   | FK to `organizations(id)`. Optional. |
| `name`               | text   | Site name (e.g. 7-OH Factory Website). |
| `status`             | text   | Optional status. |
| `url`                | text   | Base URL for the site. |
| `metadata_json`      | jsonb  | Full source payload or extra fields. |
| `airtable_*`          | text   | Optional source identifiers (see §5). |

**Indexes:** `organization_id`, unique on `(airtable_base_id, airtable_table_id, airtable_record_id)` when present.

---

### 2.3 Taxonomy vocabularies

| Column               | Type   | Description |
|----------------------|--------|-------------|
| `id`                 | uuid   | Primary key. |
| `website_id`         | uuid   | FK to `taxonomy_websites(id)`. |
| `name`               | text   | Vocabulary name (e.g. Unit Strength, Family Type, Active Ingredient). |
| `visibility`         | text   | e.g. Public / Hidden from Public. |
| `metadata_json`      | jsonb  | Full source payload or extra fields. |

**Uniqueness:** `(website_id, airtable_record_id)` when source record id is present.

Vocabularies define the “type” of terms: e.g. Unit Strength holds “15mg per tablet”, “30mg per tablet”; Family Type holds product family labels.

---

### 2.4 Taxonomy terms (including “product-like” terms)

| Column               | Type   | Description |
|----------------------|--------|-------------|
| `id`                 | uuid   | Primary key. |
| `vocabulary_id`      | uuid   | FK to `taxonomy_vocabularies(id)`. |
| `website_id`         | uuid   | FK to `taxonomy_websites(id)`. |
| `term_name`          | text   | Display label (e.g. 15mg per tablet, THCV Products, 7-Hydroxy Products). |
| `published_status`   | text   | e.g. Published, Unpublished, To Publish. |
| `family_type`        | text   | Optional classification. |
| `term_id_external`   | text   | External system id (e.g. Drupal term id). |
| **`url_value`**      | text   | URL path/slug (e.g. `7-hydroxy`, `thcv-products`). Queryable; many terms have it. |
| `metadata_json`      | jsonb  | **Full source row** — every field from the source (images, Meta Title, Description, Visibility, etc.). |
| `airtable_record_id`| text   | Optional source record id (see §5). |

**Uniqueness:** `(website_id, airtable_record_id)` when present.

**Product-like terms:** Items such as “15mg per tablet”, “20mg MGM-15 Tablets” are **terms** under vocabularies like **Unit Strength** or **Family Type**. There is no separate “Products” table in the taxonomy schema; “products” you see in a UI (e.g. “242 linked terms” for a website) are the subset of **terms** linked to that website (filter `taxonomy_terms WHERE website_id = ?`).

**Indexes:** `vocabulary_id`, `website_id`, `(website_id, url_value)` where `url_value` is not null.

---

### 2.5 Master reference tables (global, not per-website)

| Table                     | Key columns      | Purpose |
|---------------------------|------------------|---------|
| `taxonomy_strains`        | name             | Strain names (e.g. Hybrid, Indica, Sativa). |
| `taxonomy_terpenes`       | name             | Terpene names. |
| `taxonomy_effects`        | name             | Effect names. |
| `taxonomy_scents`         | name             | Scent/aroma names. |
| `taxonomy_restrictions`   | name             | Restriction labels. |

Each has `metadata_json` for the full source row. Terms or other entities may reference these via `metadata_json` or future FKs.

---

### 2.6 Facet paths and term links

| Table                       | Purpose |
|-----------------------------|---------|
| `taxonomy_facet_paths`      | Named path per website (e.g. navigation facet). Columns: `website_id`, `name`, `metadata_json`. |
| `taxonomy_facet_path_terms` | Many-to-many: `(facet_path_id, term_id)`. Orders or groups terms into a facet path. |

---

### 2.7 Media automation

| Table                       | Purpose |
|-----------------------------|---------|
| `taxonomy_media_automation` | Definitions for media automation; `name`, `metadata_json`. Global (no website_id in current schema). |

---

### 2.8 Brand catalog (separate from taxonomy)

| Table                     | Purpose |
|---------------------------|---------|
| `brand_catalog_products`  | Products and **pricing** per brand (`brand_profile_id`). Columns: `name`, `description`, `image_url`, `price_cents`, `currency`, `source_system`, `external_ref`, `metadata_json`. Filled from **Shopify** (or other commerce), not from the taxonomy import. |

Taxonomy **terms** describe categories and product-like variants (e.g. “15mg per tablet”). Actual **product catalog and prices** live in `brand_catalog_products` and come from commerce systems.

---

## 3. First-class columns vs metadata

- **Queryable as columns:** `term_name`, `published_status`, `family_type`, `term_id_external`, **`url_value`**, `taxonomy_websites.url`, vocabulary/website names, etc.
- **Only in `metadata_json` (and raw payloads):** Any other field from the source (e.g. Meta Title, Meta Description, images, Visibility, Drupal Status, custom fields). Use `metadata_json->>'FieldName'` or application logic to read them.
- **Full row:** Every imported record stores the complete source row in `metadata_json` (and in `raw_airtable_rows.payload` when using the legacy import path), so nothing is dropped.

---

## 4. APIs and verification

- **GET /v1/taxonomy/websites** — List websites (optionally by org).
- **GET /v1/taxonomy/websites/:id/vocabularies** — Vocabularies for a website.
- **GET /v1/taxonomy/vocabularies/:id/terms** — Terms for a vocabulary; response includes **`url_value`**.
- **GET /v1/catalog/products?brand_profile_id=** — Brand catalog (products/pricing), not taxonomy terms.

Verification scripts:

- `npm run verify:taxonomy-db` — Counts for organizations, websites, vocabularies, terms (and terms with `url_value`), import batches, `brand_profiles.website_id`.
- `npm run test:taxonomy-catalog-api` — Smoke test for taxonomy and catalog endpoints.

---

## 5. Source mapping (legacy import reference)

When data was imported from a **legacy source** (one base with tables such as Websites, Vocabulary, Terms, Facet Paths, and master tables), the mapping into the canonical schema was:

| Source table (legacy) | Canonical table              | Notes |
|-----------------------|-----------------------------|-------|
| Websites              | taxonomy_websites          | One row per site; `organization_id` set from import scope (e.g. `first-capital-group`). |
| Vocabulary            | taxonomy_vocabularies      | One row per vocabulary per website. |
| Terms                 | taxonomy_terms             | One row per term; **product-like** items (e.g. “15mg per tablet”) are terms under Unit Strength / Family Type vocabularies. `url_value` populated from source “Url Value” where present. |
| Facet Paths           | taxonomy_facet_paths      | Plus taxonomy_facet_path_terms for term links. |
| Master: Strains       | taxonomy_strains           | |
| Master: Terpenes      | taxonomy_terpenes          | |
| Master: Effects       | taxonomy_effects           | |
| Master: Scents        | taxonomy_scents            | |
| Restrictions          | taxonomy_restrictions       | |
| Media Automation      | taxonomy_media_automation   | |

Other source tables (e.g. Ideas, Master: Terms, Master: Facet Paths, Media Style, Media Template, Master: Brands) were not mapped into the canonical taxonomy tables in that run; their data can be carried in raw landing and/or `metadata_json` in related entities if needed later.

Import config (which source entity maps to which canonical table) lives in **`data/<scope>/mapping/base-to-entity.json`** for that scope. The schema described in §1–§3 is stable; only the mapping and import script need to change when switching away from the legacy source.

---

## 6. Related docs

- [ORGANIZATION_AND_CLIENT_GROUPING.md](ORGANIZATION_AND_CLIENT_GROUPING.md) — Organizations, scope-key, and brand ↔ website.
- [AIRTABLE_AND_PRODUCT_IMPORT_PLUGIN_ANALYSIS.md](AIRTABLE_AND_PRODUCT_IMPORT_PLUGIN_ANALYSIS.md) — Product/catalog plan, readiness, and what is transferred (§8).
- [AIRTABLE_METADATA_AND_PAGE_MAPPING.md](AIRTABLE_METADATA_AND_PAGE_MAPPING.md) — How Airtable/metadata associates 100% with product/compound/category pages and reflects to this structure.
- [PHARMACY_IMPORT.md](PHARMACY_IMPORT.md) — Pharmacy Airtable (Products + Variations) → organization, taxonomy website, brand_catalog_products.
- [reference/cli-commands.md](reference/cli-commands.md) — Taxonomy verification and import CLI.
