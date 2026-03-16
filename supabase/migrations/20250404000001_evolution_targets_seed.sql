-- Evolution Loop V1: evolution_targets and seed for deploy_repair only.

BEGIN;

CREATE TABLE IF NOT EXISTS evolution_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  mutability_level text NOT NULL
    CHECK (mutability_level IN ('low', 'medium', 'high', 'locked')),
  owner_module text NOT NULL,
  config_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain, target_type, target_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evolution_targets_unique
  ON evolution_targets(domain, target_type, target_id);

INSERT INTO evolution_targets (domain, target_type, target_id, mutability_level, owner_module, config_ref)
VALUES
  ('deploy_repair', 'repair_recipe_order', 'default', 'low', 'control-plane/self-heal', '{}'::jsonb),
  ('deploy_repair', 'classifier_threshold', 'deploy_failure_classifier', 'low', 'control-plane/self-heal', '{}'::jsonb),
  ('deploy_repair', 'retry_backoff_profile', 'render_default', 'low', 'control-plane/self-heal', '{}'::jsonb),
  ('deploy_repair', 'canary_policy', 'repair_candidate_canary', 'medium', 'control-plane/release-manager', '{}'::jsonb),
  ('deploy_repair', 'validator_threshold', 'deploy_repair_validation', 'medium', 'runners/validators', '{}'::jsonb)
ON CONFLICT (domain, target_type, target_id) DO NOTHING;

COMMIT;
