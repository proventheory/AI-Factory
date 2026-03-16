-- Every executed repair action (redeploy, rollback, generate_patch, etc.).

CREATE TABLE IF NOT EXISTS public.repair_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_plan_id uuid NOT NULL REFERENCES public.repair_plans(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  action_type text NOT NULL CHECK (
    action_type IN (
      'redeploy',
      'restart',
      'rollback',
      'pause_retries',
      'fetch_schema',
      'generate_patch',
      'create_branch',
      'commit_patch',
      'run_tests',
      'run_shadow_migration',
      'deploy_candidate',
      'verify_candidate',
      'promote_candidate',
      'mark_quarantined'
    )
  ),
  status text NOT NULL CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')
  ),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NULL,
  error_text text NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_attempts_plan ON public.repair_attempts (repair_plan_id);
