-- Evolution Loop V1
-- Adds: mutation_proposals, experiment_runs, fitness_scores, promotion_decisions
-- Goal: bounded self-improvement for narrow vertical kernels (start with deploy_repair)
-- Note: run_events.id is bigint; source_event_id uses bigint. mutation_proposals has updated_at for upsert.

BEGIN;

CREATE TABLE IF NOT EXISTS mutation_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  domain text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  mutation_kind text NOT NULL,

  patch jsonb NOT NULL,
  baseline_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  hypothesis text,
  proposed_by text NOT NULL,

  source_run_id uuid REFERENCES runs(id) ON DELETE SET NULL,
  source_job_run_id uuid REFERENCES job_runs(id) ON DELETE SET NULL,
  source_event_id bigint REFERENCES run_events(id) ON DELETE SET NULL,

  risk_level text NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'queued',
      'approved_for_test',
      'testing',
      'accepted',
      'rejected',
      'retired',
      'superseded'
    )),

  dedupe_key text,
  rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  retired_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mutation_proposals_dedupe_key
  ON mutation_proposals(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutation_proposals_domain_status
  ON mutation_proposals(domain, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mutation_proposals_target
  ON mutation_proposals(target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS experiment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  mutation_proposal_id uuid NOT NULL
    REFERENCES mutation_proposals(id) ON DELETE CASCADE,

  domain text NOT NULL,

  baseline_ref jsonb NOT NULL,
  candidate_ref jsonb NOT NULL,

  traffic_strategy text NOT NULL
    CHECK (traffic_strategy IN ('replay', 'shadow', 'canary', 'sampled_live')),

  traffic_percent numeric(5,2),
  sample_size integer,
  cohort_key text,
  cohort_filters jsonb NOT NULL DEFAULT '{}'::jsonb,

  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'aborted', 'failed')),

  outcome text
    CHECK (outcome IN ('win', 'loss', 'inconclusive')),

  started_at timestamptz,
  ended_at timestamptz,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiment_runs_mutation
  ON experiment_runs(mutation_proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_experiment_runs_domain_status
  ON experiment_runs(domain, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_experiment_runs_cohort
  ON experiment_runs(domain, cohort_key, created_at DESC);

CREATE TABLE IF NOT EXISTS fitness_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  experiment_run_id uuid NOT NULL
    REFERENCES experiment_runs(id) ON DELETE CASCADE,

  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  metric_direction text NOT NULL
    CHECK (metric_direction IN ('higher_is_better', 'lower_is_better', 'target_band')),

  weight numeric NOT NULL DEFAULT 1,
  cohort_key text,
  sample_count integer,
  metric_meta jsonb NOT NULL DEFAULT '{}'::jsonb,

  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitness_scores_experiment
  ON fitness_scores(experiment_run_id, metric_name);

CREATE INDEX IF NOT EXISTS idx_fitness_scores_cohort
  ON fitness_scores(metric_name, cohort_key, recorded_at DESC);

CREATE TABLE IF NOT EXISTS promotion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  mutation_proposal_id uuid NOT NULL
    REFERENCES mutation_proposals(id) ON DELETE CASCADE,

  experiment_run_id uuid NOT NULL
    REFERENCES experiment_runs(id) ON DELETE CASCADE,

  decision text NOT NULL
    CHECK (decision IN (
      'promote',
      'reject',
      'retry_test',
      'sandbox_only',
      'human_review'
    )),

  decided_by text NOT NULL,
  reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  promoted_ref jsonb,

  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_decisions_mutation
  ON promotion_decisions(mutation_proposal_id, decided_at DESC);

CREATE OR REPLACE VIEW v_mutation_latest_decision AS
SELECT DISTINCT ON (mutation_proposal_id)
  mutation_proposal_id,
  id AS promotion_decision_id,
  experiment_run_id,
  decision,
  decided_by,
  reason,
  promoted_ref,
  decided_at
FROM promotion_decisions
ORDER BY mutation_proposal_id, decided_at DESC;

CREATE OR REPLACE VIEW v_experiment_score_summary AS
SELECT
  e.id AS experiment_run_id,
  e.mutation_proposal_id,
  e.domain,
  e.cohort_key,
  e.status,
  e.outcome,
  count(fs.id) AS metric_count,
  coalesce(sum(
    CASE
      WHEN fs.metric_direction = 'higher_is_better' THEN fs.metric_value * fs.weight
      WHEN fs.metric_direction = 'lower_is_better' THEN (-1 * fs.metric_value) * fs.weight
      ELSE 0
    END
  ), 0) AS weighted_score_proxy,
  e.created_at,
  e.started_at,
  e.ended_at
FROM experiment_runs e
LEFT JOIN fitness_scores fs ON fs.experiment_run_id = e.id
GROUP BY
  e.id, e.mutation_proposal_id, e.domain, e.cohort_key,
  e.status, e.outcome, e.created_at, e.started_at, e.ended_at;

COMMIT;
