-- Secret refs for Vault-backed secrets (GitHub, OpenAI, Vercel, Supabase).
-- Actual secret values: add via Dashboard → Project Settings → Vault, or run
-- scripts/seed-supabase-vault.sql once per project (replace placeholders).

INSERT INTO secret_refs (name, vault_path, scope)
SELECT v.name, v.vault_path, v.scope::environment_type
FROM (VALUES
  ('github_token', 'github_token', 'staging'),
  ('github_token', 'github_token', 'prod'),
  ('openai_api_key', 'openai_api_key', 'staging'),
  ('openai_api_key', 'openai_api_key', 'prod'),
  ('vercel_api_token', 'vercel_api_token', 'staging'),
  ('vercel_api_token', 'vercel_api_token', 'prod'),
  ('supabase_access_token', 'supabase_access_token', 'staging'),
  ('supabase_access_token', 'supabase_access_token', 'prod'),
  ('render_api_key', 'render_api_key', 'staging'),
  ('render_api_key', 'render_api_key', 'prod')
) AS v(name, vault_path, scope)
WHERE NOT EXISTS (
  SELECT 1 FROM secret_refs s WHERE s.name = v.name AND s.scope = v.scope::environment_type
);
