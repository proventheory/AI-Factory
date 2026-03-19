#!/usr/bin/env node
/**
 * CI check (required by plan: Graphs, Artifact Hygiene, Capability Graph, Self-Heal):
 * 1. Every path in run-migrate.mjs under supabase/migrations/ must exist on disk.
 * 2. Every file in supabase/migrations/*.sql must be listed in run-migrate.mjs, except those in SKIP_NOT_IN_RUN_MIGRATE (core schema is applied from schemas/001 and 002; see docs/MIGRATIONS.md).
 * Exit 1 if either check fails. New migrations must be added to run-migrate.mjs in the same PR.
 */
const SKIP_NOT_IN_RUN_MIGRATE = new Set([
  "supabase/migrations/20250303000000_ai_factory_core.sql",
  "supabase/migrations/20250303000001_ai_factory_state_machines.sql",
  "supabase/migrations/20250303000002_ai_factory_rls.sql",
  "supabase/migrations/20250303000003_brand_themes.sql",
  "supabase/migrations/20250303000005_multi_framework.sql",
  "supabase/migrations/20250303000006_gateway_and_mcp.sql",
  "supabase/migrations/20250303000007_brand_engine.sql",
  "supabase/migrations/20250303100005_runs_llm_source.sql",
]);
import { readFileSync, existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const runMigratePath = join(root, "scripts", "run-migrate.mjs");
const migrationsDir = join(root, "supabase", "migrations");

const runMigrateContent = readFileSync(runMigratePath, "utf8");
const pathRegex = /path:\s*["'](supabase\/migrations\/[^"']+\.sql)["']/g;
const registered = new Set();
let match;
while ((match = pathRegex.exec(runMigrateContent)) !== null) {
  registered.add(match[1]);
}

const onDisk = new Set(
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => `supabase/migrations/${f}`)
);

let failed = false;

for (const p of registered) {
  const full = join(root, p);
  if (!existsSync(full)) {
    console.error("CI migration check failed: run-migrate.mjs references missing file:", p);
    failed = true;
  }
}

const missingFromRunMigrate = [...onDisk].filter((p) => !registered.has(p) && !SKIP_NOT_IN_RUN_MIGRATE.has(p)).sort();
if (missingFromRunMigrate.length > 0) {
  console.error("CI migration check failed: these migration files are not in run-migrate.mjs:");
  missingFromRunMigrate.forEach((p) => console.error("  -", p));
  console.error("Add every new migration to the migrations array in scripts/run-migrate.mjs in the same PR.");
  failed = true;
}

if (failed) process.exit(1);
console.log("OK: all", registered.size, "registered migration paths exist; all", onDisk.size, "migration files registered");
