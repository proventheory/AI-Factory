#!/usr/bin/env node
/**
 * Run core schemas and optional Supabase migrations using pg (no psql required).
 * Reads DATABASE_URL from env.
 * Order: 001_core_schema, 002, webhook_outbox, console_required_tables, brand_design_tokens_flat.
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
  { path: "supabase/migrations/20250306110000_email_templates_brand_profile.sql", name: "email_templates_brand_profile", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  { path: "supabase/migrations/20250307100000_image_assignment_and_template_contracts.sql", name: "image_assignment_and_template_contracts" },
  { path: "supabase/migrations/20250308100000_template_image_contracts_constraints.sql", name: "template_image_contracts_constraints" },
  { path: "supabase/migrations/20250311100000_email_templates_generic_builder_names.sql", name: "email_templates_generic_builder_names" },
  { path: "supabase/migrations/20250312000000_run_log_entries.sql", name: "run_log_entries" },
  { path: "supabase/migrations/20250312000001_template_proof.sql", name: "template_proof" },
  { path: "supabase/migrations/20250313000000_email_component_library.sql", name: "email_component_library", skipIfErrorCode: "42710", skipMessage: "policy/objects already exist" },
  { path: "supabase/migrations/20250313000001_email_templates_component_sequence.sql", name: "email_templates_component_sequence", skipIfErrorCode: "42710", skipMessage: "column/objects already exist" },
  { path: "supabase/migrations/20250314000000_email_component_library_use_context.sql", name: "email_component_library_use_context" },
  { path: "supabase/migrations/20250315100000_stitch_template_contract.sql", name: "stitch_template_contract" },
  { path: "supabase/migrations/20250316100000_email_component_library_html_fragment.sql", name: "email_component_library_html_fragment", skipIfErrorCode: "42701", skipMessage: "column already exists" },
  {
    path: "supabase/migrations/20250318000000_rename_email_campaign_metadata_to_email_design_generator.sql",
    name: "rename_email_campaign_metadata_to_email_design_generator",
    skipIfErrorCode: "42P07",
    skipMessage: "table already renamed",
  },
  { path: "supabase/migrations/20250310100000_brand_google_credentials.sql", name: "brand_google_credentials" },
  { path: "supabase/migrations/20250310200000_worker_registry_ensure.sql", name: "worker_registry_ensure" },
  { path: "supabase/migrations/20250320100000_initiative_google_credentials.sql", name: "initiative_google_credentials" },
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
];

async function run() {
  await client.connect();
  try {
    for (const m of migrations) {
      const fullPath = join(root, m.path);
      if (!existsSync(fullPath)) {
        console.log(`Skipping ${m.path} (file not found)`);
        continue;
      }
      const sql = readFileSync(fullPath, "utf8");
      try {
        await client.query(sql);
        console.log(`Ran ${m.name}`);
      } catch (err) {
        const code = err.code;
        if (m.skipIfErrorCode && code === m.skipIfErrorCode) {
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
