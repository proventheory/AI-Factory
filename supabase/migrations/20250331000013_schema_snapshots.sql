-- Store schema snapshots for drift detection (GET /v1/schema_drift).
-- Control Plane captures current schema after migrations or via POST /v1/schema_drift/capture.

CREATE TABLE IF NOT EXISTS schema_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL DEFAULT 'baseline',
  snapshot    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_snapshots_created_at ON schema_snapshots (created_at DESC);
COMMENT ON TABLE schema_snapshots IS 'Stored schema (tables/columns) for drift comparison; see control-plane schema-drift.ts';
