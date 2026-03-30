# WP → Shopify migration – Docs and Artifacts

This folder is the default output for standalone migration scripts and a reference for pipeline artifacts.

## Scripts (standalone)

| Script | Purpose |
|--------|--------|
| `scripts/wp-shopify-migration-url-inventory.mjs` | Sitemap-first URL discovery; writes `<host>-url-inventory.json` and `.md` here. |
| `scripts/seo/url-mapping-template.mjs` | Reads inventory JSON, writes `url_mapping.json` with `existing_url` filled, `migration_url` for manual fill. |
| `scripts/wp-shopify-migration-gsc-ga-export.mjs` | GSC top pages/queries and GA4 top pages; writes `gsc_top_pages.json`, `gsc_queries.json`, `ga4_top_pages.json`. |

Set `SEO_INVENTORY_OUT_DIR=./docs/wp-shopify-migration` to force output here (or leave default).

## GSC / GA4 (Option B/C)

**Credentials:** Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of a Google Cloud service account JSON key that has:
- **GSC:** Search Console API enabled; scope `https://www.googleapis.com/auth/webmasters.readonly`; site added in Search Console.
- **GA4:** Analytics Data API enabled; scope `https://www.googleapis.com/auth/analytics.readonly`; GA4 property access for the service account.

**Control-plane endpoints (Option B):**
- `POST /v1/seo/gsc_report` — body: `{ "site_url": "https://example.com/", "date_range": "last28days", "row_limit": 500 }`. Returns `{ site_url, date_range, pages, queries, error? }`.
- `POST /v1/seo/ga4_report` — body: `{ "property_id": "123456789", "row_limit": 500 }`. Returns `{ property_id, pages, error? }`.

**Runner jobs (Option C):** In an `wp_shopify_migration` run, set `goal_metadata.gsc_site_url` and/or `goal_metadata.ga4_property_id`. The `seo_gsc_snapshot` and `seo_ga4_snapshot` jobs call the same APIs and write `seo_gsc_snapshot` / `seo_ga4_snapshot` artifacts (used by `seo_risk_scorer`). Without credentials, jobs still succeed and write empty `pages`/`queries` plus an `error`/`note` field.

---

## Pipeline (wp_shopify_migration)

Create an initiative with:

- `intent_type`: `"wp_shopify_migration"`
- `goal_metadata`: `{ "source_url": "https://...", "target_url": "https://..." }`

Optional: `crawl_delay_ms`, `max_urls`, `fetch_page_details`, `matching_rules`, `gsc_site_url`, `ga4_property_id`.

Artifacts produced by the pipeline (in DB, not necessarily in this folder):

- `seo_url_inventory` (source + target)
- `seo_url_match_report`
- `seo_redirect_verification`
- `seo_content_parity_report`
- `seo_technical_diff_report`
- `seo_ranking_risk_report`
- `seo_internal_link_graph`, `seo_internal_graph_diff_report`
- `seo_audit_summary`

## SOPs

See [docs/SOP_SEO_MIGRATION.md](../SOP_SEO_MIGRATION.md) for:

- Pre-migration URL inventory, technical baseline, and mapping
- Migration execution (redirect map, content)
- Post-migration verification
- Internal link graph reconciliation

## Schema and job reference

- Artifact schemas: [artifact-schemas.md](./artifact-schemas.md)
- Job contracts: [job-contracts.md](./job-contracts.md)
- Scoring model: [scoring-model.md](./scoring-model.md)
