#!/usr/bin/env node
/**
 * Run core schemas and optional Supabase migrations using pg (no psql required).
 * Reads DATABASE_URL from env.
 * Order: 001_core_schema, 002_state_machines_and_constraints,
 *        supabase/migrations/20250303100000_webhook_outbox,
 *        supabase/migrations/20250303100001_brand_design_tokens_flat.
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
  { path: "schemas/001_core_schema.sql", name: "001_core_schema" },
  { path: "schemas/002_state_machines_and_constraints.sql", name: "002_state_machines_and_constraints" },
  { path: "supabase/migrations/20250303100000_webhook_outbox.sql", name: "webhook_outbox" },
  { path: "supabase/migrations/20250303100001_brand_design_tokens_flat.sql", name: "brand_design_tokens_flat" },
];

async function run() {
  await client.connect();
  try {
    for (const { path: relPath, name } of migrations) {
      const fullPath = join(root, relPath);
      if (!existsSync(fullPath)) {
        console.log(`Skipping ${relPath} (file not found)`);
        continue;
      }
      const sql = readFileSync(fullPath, "utf8");
      await client.query(sql);
      console.log(`Ran ${name}`);
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
