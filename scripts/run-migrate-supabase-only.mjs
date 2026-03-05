#!/usr/bin/env node
/**
 * Run console-required tables, webhook_outbox, brand_design_tokens_flat.
 * Use when the core schema (001, 002) is already applied. Reads DATABASE_URL from env.
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
  { path: "supabase/migrations/20250303100002_console_required_tables.sql", name: "console_required_tables" },
  { path: "supabase/migrations/20250303100000_webhook_outbox.sql", name: "webhook_outbox" },
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
