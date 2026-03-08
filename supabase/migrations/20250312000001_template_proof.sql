-- Template proofing: batches and per-template proof runs.
-- See .cursor/plans/log_mirror_and_template_proofing_*.plan.md Phase 3.1.

BEGIN;

CREATE TABLE IF NOT EXISTS template_proof_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_proof_batches_brand ON template_proof_batches (brand_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_proof_batches_status ON template_proof_batches (status);

CREATE TABLE IF NOT EXISTS template_proof_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES template_proof_batches(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  run_id uuid REFERENCES runs(id) ON DELETE SET NULL,
  brand_profile_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'skipped')),
  artifact_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_template_proof_runs_batch ON template_proof_runs (batch_id);
CREATE INDEX IF NOT EXISTS idx_template_proof_runs_template ON template_proof_runs (template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_proof_runs_run ON template_proof_runs (run_id) WHERE run_id IS NOT NULL;

COMMENT ON TABLE template_proof_batches IS 'Template proof run batches (e.g. 30-min Sticky Green proof of all templates).';
COMMENT ON TABLE template_proof_runs IS 'One row per template proof run: template_id, run_id, status, artifact_count.';

COMMIT;
