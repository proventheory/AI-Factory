-- Log mirror: raw log lines from Render (runner/API) for runs.
-- See .cursor/plans/log_mirror_and_template_proofing_*.plan.md Phase 1.1.

BEGIN;

CREATE TABLE IF NOT EXISTS run_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  job_run_id uuid REFERENCES job_runs(id) ON DELETE SET NULL,
  source text NOT NULL,
  level text,
  message text NOT NULL,
  logged_at timestamptz NOT NULL,
  dedupe_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_log_entries_run_logged ON run_log_entries (run_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_log_entries_job_logged ON run_log_entries (job_run_id, logged_at DESC) WHERE job_run_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_run_log_entries_dedupe ON run_log_entries (run_id, source, logged_at, dedupe_hash);

COMMENT ON TABLE run_log_entries IS 'Raw log lines ingested from Render (runner/API); parsed by run_id for Console Logs tab and log-based validations.';

COMMIT;
