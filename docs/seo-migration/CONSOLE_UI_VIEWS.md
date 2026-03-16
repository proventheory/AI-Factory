# SEO Migration – Console/UI Views (Design Reference)

Suggested run-detail and list views for the Console when displaying `seo_migration_audit` runs. Implement as needed.

## Initiative run detail (seo_migration_audit)

- **Crawl summary** – From `seo_url_inventory` (source + target): total URLs, by type, status counts, crawl_mode.
- **URL match summary** – From `seo_url_match_report`: total, exact, rule, none; link to match list.
- **Redirect verification** – From `seo_redirect_verification`: sampled, verified, broken; list of failures with source_url, expected vs actual.
- **Content parity** – From `seo_content_parity_report`: pass/warning/fail counts; list of comparisons with result and issue_codes.
- **Technical diff** – From `seo_technical_diff_report`: severity counts; list of comparisons with issue_codes.
- **Risk queue** – From `seo_ranking_risk_report` or `seo_audit_summary.top_priority_urls`: table columns: source URL, target URL, risk level, risk score, primary issue, recommended action.
- **Audit summary** – From `seo_audit_summary`: risk_buckets, recommended_actions, link to full report.

## Risk table (standalone or in run detail)

Columns: source_url, target_url, risk_level, risk_score, gsc_clicks (if present), ga_sessions (if present), primary issue_code, recommended_actions. Filter by risk_level (critical/high/medium/low). Sort by risk_score descending.

## Issue clusters

Cards or sections grouped by issue type: redirect failures, noindex/canonical, content loss, schema missing, internal link drop. Each links to the list of URLs with that issue.

## Data source

Load artifacts for the run by `artifact_type` (see [artifact-schemas.md](./artifact-schemas.md)); read `metadata_json` for payload. Optional: for risk history over time, query `seo_url_risk_snapshots` by initiative_id/run_id when the table is populated.
