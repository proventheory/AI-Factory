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
  { path: "supabase/migrations/20250303000004_email_marketing_factory.sql", name: "email_campaign_metadata", skipIfErrorCode: "42710", skipMessage: "policy/objects already exist" },
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
