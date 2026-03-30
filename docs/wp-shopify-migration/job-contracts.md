# WP → Shopify migration – Job Contracts

Inputs, outputs, and responsibilities for each job type in the `wp_shopify_migration` (WP → Shopify audit) pipeline.

| Job | Inputs | Outputs | Responsibilities |
|-----|--------|---------|------------------|
| seo_source_inventory | goal_metadata.source_url, crawl opts | seo_url_inventory (source) | Sitemap-first crawl; normalize URLs; classify type; optional page metadata |
| seo_target_inventory | goal_metadata.target_url, crawl opts | seo_url_inventory (target) | Same as source for target site |
| seo_gsc_snapshot | goal_metadata.gsc_site_url | seo_gsc_snapshot | Stub: write empty pages/queries; real: GSC Search Analytics API |
| seo_ga4_snapshot | goal_metadata.ga4_property_id | seo_ga4_snapshot | Stub: write empty pages; real: GA4 Data API |
| seo_backlink_snapshot | (optional upload) | seo_backlink_snapshot | Stub: write empty urls; real: Ahrefs/SEMrush or upload |
| seo_url_matcher | source + target inventory, optional matching_rules | seo_url_match_report | Match source→target (exact, rule-based); confidence |
| seo_redirect_verifier | seo_url_match_report | seo_redirect_verification | HEAD source URLs; check Location vs expected target; chains, 404s |
| seo_content_parity | source + target inventory, seo_url_match_report | seo_content_parity_report | Compare title, H1, meta, word count, schema per matched pair |
| seo_technical_diff | source + target inventory, seo_url_match_report | seo_technical_diff_report | Compare status, canonical, indexable, title/meta/H1, schema |
| seo_internal_graph_builder | source + target inventory | seo_internal_link_graph | Build nodes (URLs) and edges (from discovered_from or crawl) |
| seo_internal_graph_diff | seo_url_match_report, seo_internal_link_graph | seo_internal_graph_diff_report | Compare inlink counts for matched URLs |
| seo_risk_scorer | match_report, redirect_verification, content_parity, technical_diff, optional GSC/GA/backlink | seo_ranking_risk_report | SEO value score + migration defect score → risk_score, risk_level |
| seo_audit_report | seo_url_match_report, seo_redirect_verification, seo_ranking_risk_report | seo_audit_summary | Executive summary, risk buckets, top_priority_urls, recommended_actions |
