-- Run once per Supabase project to store secrets in Vault.
-- In Supabase: SQL Editor → paste this, replace the placeholders, then Run.
-- Names must match secret_refs.vault_path (see migration 20250303000008_vault_secret_refs.sql).

SELECT vault.create_secret('YOUR_GITHUB_PAT', 'github_token', 'GitHub PAT');
SELECT vault.create_secret('YOUR_OPENAI_API_KEY', 'openai_api_key', 'OpenAI API key');
SELECT vault.create_secret('YOUR_VERCEL_API_TOKEN', 'vercel_api_token', 'Vercel API token');
SELECT vault.create_secret('YOUR_SUPABASE_ACCESS_TOKEN', 'supabase_access_token', 'Supabase access token');
SELECT vault.create_secret('YOUR_RENDER_API_KEY', 'render_api_key', 'Render API key');
