-- Plan §2.4 Invariant 3: run pins repo_commit_base for determinism.
-- Plan §10 DB-first: job_runs.next_retry_at for delayed retry.
-- Additive only; safe to run on existing DB.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS repo_commit_base text;
COMMENT ON COLUMN runs.repo_commit_base IS 'Pinned git ref/commit for this run (determinism). Plan §2.4.';

ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
COMMENT ON COLUMN job_runs.next_retry_at IS 'When to re-queue this job_run after failure (delayed retry). Plan §10.';

CREATE INDEX IF NOT EXISTS idx_job_runs_status_next_retry
  ON job_runs (status, next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;
