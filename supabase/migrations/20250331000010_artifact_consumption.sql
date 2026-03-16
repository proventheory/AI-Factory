-- Artifact consumption: which job runs consumed which artifacts (observed lineage).
-- One job run consumes a given artifact at most once (UNIQUE artifact_id, job_run_id).

BEGIN;

CREATE TABLE IF NOT EXISTS artifact_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id),
  run_id uuid NOT NULL REFERENCES runs(id),
  job_run_id uuid NOT NULL REFERENCES job_runs(id),
  plan_node_id uuid NOT NULL REFERENCES plan_nodes(id),
  role text NOT NULL DEFAULT 'input',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, job_run_id)
);

CREATE INDEX IF NOT EXISTS idx_artifact_consumption_artifact ON artifact_consumption(artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_consumption_run ON artifact_consumption(run_id, job_run_id);

COMMIT;
