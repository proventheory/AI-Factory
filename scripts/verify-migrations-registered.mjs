#!/usr/bin/env node
/**
 * CI check (required by plan: Graphs, Artifact Hygiene, Capability Graph, Self-Heal):
 * 1. Every path in sql-migrations.manifest.json under supabase/migrations/ must exist on disk.
 * 2. Every file in supabase/migrations/*.sql must be listed in the manifest, except those in SKIP_NOT_IN_RUN_MIGRATE (core schema is applied from schemas/001 and 002; see docs/MIGRATIONS.md).
 * Exit 1 if either check fails. New migrations must be added to scripts/sql-migrations.manifest.json in the same PR (same order as run-migrate.mjs uses).
 */
const SKIP_NOT_IN_RUN_MIGRATE = new Set([
  "supabase/migrations/20250303000000_ai_factory_core.sql",
  "supabase/migrations/20250303000001_ai_factory_state_machines.sql",
  "supabase/migrations/20250303000002_ai_factory_rls.sql",
  "supabase/migrations/20250303000003_brand_themes.sql",
  "supabase/migrations/20250303000006_gateway_and_mcp.sql",
  "supabase/migrations/20250303000007_brand_engine.sql",
  "supabase/migrations/20250303100005_runs_llm_source.sql",
]);
import { readFileSync, existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const manifestPath = join(root, "scripts", "sql-migrations.manifest.json");
const migrationsDir = join(root, "supabase", "migrations");

if (!existsSync(manifestPath)) {
  console.error("CI migration check failed: missing", manifestPath);
  process.exit(1);
}

/** @type {{ path: string }[]} */
const migrations = JSON.parse(readFileSync(manifestPath, "utf8"));

const registered = new Set(
  migrations.filter((m) => m.path.startsWith("supabase/migrations/")).map((m) => m.path)
);

const onDisk = new Set(
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && !/ 2\.sql$/.test(f))
    .map((f) => `supabase/migrations/${f}`)
);

let failed = false;

for (const m of migrations) {
  const full = join(root, m.path);
  if (!existsSync(full)) {
    console.error("CI migration check failed: manifest references missing file:", m.path);
    failed = true;
  }
}

for (const p of registered) {
  const full = join(root, p);
  if (!existsSync(full)) {
    console.error("CI migration check failed: manifest references missing file:", p);
    failed = true;
  }
}

const missingFromManifest = [...onDisk].filter((p) => !registered.has(p) && !SKIP_NOT_IN_RUN_MIGRATE.has(p)).sort();
if (missingFromManifest.length > 0) {
  console.error("CI migration check failed: these migration files are not in sql-migrations.manifest.json:");
  missingFromManifest.forEach((p) => console.error("  -", p));
  console.error("Add every new migration to scripts/sql-migrations.manifest.json in the same PR.");
  failed = true;
}

if (failed) process.exit(1);
console.log("OK: all", migrations.length, "manifest paths exist;", registered.size, "supabase paths;", onDisk.size, "files on disk");
