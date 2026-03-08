#!/usr/bin/env node
/**
 * Run only the image_assignment and template_contracts migrations.
 * Use when the DB already has earlier migrations applied.
 * Reads DATABASE_URL from env (e.g. via .env).
 */
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrations = [
  "supabase/migrations/20250307100000_image_assignment_and_template_contracts.sql",
  "supabase/migrations/20250308100000_template_image_contracts_constraints.sql",
];

const client = new pg.Client({ connectionString: url });

async function run() {
  await client.connect();
  try {
    for (const path of migrations) {
      const fullPath = join(root, path);
      const name = path.split("/").pop();
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
