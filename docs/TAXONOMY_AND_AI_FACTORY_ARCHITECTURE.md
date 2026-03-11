# Taxonomy schema and AI Factory architecture

This doc explains how the **Airtable-derived taxonomy schema** (organizations → websites → vocabularies → terms, brand catalog) fits into AI Factory’s overall architecture: brands, initiatives, runners, and scaling multiple brands with large catalogs. It also clarifies how historic “pre–AI Factory” usage and ongoing use of Airtable map onto the canonical model.

**Canonical schema reference:** [TAXONOMY_SCHEMA_AND_MAPPING.md](TAXONOMY_SCHEMA_AND_MAPPING.md)  
**Organization and grouping:** [ORGANIZATION_AND_CLIENT_GROUPING.md](ORGANIZATION_AND_CLIENT_GROUPING.md)  
**Product/catalog plan:** [AIRTABLE_AND_PRODUCT_IMPORT_PLUGIN_ANALYSIS.md](AIRTABLE_AND_PRODUCT_IMPORT_PLUGIN_ANALYSIS.md)

---

## 1. How the taxonomy schema fits the overall structure

### 1.1 Hierarchy

| Layer | Role in AI Factory |
|-------|--------------------|
| **Organizations** | Top-level tenant/client (e.g. First Capital Group, Pharmacy Time). Scope for imports and multi-brand grouping; not the primary unit for campaigns or runners. |
| **Taxonomy websites** | One per “site” or brand context under an org. Holds vocabularies and terms (categories, strengths, product-like labels). Optional link: `brand_profiles.website_id` → `taxonomy_websites.id`. |
| **Brand profiles** | **Primary owner** of product catalog, initiatives, campaigns, design tokens, and (optionally) a taxonomy website. Everything execution-related is keyed by `brand_profile_id`. |
| **Brand catalog** | Products and pricing **per brand** (`brand_catalog_products.brand_profile_id`). Filled from Airtable (Pharmacy), Shopify, or WooCommerce; not from the taxonomy “Terms” table. |
| **Stores** | Commerce systems (WooCommerce, Shopify) linked to a brand via `stores.brand_profile_id`. Raw snapshots and catalog rows can reference them. |

So: **orgs** group data and imports; **brands** own catalog, initiatives, and runners; **taxonomy** (websites → vocabularies → terms) describes structure and categories; **catalog** is the brand’s product/pricing source of truth.

### 1.2 Where the Airtable logic was applied

- **Organizations:** Used as scope for taxonomy imports (e.g. `pharmacy-time`, `first-capital-group`). API: `GET /v1/organizations`.
- **Taxonomy websites:** One per Airtable “Website” (or synthetic per base, e.g. Pharmacy Time). Linked to org via `organization_id`. API: `GET /v1/taxonomy/websites`, optional `?organization_id=`.
- **Vocabularies and terms:** Imported from Airtable Vocabulary/Terms (and product-like terms from Unit Strength / Family Type, etc.). APIs: `GET /v1/taxonomy/websites/:id/vocabularies`, `GET /v1/taxonomy/vocabularies/:id/terms` (include `url_value`).
- **Brands:** Each brand can have `website_id` pointing at a taxonomy website. Brand catalog is **always** keyed by `brand_profile_id`; Airtable Products/Variations (e.g. Pharmacy) are imported into `brand_catalog_products` with `source_system = 'airtable'`.
- **Stores:** WooCommerce/Shopify stores are in `stores` with `brand_profile_id`; sync scripts write to `brand_catalog_products` and optionally cross-reference Airtable-sourced rows (e.g. `metadata_json.woocommerce_product_id`).

So the **same** Airtable schema (org → website → vocabularies → terms + product-like terms) is applied consistently: taxonomy is org/website-scoped; catalog and execution are brand-scoped; brands can optionally attach a taxonomy website.

---

## 2. Managing and scaling multiple brands with large catalogs

The Airtable design (many websites per org, many terms per website, product-like terms inside vocabularies) maps directly onto “multiple brands, massive catalogs”:

- **Per-org scope:** Imports and APIs can filter by `organization_id` or `scope_key`, so one client’s data never mixes with another’s.
- **Per-website taxonomy:** Each brand/site has its own vocabularies and terms (strengths, categories, etc.), so scaling = adding more websites (and optionally more orgs).
- **Per-brand catalog:** Large catalogs live in `brand_catalog_products` with pagination (`GET /v1/catalog/products?brand_profile_id=...&limit=&offset=`). List responses include `metadata_json` so WooCommerce/Shopify cross-reference and legacy fields are available.
- **Stores and raw snapshots:** `stores` and `raw_woocommerce_snapshots` (and any future raw Airtable/Shopify storage) allow replay and cross-reference without re-fetching from source; sync scripts keep catalog and metadata in sync.

Efficiency: list APIs are paginated; catalog and taxonomy are indexed by `brand_profile_id`, `website_id`, and `organization_id` so that “everything is fully listable via the API” without loading full catalogs into memory.

---

## 3. Historic data and “they still use Airtable”

- **Historic “how they managed before AI Factory”:** Previously, everything lived in Airtable (Websites, Vocabulary, Terms, product-like terms, etc.). The canonical schema **preserves that structure** in DB form: organizations → taxonomy_websites → taxonomy_vocabularies → taxonomy_terms. Full source rows are kept in `metadata_json` and in raw tables (`raw_airtable_rows`, etc.), so no historic information is dropped. Product and pricing from Airtable (e.g. Pharmacy Products/Variations) are stored in `brand_catalog_products` with the full row in `metadata_json`.
- **“They still use it”:** Airtable remains the source of truth for many operations. The architecture supports that by:
  - **Idempotent imports:** Re-running the import (Airtable → raw → canonical) updates taxonomy and catalog from current Airtable state.
  - **Dual use:** Console and runners can read from the **canonical** tables (taxonomy + catalog) while humans continue to edit in Airtable; the next import syncs changes.
  - **Optional website link:** `brand_profiles.website_id` ties a brand to a taxonomy website so that “this brand’s site” is clear; catalog is still brand-scoped for execution.

So the Airtable schema was not replaced—it was **mirrored** into AI Factory (org → website → vocabularies → terms + brand catalog) and wired to brands and list APIs so that both “historic” and “current” use are supported.

---

## 4. What is fully listed via the API

All of the following are listable via the Control Plane API so that nothing is “hidden” behind the DB only:

| Resource | Endpoint | Notes |
|----------|----------|--------|
| Organizations | `GET /v1/organizations` | Optional `?slug=`, pagination `limit` / `offset`. |
| Taxonomy websites | `GET /v1/taxonomy/websites` | Optional `?organization_id=`, pagination. |
| Vocabularies (per website) | `GET /v1/taxonomy/websites/:id/vocabularies` | All vocabularies for that website. |
| Terms (per vocabulary) | `GET /v1/taxonomy/vocabularies/:id/terms` | Includes `url_value`; paginated. |
| Brand catalog products | `GET /v1/catalog/products?brand_profile_id=` | Includes `metadata_json` (e.g. WooCommerce ids, permalinks). Paginated. |
| Commerce stores | `GET /v1/stores` | Optional `?scope_key=`, `?brand_profile_id=`. Paginated. |
| Brand profiles | `GET /v1/brand_profiles` | Includes `website_id` when set. |

Creating/upserting catalog products: `POST /v1/catalog/products` (brand_profile_id, source_system, external_ref, plus name, description, image_url, price_cents, currency, metadata_json).

---

## 5. Where taxonomy and catalog are used (today vs possible)

| Consumer | Taxonomy | Catalog |
|----------|----------|--------|
| **Console (email/landing wizards)** | Not yet; could filter or suggest by website/vocabulary/terms. | Can use sitemap/URL or (when wired) “products from catalog” by brand. |
| **Email runner** | Not yet. | Uses campaign metadata first; can fall back to `GET /v1/catalog/products?brand_profile_id=` when no products in campaign. |
| **Initiatives** | No `website_id` today; optional future scope. | Initiative has `brand_profile_id`; runners already get brand context and can use catalog by that brand. |
| **Ads/commerce** | Not required. | Stores and catalog (and ads `products` where used) are brand- or store-scoped. |
| **Import/sync scripts** | Write org, taxonomy_websites, vocabularies, terms. | Write brand_catalog_products (Airtable, WooCommerce, Shopify). |

So the **logic** of the Airtable schema (org → website → vocabularies → terms, product-like terms, brand catalog) **is** applied to brands and the overall architecture: taxonomy is scoped by org/website, catalog and execution by brand, and everything above is fully listable via the API. Deeper runner/Console use of taxonomy (e.g. initiative `website_id`, filters by term or vocabulary) is the natural next step when you want campaigns to be taxonomy-aware.
