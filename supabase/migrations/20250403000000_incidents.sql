-- Autonomous incident-response: incidents table.
-- See docs/runbooks/render-staging-failed-deploy and implementation spec (incident watcher → evidence → classify → plan → execute → verify).

CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  environment text NOT NULL,
  release_id uuid NULL,
  deploy_id text NULL,
  status text NOT NULL CHECK (
    status IN (
      'detected',
      'collecting_evidence',
      'classified',
      'repair_planned',
      'repair_running',
      'candidate_verifying',
      'recovered',
      'rolled_back',
      'quarantined',
      'escalated',
      'closed'
    )
  ),
  failure_phase text NOT NULL CHECK (
    failure_phase IN ('build', 'boot', 'migrate', 'healthcheck', 'runtime', 'unknown')
  ),
  opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  first_failure_at timestamptz NOT NULL DEFAULT now(),
  last_failure_at timestamptz NOT NULL DEFAULT now(),
  retry_count integer NOT NULL DEFAULT 0,
  deterministic_failure boolean NULL,
  confidence numeric(5,4) NULL,
  root_cause_summary text NULL,
  current_signature_id uuid NULL,
  last_healthy_release_id uuid NULL,
  current_bad_release_id uuid NULL,
  quarantine_reason text NULL,
  escalated_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_incidents_service_env ON public.incidents (service_name, environment);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_opened_at ON public.incidents (opened_at DESC);

COMMENT ON TABLE public.incidents IS 'Autonomous incident-response: each failure event tracked through detect → classify → plan → execute → verify.';
