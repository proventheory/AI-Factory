# WP → Shopify migration – Scoring Model

## seo_value_score (0–1)

- **With GSC/GA/backlink data:**  
  `0.4 * normalized_gsc_clicks + 0.2 * normalized_gsc_impressions + 0.25 * normalized_ga_sessions + 0.15 * normalized_backlinks`  
  Normalization: divide by run-max for each metric (avoid div by zero).
- **Fallback (no data):** Default 0.5 so defect score still drives risk.

## migration_defect_score (0–1)

Weighted sum of:

- **Redirect defect (0–1):** 1 if redirect missing or wrong target; 0 if OK.
- **Content defect (0–1):** 1 if content parity fail, 0.5 if warning, 0 if pass.
- **Technical defect (0–1):** From severity (critical=1, high=0.75, medium=0.5, low=0.25, ok=0).
- **Match uncertainty:** Small bump when issue_codes present.

Formula: `0.30 * redirect_defect + 0.25 * content_defect + 0.20 * technical_defect + 0.10 * (issues ? 1 : 0)`, capped at 1.

## risk_score and risk_level

- **risk_score:** Combination of seo_value_score and migration_defect_score (e.g. `0.4 * seo_value + 0.6 * migration_defect`), rounded to 2 decimals.
- **risk_level:**
  - `risk_score >= 0.75` → **critical**
  - `risk_score >= 0.50` → **high**
  - `risk_score >= 0.25` → **medium**
  - else → **low**

## Recommended actions

Generated from issue codes, e.g.:

- redirect_fail / no_match → Fix redirect or add destination page
- content_fail / content_warning → Restore or review content parity
- technical_critical / technical_high → Fix canonical, status, noindex
- technical_medium → Add missing title/schema
