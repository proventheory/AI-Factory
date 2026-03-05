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
  { path: "supabase/migrations/20250303000004_email_marketing_factory.sql", name: "email_campaign_metadata" },
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
          console.log(`Skipped ${m.name}: ${m.skipMessage}`);
        } else {
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
