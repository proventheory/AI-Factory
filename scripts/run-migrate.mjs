#!/usr/bin/env node
/**
 * Run schemas/001_core_schema.sql and 002_state_machines_and_constraints.sql
 * using pg (no psql required). Reads DATABASE_URL from env.
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

const client = new pg.Client({ connectionString: url });

async function run() {
  await client.connect();
  try {
    const sql1 = readFileSync(join(root, "schemas/001_core_schema.sql"), "utf8");
    const sql2 = readFileSync(join(root, "schemas/002_state_machines_and_constraints.sql"), "utf8");
    await client.query(sql1);
    console.log("Ran schemas/001_core_schema.sql");
    await client.query(sql2);
    console.log("Ran schemas/002_state_machines_and_constraints.sql");
    console.log("Migration complete.");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
