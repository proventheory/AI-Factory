# SEO Migration – Artifact Schemas

Artifacts produced by the `seo_migration_audit` pipeline. Stored in `artifacts.metadata_json` (or referenced by `uri`).

## seo_url_inventory

- **artifact_type:** `seo_url_inventory`
- **artifact_class:** `data`
- **Shape:**  
  `{ source_url?: string, target_url?: string, urls: SeoUrlRecord[], crawl_mode: string, stats: { total_urls, by_type, status_counts } }`
- **SeoUrlRecord:**  
  `url`, `normalized_url`, `path`, `status`, `type` (product|collection|category|tag|post|page|policy|homepage|other), `source` (sitemap|crawl), optional: `title`, `meta_description`, `h1`, `canonical`, `indexable`, `word_count`, `schema_types`, `image_count`, `internal_links_out`, `discovered_from`, `lastmod`

## seo_url_match_report

- **artifact_type:** `seo_url_match_report`
- **Shape:**  
  `{ source_url, target_url, matches: { source_url, source_path, target_url?, target_path?, match_type: exact|rule|none, rule_used? }[], by_match_type: { exact, rule, none }, target_url_to_path }`

## seo_redirect_verification

- **artifact_type:** `seo_redirect_verification`
- **Shape:**  
  `{ verified_count, broken_count, sampled_count, results: { source_url, target_url?, status, redirect_ok, location?, error? }[] }`

## seo_content_parity_report

- **artifact_type:** `seo_content_parity_report`
- **Shape:**  
  `{ comparisons: { source_url, target_url, title_similarity, h1_similarity, meta_similarity, word_count_old/new/delta_pct, schema_preserved, result, issue_codes }[], stats }`
- **issue_codes:** content_loss, title_changed, h1_missing, schema_removed, thin_content, unmatched_page

## seo_technical_diff_report

- **artifact_type:** `seo_technical_diff_report`
- **Shape:**  
  `{ comparisons: { source_url, target_url, source_status, target_status, canonical_match, indexable_ok, title_present, meta_present, h1_present, schema_preserved, issue_codes, severity }[], stats }`
- **issue_codes:** target_4xx, status_regression, canonical_mismatch, target_noindex, missing_title, missing_meta_description, schema_loss

## seo_ranking_risk_report

- **artifact_type:** `seo_ranking_risk_report`
- **Shape:**  
  `{ urls: { source_url, target_url?, risk_score, risk_level, seo_value_score, migration_defect_score, issue_codes, recommended_actions }[], stats: { critical, high, medium, low } }`

## seo_audit_summary

- **artifact_type:** `seo_audit_summary`
- **artifact_class:** `docs`
- **Shape:**  
  `{ source_url, target_url, url_match: { total, exact, rule, none, unmatched_count }, redirect_verification: { sampled, verified, broken }, risk_buckets: { critical, high, medium, low }, top_priority_urls?, recommended_actions }`

## seo_gsc_snapshot / seo_ga4_snapshot / seo_backlink_snapshot

- **artifact_type:** `seo_gsc_snapshot` | `seo_ga4_snapshot` | `seo_backlink_snapshot`
- **Shape (GSC):** `{ site_url, date_range, pages: { url, clicks, impressions }[], queries?: [] }`
- **Shape (GA4):** `{ property_id, pages: { full_page_url?, page_path?, sessions, screen_page_views? }[] }`
- **Shape (backlink):** `{ urls: { url, referring_domains? }[] }`

## seo_internal_link_graph

- **artifact_type:** `seo_internal_link_graph`
- **Shape:**  
  `{ site_role?, base_url?, nodes: { url, type }[], edges: { from_url, to_url, anchor_text?, link_context? }[] }`  
  Or `{ source: graph, target: graph }` when both sites in one artifact.

## seo_internal_graph_diff_report

- **artifact_type:** `seo_internal_graph_diff_report`
- **Shape:**  
  `{ comparisons: { source_url, target_url, old_inlinks, new_inlinks, inlink_delta_pct, issue_codes, severity }[], stats }`
