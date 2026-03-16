-- Allow strategy_type 'rollback_then_branch_patch' for repair_recipes (rollout pack).

ALTER TABLE public.repair_recipes
  DROP CONSTRAINT IF EXISTS repair_recipes_strategy_type_check;

ALTER TABLE public.repair_recipes
  ADD CONSTRAINT repair_recipes_strategy_type_check CHECK (
    strategy_type IN (
      'retry',
      'restart',
      'rollback',
      'config_fix',
      'branch_patch',
      'schema_guard_patch',
      'migration_reorder_patch',
      'quarantine',
      'escalate',
      'rollback_then_branch_patch'
    )
  );
