# SEO Vertical (Phase 4)

The **SEO vertical** is the second vertical kernel on the AI-Factory substrate. It runs on the **same engine** as the deploy vertical: initiatives → plans → runs → job_runs → artifacts. It does **not** add domain meaning to the kernel; all SEO-specific state and logic live in this vertical.

## Success criterion (Phase 4)

A second vertical runs on the same substrate **without adding domain meaning to the kernel**.

## How the SEO vertical uses the kernel

| Kernel primitive | How SEO vertical uses it |
|------------------|---------------------------|
| **runs** | Initiatives with `intent_type: "wp_shopify_migration"` (or landing page, content) compile to plans; `createRun(planId, …)` starts a run. |
| **job_runs** | Runner executes nodes: crawl, url_inventory, seo_gsc_snapshot, seo_ga4_snapshot, seo_risk_scorer, landing_page_generate, etc. |
| **artifacts** | Runs produce artifacts: seo_url_inventory, seo_audit_summary, landing_page, email_template, etc. |
| **events** | run_events, job_events record execution (no SEO-specific event types). |

SEO vertical **does not** add SEO-specific columns to runs or job_runs. It uses initiative `goal_metadata` (source_url, target_url, gsc_site_url, ga4_property_id, etc.) and standard artifact types.

## What the SEO vertical owns (domain surface)

| Area | Description | Control-plane / runner |
|------|-------------|-------------------------|
| **WP → Shopify audit** | Pipeline pattern `wp_shopify_migration`; URL inventory, redirect verification, risk report, GSC/GA4 snapshots. | plan-compiler templates, pipeline-patterns, runners (seo_* handlers) |
| **GSC / GA4** | Fetch reports (top pages, queries). | seo-gsc-ga-client.ts, API POST /v1/seo/gsc_report, /v1/seo/ga4_report |
| **Google OAuth** | Connect initiatives/brands to Google (Search Console, Analytics). | seo-google-oauth.ts, API /v1/seo/google/*, /v1/initiatives/:id/google_* |
| **Sitemap / products** | Fetch sitemap products, products from URL (Shopify/sitemap). | sitemap-products.ts, products-from-url.ts, API POST /v1/sitemap/products, /v1/products/from_url |
| **Landing page / content** | Generate landing pages, copy, email from initiatives. | Runners: landing_page_generate, copy_generate, email_generate_mjml; templates |

No new **kernel** tables for SEO. Optional vertical-specific tables (e.g. seo_audit_runs, keyword_clusters) would go in **vertical-scoped migrations** (e.g. under a naming convention or schema) and are **not** in the platform kernel.

## Single entry point (vertical facade)

- **`control-plane/src/verticals/seo/index.ts`** — Re-exports: fetchGscReport, fetchGa4Report, fetchSitemapProducts, productsFromUrl, Google OAuth helpers (getGoogleAuthUrl, handleOAuthCallback, getAccessTokenForInitiative, hasGoogleCredentials, deleteGoogleCredentials, hasGoogleCredentialsForBrand, deleteGoogleCredentialsForBrand). API routes in api.ts that serve SEO continue to live in api.ts but can import from `verticals/seo` for the actual logic.

## Boundary rules

1. **No SEO domain in kernel schema** — No keyword_clusters, seo_topics, or audit_run tables in the core kernel. Any future SEO-specific tables go in vertical migrations.
2. **Same execution engine** — SEO runs use the same createRun, scheduler, job_runs, runner, and artifacts as deploy. Pipeline pattern `wp_shopify_migration` (and email, landing page) produce plans and runs like `self_heal`.
3. **Console and API** — Console pages (e.g. initiatives, launches, landing-page-generator) and API routes that serve SEO are unchanged; they call into verticals/seo or existing modules. No requirement to move all SEO routes into a separate Express router for Phase 4; the vertical is defined by ownership of domain logic and the facade.

## Pipeline patterns that belong to SEO / marketing vertical

- **wp_shopify_migration** — WP → Shopify audit (URL inventory, GSC, GA4, risk).
- **email_design_generator** — Email design (MJML, templates); can be grouped with SEO/marketing.
- **landing_page_generate** — Landing page generation (often used with SEO/content).

These patterns use the same plan-compiler and scheduler; they are part of the SEO/marketing vertical because their **domain** is content, SEO, or marketing, not deploy or repair.
