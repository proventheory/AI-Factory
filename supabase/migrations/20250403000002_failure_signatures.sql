-- Autonomous incident-response: normalized failure fingerprints (e.g. boot_failed.migration.missing_relation).

CREATE TABLE IF NOT EXISTS public.failure_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_key text NOT NULL UNIQUE,
  phase text NOT NULL,
  class text NOT NULL,
  subclass text NULL,
  matcher_version text NOT NULL DEFAULT 'v1',
  pattern jsonb NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failure_signatures_key ON public.failure_signatures (signature_key);
CREATE INDEX IF NOT EXISTS idx_failure_signatures_phase ON public.failure_signatures (phase);

-- FK from incidents to failure_signatures (add after signatures exist)
ALTER TABLE public.incidents
  ADD CONSTRAINT fk_incidents_current_signature
  FOREIGN KEY (current_signature_id) REFERENCES public.failure_signatures(id) ON DELETE SET NULL;
