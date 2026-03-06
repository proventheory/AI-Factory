-- Artifact verification records: pre_write / post_write quality checks for email_template and others.
-- Used by runner to record verification results; control-plane can query for failed verifications (e.g. self-heal).

CREATE TABLE IF NOT EXISTS artifact_verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id     uuid        NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  run_id          uuid        NOT NULL REFERENCES runs(id),
  job_run_id      uuid        REFERENCES job_runs(id),
  verification_type text      NOT NULL,  -- 'pre_write' | 'post_write'
  passed          boolean     NOT NULL,
  details         jsonb,                 -- e.g. { generated_len, stored_len, checks, failed_checks }
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifact_verifications_artifact ON artifact_verifications (artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_verifications_run_passed ON artifact_verifications (run_id, passed);
