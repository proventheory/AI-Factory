provider "supabase" {
  access_token = trimspace(var.supabase_access_token)
}

resource "supabase_project" "staging" {
  organization_id   = var.supabase_organization_id
  name              = "ai-factory-staging"
  database_password = var.supabase_db_password_staging
  region            = "us-east-1"

  lifecycle {
    ignore_changes = [database_password]
  }
}

resource "supabase_project" "prod" {
  organization_id   = var.supabase_organization_id
  name              = "ai-factory-prod"
  database_password = var.supabase_db_password_prod
  region            = "us-east-1"

  lifecycle {
    ignore_changes = [database_password]
  }
}
