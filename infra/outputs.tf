output "vercel_project_id" {
  value       = vercel_project.console.id
  description = "Vercel project ID (ai-factory-console)."
}

output "supabase_staging_url" {
  value       = "https://${supabase_project.staging.id}.supabase.co"
  description = "Supabase staging project URL. Use in Console env as NEXT_PUBLIC_SUPABASE_URL for preview."
}

output "supabase_prod_url" {
  value       = "https://${supabase_project.prod.id}.supabase.co"
  description = "Supabase prod project URL. Use in Console env as NEXT_PUBLIC_SUPABASE_URL for production."
}

output "supabase_staging_project_ref" {
  value       = supabase_project.staging.id
  description = "Supabase staging project ref (for CLI: supabase link --project-ref <this>)."
}

output "supabase_prod_project_ref" {
  value       = supabase_project.prod.id
  description = "Supabase prod project ref (for CLI and GitHub Secrets)."
}
