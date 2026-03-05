-- Seed default policy so runs.policy_version FK can reference 'latest'.
-- Control Plane and API use policy_version = 'latest' when creating releases and runs.

INSERT INTO policies (version, rules_json)
VALUES ('latest', '{}'::jsonb)
ON CONFLICT (version) DO NOTHING;
