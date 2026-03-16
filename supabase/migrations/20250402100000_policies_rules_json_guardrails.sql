-- Plan §5.11: Self-build guardrails as first-class keys in policies.rules_json.
-- Seed/update default policy with machine-enforced keys so control-plane and runners can enforce them.

INSERT INTO policies (version, rules_json, created_at)
VALUES (
  'latest',
  '{
    "max_changed_files": 50,
    "max_diff_bytes": 500000,
    "allowed_paths_by_job_type": {},
    "deny_paths": [],
    "requires_approval_if_paths_touched": [],
    "self_update_max_depth": 1,
    "control_plane_requires_human_approval": true
  }'::jsonb,
  now()
)
ON CONFLICT (version) DO UPDATE SET
  rules_json = EXCLUDED.rules_json;
