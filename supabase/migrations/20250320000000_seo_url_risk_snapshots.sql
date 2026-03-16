-- Optional table for queryable SEO migration risk history (dashboards, reporting).
-- Pipeline writes seo_ranking_risk_report artifacts; this table can be populated by a job or
-- by a trigger that copies from artifact metadata for runs with intent_type = 'seo_migration_audit'.
-- See docs/seo-migration/README.md and plan SEO Migration URL Inventory.

CREATE TABLE IF NOT EXISTS seo_url_risk_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id     uuid NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  run_id            uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_url        text NOT NULL,
  target_url        text,
  risk_level        text NOT NULL CHECK (risk_level IN ('critical', 'high', 'medium', 'low')),
  risk_score        numeric(5,4) NOT NULL,
  seo_value_score   numeric(5,4),
  migration_defect_score numeric(5,4),
  issue_codes       jsonb DEFAULT '[]',
  recommended_actions jsonb DEFAULT '[]',
  gsc_clicks        int,
  gsc_impressions   int,
  ga_sessions       int,
  backlinks         int,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_url_risk_snapshots_initiative ON seo_url_risk_snapshots (initiative_id);
CREATE INDEX IF NOT EXISTS idx_seo_url_risk_snapshots_run ON seo_url_risk_snapshots (run_id);
CREATE INDEX IF NOT EXISTS idx_seo_url_risk_snapshots_risk_level ON seo_url_risk_snapshots (risk_level);

COMMENT ON TABLE seo_url_risk_snapshots IS 'Queryable risk history per URL from seo_ranking_risk_report; optional population from pipeline artifacts.';

ALTER TABLE seo_url_risk_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seo_url_risk_snapshots_select" ON seo_url_risk_snapshots FOR SELECT USING (true);
