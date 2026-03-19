-- Cache for DataForSEO ranked keywords per URL (SEO Migration Wizard).
-- DataForSEO updates weekly; cache TTL typically 7 days to avoid re-billing.

CREATE TABLE IF NOT EXISTS seo_ranked_keywords_cache (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url_normalized    text NOT NULL UNIQUE,
  result_json       jsonb NOT NULL,
  fetched_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_ranked_keywords_cache_fetched_at ON seo_ranked_keywords_cache (fetched_at DESC);

COMMENT ON TABLE seo_ranked_keywords_cache IS 'Cache for DataForSEO Labs ranked_keywords API; keyed by normalized full URL, TTL ~7 days.';
