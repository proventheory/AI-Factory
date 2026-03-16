-- Vercel projects registered for self-heal (webhook + redeploy scan).
-- POST /v1/vercel/register adds a project and creates the webhook via Vercel API;
-- the redeploy scan reads project IDs from env and from this table.
CREATE TABLE IF NOT EXISTS vercel_self_heal_projects (
  project_id  text PRIMARY KEY,
  team_id     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vercel_self_heal_projects_created_at ON vercel_self_heal_projects (created_at DESC);
