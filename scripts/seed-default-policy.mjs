#!/usr/bin/env node
/**
 * One-off: insert default policy 'latest' so runs.policy_version FK is satisfied.
 * Usage: node -r dotenv/config scripts/seed-default-policy.mjs
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

const sql = `
INSERT INTO policies (version, rules_json)
VALUES ('latest', '{}'::jsonb)
ON CONFLICT (version) DO NOTHING;
`;

async function run() {
  await client.connect();
  try {
    await client.query(sql);
    console.log("Seed default policy: inserted or already exists (version='latest').");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
