-- Seed repair recipes for migration and runtime failures.
-- References failure_signatures by signature_key (resolved in app) or applies_to_class.

INSERT INTO public.repair_recipes (
  recipe_key,
  applies_to_class,
  title,
  description,
  risk_level,
  strategy_type,
  allowed_in_prod,
  requires_sandbox,
  requires_last_healthy_release,
  max_attempts,
  steps
) VALUES
  (
    'migration_duplicate_policy',
    'migration',
    'Idempotent policy migration',
    'Suppress retries, rollback if healthy exists, generate idempotent migration patch (DROP POLICY IF EXISTS), shadow test, staging deploy, verify, promote.',
    'medium',
    'branch_patch',
    false,
    true,
    true,
    1,
    '["pause_retries", "rollback", "introspect_policy_state", "generate_patch", "run_shadow_migration", "deploy_candidate", "verify", "promote"]'::jsonb
  ),
  (
    'migration_missing_relation',
    'migration',
    'Migration reorder / dependency fix',
    'Suppress retries, rollback if available, inspect migration order, generate reorder/split patch, shadow migration, staging deploy, verify, promote.',
    'medium',
    'migration_reorder_patch',
    false,
    true,
    true,
    1,
    '["pause_retries", "rollback", "inspect_migration_graph", "generate_patch", "run_shadow_migration", "deploy_candidate", "verify", "promote"]'::jsonb
  ),
  (
    'runtime_healthcheck_retry',
    'runtime',
    'Restart / redeploy once',
    'Restart or redeploy once; if repeated and last healthy release exists, rollback.',
    'low',
    'restart',
    true,
    false,
    false,
    2,
    '["restart", "verify"]'::jsonb
  ),
  (
    'quarantine_escalate',
    NULL,
    'Quarantine and escalate',
    'No safe repair path; quarantine bad release and escalate.',
    'high',
    'quarantine',
    false,
    false,
    false,
    1,
    '["mark_quarantined", "escalate"]'::jsonb
  )
ON CONFLICT (recipe_key) DO NOTHING;
