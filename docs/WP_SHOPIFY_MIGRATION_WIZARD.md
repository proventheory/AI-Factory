# WordPress → Shopify migration wizard

This document defines the **9-step WordPress → Shopify migration wizard** for moving a site (e.g. [stigmahemp.com](https://stigmahemp.com/) on WordPress) to a new platform (e.g. [stigmathc.com](https://stigmathc.com/) on Shopify) without losing rankings, traffic, or authority. The keyword-mapping step is central: migration should be driven by **future search opportunity**, not by replicating the old site structure 1:1.

---

## Wizard steps (overview)

| Step | Name | Goal | AI Factory pieces (existing vs new) |
|------|------|------|-------------------------------------|
| **1** | Crawl source site | Map **every** live URL (not just sitemap) for redirects/consolidation | **Existing:** `crawlSite()` (sitemap-first), `seo_source_inventory` job. **New:** WordPress sitemap candidates, optional **link-following crawl** so pages not in sitemap are discovered. |
| **2** | Pull GSC, analytics, backlinks | Identify pages that drive traffic, rankings, revenue, authority | **Existing:** GSC/GA4 via `seo_gsc_snapshot`, `seo_ga4_snapshot`; API `POST /v1/seo/gsc_report`, `/v1/seo/ga4_report`. **New:** Backlink data (e.g. Ahrefs/SEMrush API or CSV import); merge with crawl + GSC/GA4 into a single **traffic/value** view. |
| **3** | Map keyword strategy | Analyze search demand for categories, products, content; decide what deserves dedicated pages in Shopify | **New:** Keyword mapping job (LLM or external tool): input = URL inventory + GSC queries/pages; output = keyword themes, recommended page types (collection vs product vs landing vs consolidate). |
| **4** | Prioritize page creation | Define which collections, products, landing pages, and content exist in the new site; hierarchy (nav vs footer vs deep) | **New:** Prioritization job: input = keyword map + business value; output = **page list** (URL path, type, priority, placement). |
| **5** | Build redirect map | Map every old URL → best new destination; redirects support the new keyword architecture | **Existing:** URL inventories (source + target). **New:** Redirect-map job: old URL → new URL (or “consolidate into X” / “drop”). Uses step 4–5 output so high-value URLs don’t point “somewhere close” but to the right strategic page. |
| **6** | Validate destinations | No high-value URL should redirect to a weak or irrelevant page | **New:** Validation job: for each redirect, check that destination page exists (or is planned) and can inherit intent; flag gaps. |
| **7** | Rebuild internal linking | Homepage, header, footer, collections, contextual links push authority to high-demand pages | **New:** Internal-linking plan: which links to add where (from runbook or LLM-assisted suggestion). Output = link matrix or checklist for implementation in Shopify. |
| **8** | Launch | Point domain to Shopify only after redirects, pages, metadata, internal linking confirmed | **Operational:** Checklist + optional Control Plane “launch gate” (e.g. all redirects have valid destinations, no critical gaps). |

---

## Step 1: Crawl entire source site (every live URL)

- **Goal:** Full universe of pages for redirect/consolidation decisions—not only sitemap URLs.
- **Existing:**  
  - `runners/src/lib/seo/crawl.ts`: `crawlSite()` with sitemap-first discovery and optional `fetchPageDetails`.  
  - `seo_source_inventory` job: uses `crawlSite()` with `goal_metadata.source_url`, `max_urls`, `crawl_delay_ms`, `fetch_page_details`.
- **Enhancements:**  
  1. **WordPress sitemap candidates:** Add `wp-sitemap.xml`, `wp-sitemap-posts-post-1.xml`, `wp-sitemap-pages-1.xml`, `wp-sitemap.xml` (WP 5.5+) to `sitemapCandidates()` so WordPress sites like stigmahemp.com are fully discovered from sitemaps when available.  
  2. **Link-following crawl (optional):** If `useLinkCrawl: true` in options, after sitemap discovery (or when sitemap is missing), start from homepage and follow internal links (same-origin `<a href>`) with a BFS/DFS cap (e.g. `max_urls`). Merge with sitemap URLs so we don’t miss pages that WordPress doesn’t list in sitemaps.
- **Output:** `seo_url_inventory` artifact: list of URLs with path, type, status, optional title/meta/h1 (when `fetchPageDetails`). Stored as run artifact; consumed by steps 2 (join with GSC/GA4) and 5 (redirect map).

---

## Step 2: GSC, analytics, backlinks

- **Goal:** Know which pages drive traffic, rankings, revenue, authority.
- **Existing:**  
  - GSC: `POST /v1/seo/gsc_report` (site_url, date_range, row_limit); runner job `seo_gsc_snapshot`.  
  - GA4: `POST /v1/seo/ga4_report` (property_id, row_limit); runner job `seo_ga4_snapshot`.  
  - Google OAuth for brand/initiative: `GET /v1/seo/google/auth`, callback, `GET/DELETE /v1/brand_profiles/:id/google_connected|google_credentials`.
- **New:**  
  - **Backlinks:** Optional integration (Ahrefs/SEMrush API or CSV upload) to get referring URLs/domains per page. Stored alongside GSC/GA4 in a **“traffic & authority”** artifact or merged into step 1 inventory with columns: impressions, clicks, revenue (if GA4 ecommerce), backlink count.  
  - **Wizard API:** Endpoint or run step that: (1) runs or fetches GSC/GA4 for the source property, (2) optionally ingests backlink CSV/API, (3) joins by URL with crawl inventory and outputs a single **value-weighted URL list** (e.g. top pages by clicks, revenue, backlinks).

---

## Step 3: Connect platforms & migrate data (WooCommerce → Shopify)

- **Goal:** Connect WordPress/WooCommerce (source) and Shopify (destination) via API; optionally migrate products, categories, customers, redirects, discounts, blog posts, and pages in one place (Matrixify-style).
- **Existing:**  
  - **Dry run:** `POST /v1/wp-shopify-migration/dry_run` — WooCommerce server URL + consumer key/secret + entities; returns counts from WooCommerce REST API v3 and WP REST API (products, categories, customers, coupons, orders, posts, pages).  
  - **Run:** `POST /v1/wp-shopify-migration/run` — same WooCommerce credentials + Shopify store URL and Admin API access token + entities; currently returns a “not yet implemented” message; when implemented will pull from WooCommerce/WP and push to Shopify Admin API.
- **Reference:** [Matrixify: Migrate from WordPress/WooCommerce to Shopify](https://matrixify.app/tutorials/migrate-store-from-wordpress-woocommerce-to-shopify/) — WooCommerce API URL format `https://consumer_key:consumer_secret@server`, dry run to preview, then full import; redirects generated from product/category URLs.
- **To implement (full ETL):** Pull products, categories, customers, orders, coupons from `wc/v3`; posts and pages from `wp/v2`; generate redirects from product/category permalinks to Shopify equivalents; push to Shopify via Admin API (products, collections, customers, redirects, price rules, blog articles, pages).

---

## Step 4: Keyword strategy across the site

- **Goal:** Understand search demand for existing categories, products, and content; decide which keyword themes deserve dedicated pages, which to consolidate, which to elevate.
- **New:**  
  - **Input:** URL inventory (step 1) + GSC queries/pages (step 2) + optional keyword tool export.  
  - **Job:** “Keyword strategy” node (e.g. `seo_keyword_mapping`): groups URLs and queries into themes; suggests page type (collection, product, landing, blog hub, consolidate into X, drop). Can be LLM-assisted (e.g. “given these URLs and top queries, recommend Shopify structure”) or rule-based + manual.  
  - **Output:** Artifact `seo_keyword_strategy`: keyword themes, suggested URLs/page types, consolidation map (old URL → “merge into theme X”).  
- **Why it matters:** Prevents migrating by “old structure only”; aligns new site with search opportunity.

---

## Step 5: Prioritize page creation

- **Goal:** Define exactly which collections, products, landing pages, and supporting content exist in the new site; what gets nav vs footer vs deep.
- **New:**  
  - **Input:** Keyword strategy (step 4) + business value (e.g. revenue from GA4, strategic flags).  
  - **Job:** “Page prioritization” (e.g. `seo_page_priority`): outputs **page list** for Shopify—path, type, priority score, placement (nav / footer / deep), and which old URLs will redirect here.  
  - **Output:** Artifact `seo_page_plan`: list of new pages to create, with hierarchy and redirect targets. Feeds step 6 (redirect map) and step 7 (destination validation).

---

## Step 6: Redirect map (SEO priority)

- **Goal:** Every old URL → best new destination; redirects support the new keyword architecture.
- **New:**  
  - **Input:** Source URL inventory (step 1), page plan (step 5), keyword strategy (step 4).  
  - **Job:** “Redirect mapper” (e.g. `seo_redirect_map`): for each old URL, pick new URL (or “consolidate into X”, “drop”). Rules: high-value URLs (GSC/GA4/backlinks) must map to a page that can inherit intent; avoid sending to generic homepage when a collection/product exists.  
  - **Output:** Artifact `seo_redirect_map`: array of `{ old_url, new_url, status: 301|302|drop|consolidate }`. Exportable as CSV or Shopify bulk redirect import format.

---

## Step 7: Validate destinations

- **Goal:** Every important redirect has a proper destination; no high-value URL → weak/irrelevant page.
- **New:**  
  - **Input:** Redirect map (step 6), target site URL list (from step 1 target crawl or from page plan).  
  - **Job:** “Redirect validator”: for each redirect with new_url, verify that new_url exists (HTTP 200 on target domain) or is in the “to be created” page plan; flag missing or low-quality destinations.  
  - **Output:** Artifact `seo_redirect_validation`: same as redirect map plus flags (e.g. `destination_missing`, `destination_weak`). Wizard UI shows gaps; launch (step 8) can block until critical gaps are resolved.

---

## Step 8: Internal link flow

- **Goal:** Use homepage, header, footer, collections, and contextual links to push authority to high-demand and strategic pages.
- **New:**  
  - **Input:** Page plan (step 5), keyword strategy (step 4).  
  - **Job:** “Internal linking plan” (e.g. `seo_internal_links`): suggests which links to add where (e.g. “link from homepage to /collections/tonics”, “add footer link to /pages/lab-reports”). Can be template-based or LLM-assisted.  
  - **Output:** Artifact `seo_internal_link_plan`: list of links (from_url, to_url, anchor, placement). Implemented manually or via Shopify theme/Apps; wizard does not auto-apply.

---

## Step 9: Launch

- **Goal:** Switch domain to Shopify only when redirects, page creation, metadata, and internal linking are confirmed.
- **Operational:**  
  - **Checklist:** Redirect map implemented in Shopify (or CDN); all planned pages created; metadata (titles, descriptions) set; critical internal links in place; 404s for dropped URLs handled (or redirect to parent).  
  - **Optional:** Control Plane “launch gate” that runs step 6 validation and blocks “Go live” until no critical destination gaps (or allow override with acknowledgment).  
  - No new job type required; this is a workflow/UI state (e.g. “Launch” button in Console that shows checklist and optional gate).

---

## Data flow summary

```
Step 1: Crawl source     → seo_url_inventory (source)
Step 2: GSC/GA4/backlinks → seo_gsc_snapshot, seo_ga4_snapshot, (backlinks) → merged "value" view
Step 3: Keyword strategy  → seo_keyword_strategy (themes, page types, consolidation)
Step 4: Page prioritization → seo_page_plan (new pages, hierarchy, placement)
Step 5: Redirect map      → seo_redirect_map (old_url → new_url)
Step 6: Validate          → seo_redirect_validation (redirect map + flags)
Step 7: Internal links     → seo_internal_link_plan (from_url, to_url, anchor, placement)
Step 8: Launch            → Checklist + optional gate
```

---

## Where this lives in AI Factory

- **Pipeline:** Extend `wp_shopify_migration` (or add `seo_migration_wizard`) with nodes for steps 3–7. Steps 1–2 already exist (source/target inventory, GSC/GA4).  
- **Runner:** New job types: `seo_keyword_mapping`, `seo_page_priority`, `seo_redirect_map`, `seo_redirect_validation`, `seo_internal_links`. Handlers call into shared SEO lib and optionally LLM. For Step 1, `seo_source_inventory` supports `goal_metadata.use_link_crawl` to enable link-following crawl.  
- **Control Plane:**  
  - **Step 1 (crawl):** `POST /v1/wp-shopify-migration/crawl` — body: `{ source_url, use_link_crawl?, max_urls?, crawl_delay_ms?, fetch_page_details? }`. Returns `{ source_url, urls, crawl_mode, stats }` (same shape as runner artifact). Use for wizard UI without creating a run.  
  - Steps 2–8: GSC/GA4 via existing `POST /v1/seo/gsc_report`, `POST /v1/seo/ga4_report`; steps 3–7 via initiative → plan → run when those nodes exist.  
- **Console:** **WordPress → Shopify migration** flow (`/wp-shopify-migration`): one page per step (or stepper UI). Each step: configure (e.g. source URL, target URL, GSC site), run, view artifact (table/export). Step 8 = launch checklist + “Go live” (no domain flip in app; user does that in Shopify/DNS).

---

## Stigma Hemp → Stigma THC (example)

- **Source:** https://stigmahemp.com/ (WordPress).  
- **Target:** https://stigmathc.com/ (Shopify).  
- **Step 1:** Crawl stigmahemp.com with WordPress sitemap candidates + link-following so we get all product pages, blog, policies, etc.  
- **Step 2:** Connect GSC/GA4 for stigmahemp.com (or property that includes it); pull top pages/queries; optional backlinks.  
- **Step 3:** Keyword mapping: e.g. “THC tonics”, “THC teas”, “lab reports” as themes; decide which become collections vs products vs one landing page.  
- **Step 4:** Page plan for stigmathc.com: e.g. /collections/tonics, /collections/teas, /pages/lab-reports, products, etc., with nav/footer placement.  
- **Step 5:** Redirect map: e.g. old /product/energy-tonic → new /products/energy-tonic; old /blog/post-x → consolidate into /blogs/news or drop.  
- **Step 6:** Ensure every mapped URL has a valid destination on stigmathc.com.  
- **Step 7:** Internal link plan: homepage links to top collections; footer to policies/lab reports.  
- **Step 8:** After checklist, point stigmahemp.com (or chosen domain) to Shopify and enable redirects.

---

## Implementation order

1. **Crawl (Step 1):** Add WordPress sitemap candidates and link-following crawl in `runners/src/lib/seo/crawl.ts`; optional `useLinkCrawl` in `CrawlOptions`.  
2. **Backlinks (Step 2):** Optional: CSV upload or API client for backlinks; merge into “value” view.  
3. **Steps 3–7:** New runner job types + artifacts; plan-compiler template for `seo_migration_wizard` (or extend `wp_shopify_migration`).  
4. **Console:** Wizard UI (stepper) that creates an initiative, runs the pipeline, and displays artifacts per step; Step 8 = checklist + launch.

This keeps the wizard consistent with the existing SEO vertical (same engine, no new kernel tables) and makes the keyword-mapping step the driver for redirect and page strategy.
