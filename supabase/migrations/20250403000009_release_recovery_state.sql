-- Fast lookup per service/environment: current/last healthy/last failed release, retry suppression.

CREATE TABLE IF NOT EXISTS public.release_recovery_state (
  service_name text NOT NULL,
  environment text NOT NULL,
  current_release_id uuid NULL,
  last_healthy_release_id uuid NULL,
  last_failed_release_id uuid NULL,
  current_incident_id uuid NULL REFERENCES public.incidents(id) ON DELETE SET NULL,
  retry_suppressed boolean NOT NULL DEFAULT false,
  suppression_reason text NULL,
  failure_streak integer NOT NULL DEFAULT 0,
  last_signature_id uuid NULL REFERENCES public.failure_signatures(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_name, environment)
);

COMMENT ON TABLE public.release_recovery_state IS 'Per-service recovery state: used to suppress retry loops and prefer rollback.';
