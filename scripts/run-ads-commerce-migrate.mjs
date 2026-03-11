#!/usr/bin/env node
/**
 * Run Ads + Commerce canonical migrations: stores, products (WooCommerce/Shopify).
 * Requires: brand_profiles (for stores.brand_profile_id). Reads DATABASE_URL from env.
 * Run before first WooCommerce sync if stores/products do not exist.
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

const migrations = [
  { path: "supabase/migrations/20250329000000_ads_commerce_canonical.sql", name: "ads_commerce_canonical" },
  { path: "supabase/migrations/20250329000001_ads_operator_actions.sql", name: "ads_operator_actions" },
];

const client = new pg.Client({ connectionString: url });

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
        if (err.code === "42710" || err.code === "42P07") {
          console.log(`Skipped ${m.name}: objects already exist`);
        } else {
          throw err;
        }
      }
    }
    console.log("Ads Commerce migrations complete.");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
