# SOP: WP → Shopify migration (Pre-Launch, Launch, Post-Launch)

Standard operating procedures for moving WordPress/WooCommerce → Shopify with URL inventory, redirect map, and SEO-safe verification. Aligns with the 9-step strategic pipeline and 20-step operational pipeline in the WP → Shopify migration plan.

## SOP 1 – Pre-migration URL inventory, technical baseline, and mapping

1. **Choose source URL(s)**  
   e.g. `https://stigmahemp.com`, optionally `https://stigmathc.com`.

2. **Run URL inventory**  
   - Pipeline: Create initiative with `intent_type: "wp_shopify_migration"`, `goal_metadata: { source_url, target_url }`, run plan (source/target inventory).  
   - Or standalone:  
     `node scripts/wp-shopify-migration-url-inventory.mjs https://stigmahemp.com`  
     Output: `docs/wp-shopify-migration/<host>-url-inventory.json` and `.md`.

3. **Capture technical baseline (optional but recommended)**  
   - Canonical tags, title tags, meta descriptions, H1/H2, schema, robots, status codes.  
   - Store: `technical_snapshot.json`, `title_meta_inventory.csv`, `schema_inventory.json`.

4. **Export GSC/GA baseline**  
   - Option A: `node scripts/wp-shopify-migration-gsc-ga-export.mjs` (set `GSC_SITE_URL`, `GA4_PROPERTY_ID`, `GOOGLE_APPLICATION_CREDENTIALS`).  
   - Output: `gsc_top_pages.json`, `gsc_queries.json`, `ga4_top_pages.json` in `docs/wp-shopify-migration/`.

5. **Merge into priority table**  
   - Join URL inventory with GSC (clicks/impressions) and GA4 (sessions).  
   - Columns: URL, type, GSC_clicks, GSC_impressions, GA4_sessions, priority (high/medium/low).

6. **Define canonical + indexation rules**  
   - Document `canonical_url_strategy.md` and `meta_robots_rules.json` for target platform (e.g. Shopify: product → `/products/slug`, collection → `/collections/slug`).

7. **Build URL mapping**  
   - Run: `node scripts/seo/url-mapping-template.mjs ./docs/wp-shopify-migration/stigmahemp-url-inventory.json`  
   - Fill `migration_url`, `redirect_type`, `priority`, `notes` in `url_mapping.json`.  
   - Use for redirect config and post-migration verification.

8. **Stakeholder sign-off**  
   - Confirm inventory, priority list, and redirect map before cutover.

---

## SOP 2 – Migration execution (high level)

1. **Backup**  
   - Full backup of source site and DNS/hosting config.

2. **DNS/hosting cutover or platform migration**  
   - Complete content and metadata migration to target platform.

3. **Apply redirect map**  
   - Configure server/CDN/hosting so every `existing_url` in `url_mapping.json` redirects (301) to `migration_url`.

4. **Content and metadata migration**  
   - Ensure titles, meta, H1, schema, and critical content are present on target pages.

5. **Internal link updates (optional pre-launch)**  
   - Where possible, update key nav/footer links to new URLs before launch.

---

## SOP 3 – Post-migration verification

1. **Run audit pipeline**  
   - Initiative `wp_shopify_migration` with `source_url` = old site (or baseline) and `target_url` = new site.  
   - Review artifacts: `seo_audit_summary`, `seo_ranking_risk_report`, `seo_redirect_verification`, `seo_content_parity_report`, `seo_technical_diff_report`.

2. **Verify redirect map**  
   - For each row in `url_mapping.json`, request `existing_url` and assert redirect to `migration_url` (or 200 on same URL).  
   - Fix 404s and wrong targets first for high-priority URLs.

3. **Re-pull GSC/GA (after 3–7 days)**  
   - Run GSC/GA export again; compare impressions/clicks and sessions for priority URLs.

4. **Report and fix regressions**  
   - Address high-risk URLs and defect clusters from the audit report.

---

## SOP 4 – Internal link graph reconciliation (Step 9)

1. **After launch**  
   - When all content (blogs, guides, landing pages) is migrated and new URL structure is live.

2. **Extract internal links**  
   - From content corpus (DB or crawl): all internal links with anchor text and context (nav/footer/contextual).

3. **Map to new URLs**  
   - Using `url_mapping.json`, map each link target to its new canonical URL.

4. **Rewrite links in content**  
   - Update content DB/CMS so links point to new canonicals; preserve anchor text.

5. **Verify**  
   - Confirm no redirect chains in internal links and that contextual links point to correct SEO targets.

6. **Document**  
   - Outcome: link graph aligned to new architecture; note in migration log.

---

## References

- Plan: `.cursor/plans/seo_migration_url_inventory_ceba486c.plan.md` (or repo WP → Shopify migration plan).
- Scripts: `scripts/wp-shopify-migration-url-inventory.mjs`, `scripts/seo/url-mapping-template.mjs`, `scripts/wp-shopify-migration-gsc-ga-export.mjs`.
- Pipeline: `intent_type: "wp_shopify_migration"` in control-plane; runners in `runners/src/handlers/seo-*.ts` and `runners/src/lib/seo/`.
- Runbook style: `docs/SECURITY_AND_RUNBOOKS.md`.
