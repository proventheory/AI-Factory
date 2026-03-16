-- Which signature matched an incident (rule, llm, or hybrid).

CREATE TABLE IF NOT EXISTS public.incident_signature_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  signature_id uuid NOT NULL REFERENCES public.failure_signatures(id),
  confidence numeric(5,4) NOT NULL,
  matched_by text NOT NULL CHECK (matched_by IN ('rule', 'llm', 'hybrid')),
  rationale text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_signature_matches_incident ON public.incident_signature_matches (incident_id);
