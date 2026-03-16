-- Health verification after repair (boot, migration, healthcheck, smoke).

CREATE TABLE IF NOT EXISTS public.verification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  repair_plan_id uuid NULL REFERENCES public.repair_plans(id) ON DELETE SET NULL,
  target_release_id uuid NULL,
  target_environment text NOT NULL,
  verification_type text NOT NULL CHECK (
    verification_type IN ('boot', 'migration', 'healthcheck', 'smoke', 'diff_regression')
  ),
  status text NOT NULL CHECK (
    status IN ('queued', 'running', 'passed', 'failed')
  ),
  result jsonb NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_runs_incident ON public.verification_runs (incident_id);
