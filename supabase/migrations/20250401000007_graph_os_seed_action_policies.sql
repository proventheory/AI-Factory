-- Seed action_policies: auto-execute vs approval-required (Phase 6).
-- Plan: graph query, draft generation, preview deploy = auto; production deploy, live send = approval.

BEGIN;

INSERT INTO action_policies (policy_key, action_type, scope_type, requires_approval, is_enabled) VALUES
  ('graph_query', 'graph_query', NULL, false, true),
  ('draft_generation', 'operator_execute', NULL, false, true),
  ('preview_deploy', 'preview_deploy', NULL, false, true),
  ('validation_run', 'operator_execute', NULL, false, true),
  ('metadata_repair', 'operator_execute', NULL, false, true),
  ('production_deploy', 'production_deploy', NULL, true, true),
  ('live_send', 'live_send', NULL, true, true),
  ('migration_apply', 'migration_apply', NULL, true, true),
  ('saved_flow_run', 'saved_flow_run', NULL, false, true)
ON CONFLICT (policy_key) DO UPDATE SET
  action_type = EXCLUDED.action_type,
  requires_approval = EXCLUDED.requires_approval,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

COMMIT;
