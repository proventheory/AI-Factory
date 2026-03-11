# Airtable and website metadata ↔ product / compound / category page ↔ new structure (100%)

This document states **exactly** how every piece of Airtable (and related) metadata ties to a **product page**, **compound page**, or **category page** on the website, and how that maps into the **canonical AI Factory structure**. So the association is 100% explicit and reversible.

---

## 1. One-row-per-page rule

In the canonical schema:

- **One product or variation page** on the website (e.g. a WooCommerce product/variation URL) ↔ **one row** in **brand_catalog_products** (plus optional link to **products** in ads commerce).
- **One category or compound landing page** (e.g. a URL like `/category/thcv-products` or `/compounds/7-hydroxy`) ↔ **one row** in **taxonomy_terms** with **url_value** = that page’s slug (and **taxonomy_websites.url** = base URL).

All Airtable (and source) metadata for that page lives in **metadata_json** on that same row (and in raw tables for replay). So: **one page = one canonical row; one canonical row = one page** (once URL/slug is set).

---

## 2. Product or variation page (e.g. Pharmacy Time)

| Layer | What it is | Where it lives in AI Factory |
|-------|------------|------------------------------|
| **Website** | A product or variation page (e.g. WooCommerce permalink). | — |
| **WooCommerce** | Product/variation with meta `_product_key`, `_strength_key`, size; permalink. | **products** (store_id, external_ref) + **raw_woocommerce_snapshots** (full payload). |
| **Airtable (Pharmacy)** | Products + Variations: compound_display, Form, category, Strength (mg/g), Price, Size, Benefits, Image, etc. | **brand_catalog_products**: one row per sellable item; **metadata_json** = full merged Airtable fields. |
| **Cross-reference** | Same real-world item: Airtable row ↔ WC product/variation. | **brand_catalog_products.metadata_json** gets **woocommerce_product_id**, **woocommerce_variation_id**, **woocommerce_permalink** when keys match. |

**Association (100%):**

- **Airtable** row (Product + Variation merged) → **brand_catalog_products** row (same logical product/variation).
- **Website product/variation page URL** = **metadata_json.woocommerce_permalink** (after WooCommerce sync).
- **Reverse:** Given a catalog row, the **product or variation page** is **metadata_json.woocommerce_permalink** (if set); all **metadata on that page** (compound, form, category, strength, price, etc.) is in **metadata_json** (and in raw Airtable payloads).

So: **Airtable metadata for that product/variation is associated with the page by virtue of being on the same brand_catalog_products row; the page URL is stored in that row’s metadata_json.**

---

## 3. Compound or category page (taxonomy bases, e.g. First Capital)

| Layer | What it is | Where it lives in AI Factory |
|-------|------------|------------------------------|
| **Website** | A category or compound page (e.g. `/category/thcv-products`, `/compounds/7-hydroxy`). | — |
| **Airtable (legacy)** | Terms table: Term Name, **Url Value**, Meta Title, Description, images, Vocabulary, etc. | **taxonomy_terms**: **url_value** = URL slug; **metadata_json** = full source row. |
| **Canonical** | One term = one such page. | **taxonomy_terms** (website_id, vocabulary_id, term_name, **url_value**, metadata_json). Full URL = **taxonomy_websites.url** + path built from **url_value**. |

**Association (100%):**

- **Airtable** Term row (with “Url Value”) → **taxonomy_terms** row; **url_value** = slug for that page.
- **Website category/compound page URL** = **taxonomy_websites.url** + path segment from **taxonomy_terms.url_value** (path format depends on site; slug is the stable part).
- **Reverse:** Given a **taxonomy_terms** row, the **category/compound page** is identified by **url_value** (and website); all **metadata for that page** (Meta Title, Description, images, etc.) is in **metadata_json**.

So: **Airtable metadata for that category/compound page is associated with the page by being on the same taxonomy_terms row; the page slug is url_value.**

---

## 4. Pharmacy Time: products only (no taxonomy terms in Airtable)

Pharmacy Time’s Airtable has **Products** and **Variations** only (no Websites/Vocabulary/Terms in that base). So:

- **Every product or variation page** on the Pharmacy Time site maps to **one brand_catalog_products** row (Airtable + optional WooCommerce cross-reference).
- There is **no** taxonomy_terms row for Pharmacy product pages; the **product/variation page** is entirely represented by **brand_catalog_products** (and **metadata_json.woocommerce_permalink** after sync).
- **Compound/category** landing pages, if they exist on the site, are not yet in Airtable for Pharmacy; if added later, they would map to **taxonomy_terms** (with url_value) or another agreed canonical entity.

---

## 5. Key fields that “reflect back” to the page

| Canonical table | Field(s) that point to the website page | Source of metadata for that page |
|-----------------|----------------------------------------|----------------------------------|
| **brand_catalog_products** | **metadata_json.woocommerce_permalink** (after WC sync) | **metadata_json** (full Airtable merged row) |
| **taxonomy_terms** | **url_value** (slug); full URL = website base + slug | **metadata_json** (full Airtable/source row) |
| **taxonomy_websites** | **url** (base URL for the site) | **metadata_json** (if imported from source) |

So: **every piece of Airtable (and site) metadata that describes a product, variation, compound, or category page is either (1) on the one brand_catalog_products row that corresponds to that product/variation page, or (2) on the one taxonomy_terms row that corresponds to that category/compound page.** The new structure reflects that 1:1.

---

## 6. Summary

- **Product/variation page** → **brand_catalog_products** (one row); page URL in **metadata_json.woocommerce_permalink**; all Airtable/metadata for that page in **metadata_json** (and raw).
- **Category/compound page** → **taxonomy_terms** (one row); page slug in **url_value**; all metadata in **metadata_json** (and raw).
- **Airtable and website metadata** for a given product or compound/category page is **fully associated** with that page in the new structure by storing it on that single canonical row and by storing the page identifier (permalink or url_value) on the same row.

This gives a **100%** association: from page → canonical row and from canonical row (and its metadata) → page.
