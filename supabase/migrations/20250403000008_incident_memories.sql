-- What worked before (successful recipe, patch ref, lessons).

CREATE TABLE IF NOT EXISTS public.incident_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id uuid NULL REFERENCES public.failure_signatures(id),
  service_name text NULL,
  environment text NULL,
  summary text NOT NULL,
  successful_recipe_id uuid NULL REFERENCES public.repair_recipes(id),
  successful_patch_ref text NULL,
  lessons jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_memories_signature ON public.incident_memories (signature_id);
