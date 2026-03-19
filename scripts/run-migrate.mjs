#!/usr/bin/env node
/**
 * Run core schemas and optional Supabase migrations using pg (no psql required).
 * Reads DATABASE_URL from env.
 *
 * Order: schemas/001_core_schema.sql, 002_state_machines..., then listed supabase/migrations.
 * Note: supabase/migrations/20250303000000_ai_factory_core.sql through 20250303000005_multi_framework.sql
 * are NOT run here — core schema comes from schemas/001_core_schema.sql (and 002). The 20250303* files
 * are the Supabase-origin equivalents; run-migrate uses the schemas/ files and then picks up from 20250303000008.
 */
import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

const migrations = [
  { path: "schemas/001_core_schema.sql", name: "001_core_schema", skipIfErrorCode: "42710", skipMessage: "objects already exist" },
  { path: "schemas/002_state_machines_and_constraints.sql", name: "002_state_machines_and_constraints", skipIfErrorCode: "42710", skipMessage: "objects already exist" },
  { path: "supabase/migrations/20250303000008_vault_secret_refs.sql", name: "vault_secret_refs" },
  { path: "supabase/migrations/20250303000004_email_marketing_factory.sql", name: "email_marketing_factory", skipIfErrorCode: "42710", skipMessage: "policy/objects already exist" },
  { path: "supabase/migrations/20250303100000_webhook_outbox.sql", name: "webhook_outbox" },
  { path: "supabase/migrations/20250303100002_console_required_tables.sql", name: "console_required_tables" },
  { path: "supabase/migrations/20250303100003_brand_embeddings.sql", name: "brand_embeddings" },
  { path: "supabase/migrations/20250303100004_seed_default_policy.sql", name: "seed_default_policy" },
  {
    path: "supabase/migrations/20250303100001_brand_design_tokens_flat.sql",
    name: "brand_design_tokens_flat",
    skipIfErrorCode: "42P01",
    skipMessage: "brand_profiles not found (run Supabase migration 20250303000007_brand_engine.sql first)",
  },
  { path: "supabase/migrations/20250305100000_email_templates.sql", name: "email_templates", skipIfErrorCode: "42710", skipMessage: "policy/objects already exist" },
  { path: "supabase/migrations/20250306100000_initiatives_brand_template_columns.sql", name: "initiatives_brand_template_columns", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  { path: "supabase/migrations/20250306110000_email_templates_brand_profile.sql", name: "email_templates_brand_profile", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  { path: "supabase/migrations/20250306120000_email_campaign_schema_ensure.sql", name: "email_campaign_schema_ensure", skipIfErrorCode: "42710", skipMessage: "objects already exist" },
  { path: "supabase/migrations/20250306130000_artifact_verifications.sql", name: "artifact_verifications" },
  { path: "supabase/migrations/20250306140000_upload_bucket_and_policies.sql", name: "upload_bucket_and_policies", skipIfErrorCode: "42710", skipMessage: "policy/objects already exist" },
  { path: "supabase/migrations/20250307100000_image_assignment_and_template_contracts.sql", name: "image_assignment_and_template_contracts" },
  { path: "supabase/migrations/20250308100000_template_image_contracts_constraints.sql", name: "template_image_contracts_constraints" },
  { path: "supabase/migrations/20250309100000_introducing_emma_contract.sql", name: "introducing_emma_contract", skipIfErrorCode: "42710", skipMessage: "policy/objects already exist" },
  { path: "supabase/migrations/20250310100000_fix_introducing_emma_hero_placeholder.sql", name: "fix_introducing_emma_hero_placeholder" },
  { path: "supabase/migrations/20250311100000_email_templates_generic_builder_names.sql", name: "email_templates_generic_builder_names" },
  { path: "supabase/migrations/20250312000000_run_log_entries.sql", name: "run_log_entries" },
  { path: "supabase/migrations/20250312000001_template_proof.sql", name: "template_proof" },
  { path: "supabase/migrations/20250313000000_email_component_library.sql", name: "email_component_library", skipIfErrorCode: "42710", skipMessage: "policy/objects already exist" },
  { path: "supabase/migrations/20250313000001_email_templates_component_sequence.sql", name: "email_templates_component_sequence", skipIfErrorCode: "42710", skipMessage: "column/objects already exist" },
  { path: "supabase/migrations/20250314000000_email_component_library_use_context.sql", name: "email_component_library_use_context" },
  { path: "supabase/migrations/20250315100000_stitch_template_contract.sql", name: "stitch_template_contract" },
  { path: "supabase/migrations/20250316000000_approval_requests_requested_by.sql", name: "approval_requests_requested_by", skipIfErrorCodes: ["42701", "42P01"], skipMessage: "column already exists or table not yet created" },
  { path: "supabase/migrations/20250316100000_email_component_library_html_fragment.sql", name: "email_component_library_html_fragment", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  {
    path: "supabase/migrations/20250318000000_rename_email_campaign_metadata_to_email_design_generator.sql",
    name: "rename_email_campaign_metadata_to_email_design_generator",
    skipIfErrorCode: "42P07",
    skipMessage: "table already renamed",
  },
  { path: "supabase/migrations/20250310200000_worker_registry_ensure.sql", name: "worker_registry_ensure" },
  { path: "supabase/migrations/20250317000000_intent_type_email_design_generator.sql", name: "intent_type_email_design_generator", skipIfErrorCodes: ["42701", "42P01"], skipMessage: "column already exists or table renamed" },
  { path: "supabase/migrations/20250320100000_initiative_google_credentials.sql", name: "initiative_google_credentials", skipIfErrorCode: "42710", skipMessage: "policy/objects already exist" },
  { path: "supabase/migrations/20250320110000_brand_google_credentials.sql", name: "brand_google_credentials", skipIfErrorCode: "42710", skipMessage: "policy/table already exists" },
  { path: "supabase/migrations/20250320120000_brand_google_ga4_property_id.sql", name: "brand_google_ga4_property_id", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  { path: "supabase/migrations/20250320000000_seo_url_risk_snapshots.sql", name: "seo_url_risk_snapshots", skipIfErrorCode: "42710", skipMessage: "policy/table already exists" },
  { path: "supabase/migrations/20250331000010_artifact_consumption.sql", name: "artifact_consumption", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250331000011_capability_graph.sql", name: "capability_graph", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250321000000_phase6_durable_graph_runtime.sql", name: "phase6_durable_graph_runtime", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250327000000_pipeline_drafts_and_pattern_overrides.sql", name: "pipeline_drafts_and_pattern_overrides" },
  { path: "supabase/migrations/20250330000000_brand_klaviyo_credentials_and_sync.sql", name: "brand_klaviyo_credentials_and_sync" },
  { path: "supabase/migrations/20250330000001_klaviyo_operator_actions.sql", name: "klaviyo_operator_actions" },
  { path: "supabase/migrations/20250330000002_klaviyo_flow_sync.sql", name: "klaviyo_flow_sync" },
  { path: "supabase/migrations/20250330000003_klaviyo_performance.sql", name: "klaviyo_performance" },
  { path: "supabase/migrations/20250330000004_klaviyo_source_mappings_entity_types.sql", name: "klaviyo_source_mappings_entity_types" },
  { path: "supabase/migrations/20250329000000_ads_commerce_canonical.sql", name: "ads_commerce_canonical", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250331000000_airtable_import_and_brand_catalog.sql", name: "airtable_import_and_brand_catalog", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250331000001_shopify_brand_and_product_pricing.sql", name: "shopify_brand_and_product_pricing", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  { path: "supabase/migrations/20250331000002_organizations_and_brand_website.sql", name: "organizations_and_brand_website", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250331000003_taxonomy_websites_upsert_constraint.sql", name: "taxonomy_websites_upsert_constraint", skipIfErrorCode: "42710", skipMessage: "constraint already exists" },
  { path: "supabase/migrations/20250331000004_taxonomy_terms_url_value.sql", name: "taxonomy_terms_url_value", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  { path: "supabase/migrations/20250331000005_raw_woocommerce_snapshots.sql", name: "raw_woocommerce_snapshots", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250318100000_build_specs_launches.sql", name: "build_specs_launches", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250320200000_vercel_self_heal_projects.sql", name: "vercel_self_heal_projects", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250315000000_graph_self_heal_tables.sql", name: "graph_self_heal_tables", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250331000012_artifact_knowledge_graph.sql", name: "artifact_knowledge_graph", skipIfErrorCode: "42701", skipMessage: "column/table already exists" },
  { path: "supabase/migrations/20250331000013_schema_snapshots.sql", name: "schema_snapshots", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250401000000_graph_os_kinds.sql", name: "graph_os_kinds", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250401000001_graph_os_registry.sql", name: "graph_os_registry", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250401000002_graph_os_projection_mappings.sql", name: "graph_os_projection_mappings", skipIfErrorCodes: ["42P07", "23505"], skipMessage: "table already exists or already seeded" },
  { path: "supabase/migrations/20250401000003_graph_os_projection_views.sql", name: "graph_os_projection_views", skipIfErrorCode: "42P07", skipMessage: "view already exists" },
  { path: "supabase/migrations/20250401000004_graph_os_operators_saved_flows.sql", name: "graph_os_operators_saved_flows", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250401000005_graph_os_intent_build_specs.sql", name: "graph_os_intent_build_specs", skipIfErrorCodes: ["42P07", "42703"], skipMessage: "table already exists or column missing (schema partial)" },
  { path: "supabase/migrations/20250401000006_graph_os_reconciliation_action_policies.sql", name: "graph_os_reconciliation_action_policies", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250401000007_graph_os_seed_action_policies.sql", name: "graph_os_seed_action_policies", skipIfErrorCode: "42P07", skipMessage: "already seeded" },
  { path: "supabase/migrations/20250401000008_graph_os_approval_requests_v2.sql", name: "graph_os_approval_requests_v2", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250402000000_runs_repo_commit_job_runs_next_retry.sql", name: "runs_repo_commit_job_runs_next_retry", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  { path: "supabase/migrations/20250402100000_policies_rules_json_guardrails.sql", name: "policies_rules_json_guardrails" },
  { path: "supabase/migrations/20250403000000_incidents.sql", name: "incidents", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250403000001_incident_evidence.sql", name: "incident_evidence", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250403000002_failure_signatures.sql", name: "failure_signatures", skipIfErrorCodes: ["42P07", "42710"], skipMessage: "table or constraint already exists" },
  { path: "supabase/migrations/20250403000003_incident_signature_matches.sql", name: "incident_signature_matches", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250403000004_repair_recipes.sql", name: "repair_recipes", skipIfErrorCodes: ["42P07", "42703"], skipMessage: "table already exists or column missing" },
  { path: "supabase/migrations/20250403000005_repair_plans.sql", name: "repair_plans", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250403000006_repair_attempts.sql", name: "repair_attempts", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250403000007_verification_runs.sql", name: "verification_runs", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250403000008_incident_memories.sql", name: "incident_memories", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250403000009_release_recovery_state.sql", name: "release_recovery_state", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250403000010_seed_failure_signatures.sql", name: "seed_failure_signatures", skipIfErrorCode: "42710", skipMessage: "already seeded" },
  { path: "supabase/migrations/20250403000011_seed_repair_recipes.sql", name: "seed_repair_recipes", skipIfErrorCodes: ["42710", "42703"], skipMessage: "already seeded or schema partial" },
  { path: "supabase/migrations/20250403000012_repair_recipes_rollback_then_branch_patch.sql", name: "repair_recipes_rollback_then_branch_patch", skipIfErrorCodes: ["42P07", "42703"], skipMessage: "constraint already updated or column missing" },
  { path: "supabase/migrations/20250404000000_evolution_loop_v1.sql", name: "evolution_loop_v1", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20250404000001_evolution_targets_seed.sql", name: "evolution_targets_seed", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
  { path: "supabase/migrations/20260318000000_brand_shopify_credentials.sql", name: "brand_shopify_credentials", skipIfErrorCodes: ["42P07", "42710"], skipMessage: "table or policy already exists" },
  { path: "supabase/migrations/20250416000000_seo_ranked_keywords_cache.sql", name: "seo_ranked_keywords_cache", skipIfErrorCode: "42P07", skipMessage: "table already exists" },
];

async function run() {
  // Guard: every listed migration file must exist (no silent skips).
  for (const m of migrations) {
    const fullPath = join(root, m.path);
    if (!existsSync(fullPath)) {
      throw new Error(`Migration listed but not found: ${m.path}`);
    }
  }

  await client.connect();
  try {
    for (const m of migrations) {
      const fullPath = join(root, m.path);
      const sql = readFileSync(fullPath, "utf8");
      try {
        await client.query(sql);
        console.log(`Ran ${m.name}`);
      } catch (err) {
        const code = err.code;
        const skipCodes = m.skipIfErrorCodes ?? (m.skipIfErrorCode ? [m.skipIfErrorCode] : []);
        const shouldSkip = skipCodes.length && skipCodes.includes(code);
        if (shouldSkip) {
          try {
            await client.query("ROLLBACK");
          } catch (_) {
            /* ignore rollback error */
          }
          console.log(`Skipped ${m.name}: ${m.skipMessage}`);
        } else {
          try {
            await client.query("ROLLBACK");
          } catch (_) {
            /* ignore */
          }
          throw err;
        }
      }
    }
    console.log("Migration complete.");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
