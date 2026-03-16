-- Instance of a chosen recipe for a given incident.

CREATE TABLE IF NOT EXISTS public.repair_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.repair_recipes(id),
  status text NOT NULL CHECK (
    status IN ('planned', 'running', 'blocked', 'failed', 'verified', 'abandoned')
  ),
  planner_type text NOT NULL CHECK (planner_type IN ('rule', 'llm', 'hybrid')),
  confidence numeric(5,4) NULL,
  rationale text NULL,
  plan_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repair_plans_incident ON public.repair_plans (incident_id);
