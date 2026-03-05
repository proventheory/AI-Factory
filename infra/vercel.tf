# Vercel provider reads VERCEL_API_TOKEN from the environment automatically.
# For team accounts, set VERCEL_TEAM_ID in env; omit for personal account.
provider "vercel" {}

resource "vercel_project" "console" {
  name      = "ai-factory-console"
  framework = "nextjs"
  root_directory = "console"
  serverless_function_region = "iad1"

  git_repository = {
    type = "github"
    repo = var.github_repo
  }

  # Set Production branch to "prod" in Vercel Dashboard → Project → Settings → Git after first apply.
}

# Staging / Preview (main and PRs) — use Supabase staging + optional Control Plane staging URL
resource "vercel_project_environment_variable" "staging_supabase_url" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_SUPABASE_URL"
  value      = "https://${supabase_project.staging.id}.supabase.co"
  target     = ["preview", "development"]
}

# Sensitive vars cannot target "development" in Vercel API — use preview + set in dashboard for local if needed
resource "vercel_project_environment_variable" "staging_supabase_anon" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  value      = "REPLACE_AFTER_FIRST_APPLY"
  target     = ["preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "staging_control_plane" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_CONTROL_PLANE_API"
  value     = var.control_plane_url_staging != "" ? var.control_plane_url_staging : "https://api.example.com"
  target    = ["preview", "development"]
}

# Production — use Supabase prod when created, else staging (e.g. when org at 2-project limit)
locals {
  supabase_prod_ref = var.create_supabase_prod ? supabase_project.prod[0].id : supabase_project.staging.id
}
resource "vercel_project_environment_variable" "prod_supabase_url" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_SUPABASE_URL"
  value      = "https://${local.supabase_prod_ref}.supabase.co"
  target     = ["production"]
}

resource "vercel_project_environment_variable" "prod_supabase_anon" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  value      = "REPLACE_AFTER_FIRST_APPLY"
  target     = ["production"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "prod_control_plane" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_CONTROL_PLANE_API"
  value     = var.control_plane_url_prod != "" ? var.control_plane_url_prod : "https://api.example.com"
  target    = ["production"]
}
