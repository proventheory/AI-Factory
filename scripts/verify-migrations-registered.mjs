#!/usr/bin/env node
/**
 * CI check (required by plan: Graphs, Artifact Hygiene, Capability Graph, Self-Heal):
 * 1. Every path in run-migrate.mjs under supabase/migrations/ must exist on disk.
 * 2. Every file in supabase/migrations/*.sql must be listed in run-migrate.mjs.
 * Exit 1 if either check fails. New migrations must be added to run-migrate.mjs in the same PR.
 */
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

const missingFromRunMigrate = [...onDisk].filter((p) => !registered.has(p)).sort();
if (missingFromRunMigrate.length > 0) {
  console.error("CI migration check failed: these migration files are not in run-migrate.mjs:");
  missingFromRunMigrate.forEach((p) => console.error("  -", p));
  console.error("Add every new migration to the migrations array in scripts/run-migrate.mjs in the same PR.");
  failed = true;
}

if (failed) process.exit(1);
console.log("OK: all", registered.size, "registered migration paths exist; all", onDisk.size, "migration files registered");
