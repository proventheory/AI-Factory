# ─── What you need to provide ─────────────────────────────────────────────
# Set via environment variables, -var, or a .tfvars file (do not commit .tfvars with secrets).
# See infra/README.md for where to get each value.

# Vercel: set VERCEL_API_TOKEN in the environment (dashboard → Account → Tokens).

variable "supabase_access_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "supabase_organization_id" {
  type        = string
  description = "Supabase org slug (from dashboard URL or Organization Settings)."
}

variable "supabase_db_password_staging" {
  type      = string
  sensitive = true
  description = "Database password for the staging Supabase project."
}

variable "supabase_db_password_prod" {
  type      = string
  sensitive = true
  description = "Database password for the production Supabase project."
}

variable "github_repo" {
  type        = string
  default     = "proventheory/AI-Factory"
  description = "GitHub repo in form owner/name for Vercel Git connection."
}

variable "vercel_team_id" {
  type        = string
  default     = null
  description = "Vercel team ID if using a team; leave null for personal account."
}

variable "control_plane_url_staging" {
  type        = string
  default     = ""
  description = "Control Plane API URL for staging (e.g. from Render). Set after deploy."
}

variable "control_plane_url_prod" {
  type        = string
  default     = ""
  description = "Control Plane API URL for production. Set after deploy."
}

variable "create_supabase_prod" {
  type        = bool
  default     = false
  description = "Create a separate Supabase project for production. Set to false when org is at free project limit (2); production will use staging project."
}
