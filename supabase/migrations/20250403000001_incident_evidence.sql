-- Autonomous incident-response: evidence bundles per incident.

CREATE TABLE IF NOT EXISTS public.incident_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (
    evidence_type IN (
      'deploy_log',
      'startup_log',
      'migration_log',
      'healthcheck_result',
      'release_diff',
      'env_snapshot',
      'schema_snapshot',
      'service_status',
      'stack_trace',
      'tool_output',
      'historical_incident'
    )
  ),
  source text NOT NULL,
  ref text NULL,
  content jsonb NULL,
  content_text text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_evidence_incident ON public.incident_evidence (incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_evidence_type ON public.incident_evidence (evidence_type);
