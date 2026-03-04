# Vercel provider reads VERCEL_API_TOKEN from the environment automatically.
provider "vercel" {
  team_id = var.vercel_team_id
}

resource "vercel_project" "console" {
  name      = "ai-factory-console"
  framework = "nextjs"
  root_directory = "console"
  serverless_function_region = "iad1"

  git_repository = {
    type = "github"
    repo = var.github_repo
  }

  # Production branch = prod (per plan)
  production_branch = "prod"
}

# Staging / Preview (main and PRs) — use Supabase staging + optional Control Plane staging URL
resource "vercel_project_environment_variable" "staging_supabase_url" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_SUPABASE_URL"
  value      = "https://${supabase_project.staging.id}.supabase.co"
  target     = ["preview", "development"]
}

resource "vercel_project_environment_variable" "staging_supabase_anon" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  value      = "REPLACE_AFTER_FIRST_APPLY"
  target     = ["preview", "development"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "staging_control_plane" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_CONTROL_PLANE_API"
  value     = var.control_plane_url_staging != "" ? var.control_plane_url_staging : "https://api.example.com"
  target    = ["preview", "development"]
}

# Production — use Supabase prod + Control Plane prod URL
resource "vercel_project_environment_variable" "prod_supabase_url" {
  project_id = vercel_project.console.id
  key        = "NEXT_PUBLIC_SUPABASE_URL"
  value      = "https://${supabase_project.prod.id}.supabase.co"
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
