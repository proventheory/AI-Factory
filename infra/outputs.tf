output "vercel_project_id" {
  value       = vercel_project.console.id
  description = "Vercel project ID (ai-factory-console)."
}

output "supabase_staging_url" {
  value       = "https://${supabase_project.staging.id}.supabase.co"
  description = "Supabase staging project URL. Use in Console env as NEXT_PUBLIC_SUPABASE_URL for preview."
}

output "supabase_prod_url" {
  value       = "https://${local.supabase_prod_ref}.supabase.co"
  description = "Supabase prod project URL (uses staging when create_supabase_prod is false)."
}

output "supabase_staging_project_ref" {
  value       = supabase_project.staging.id
  description = "Supabase staging project ref (for CLI: supabase link --project-ref <this>)."
}

output "supabase_prod_project_ref" {
  value       = local.supabase_prod_ref
  description = "Supabase prod project ref (same as staging when create_supabase_prod is false)."
}
