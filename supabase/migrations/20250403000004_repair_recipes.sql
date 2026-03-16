-- Approved repair strategies per signature (rollback, branch_patch, etc.).

CREATE TABLE IF NOT EXISTS public.repair_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_key text NOT NULL UNIQUE,
  applies_to_signature_id uuid NULL REFERENCES public.failure_signatures(id),
  applies_to_class text NULL,
  title text NOT NULL,
  description text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  strategy_type text NOT NULL CHECK (
    strategy_type IN (
      'retry',
      'restart',
      'rollback',
      'config_fix',
      'branch_patch',
      'schema_guard_patch',
      'migration_reorder_patch',
      'quarantine',
      'escalate'
    )
  ),
  allowed_in_prod boolean NOT NULL DEFAULT false,
  requires_sandbox boolean NOT NULL DEFAULT true,
  requires_last_healthy_release boolean NOT NULL DEFAULT false,
  max_attempts integer NOT NULL DEFAULT 1,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repair_recipes_signature ON public.repair_recipes (applies_to_signature_id);
CREATE INDEX IF NOT EXISTS idx_repair_recipes_class ON public.repair_recipes (applies_to_class);
