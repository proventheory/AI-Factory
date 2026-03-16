#!/usr/bin/env node
/**
 * Validate migration filenames against docs/MIGRATION_NAMING.md convention:
 * YYYYMMDD00000_short_snake_case_description.sql
 *
 * Exit 0 if all valid, 1 if any non-standard (warnings printed).
 */
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const migDir = join(root, "supabase/migrations");

// Standard: YYYYMMDD (8) + sequence (4-6 digits) + _ + snake_case + .sql
const STANDARD = /^\d{8}\d{4,6}_[a-z][a-z0-9_]*\.sql$/;

const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const invalid = files.filter((f) => !STANDARD.test(f));

if (invalid.length > 0) {
  console.error("Migration naming: the following files do not match YYYYMMDD00000_snake_case_description.sql:\n");
  invalid.forEach((f) => console.error("  ", f));
  console.error("\nSee docs/MIGRATION_NAMING.md.");
  process.exit(1);
}

console.log(`All ${files.length} migration filenames match the naming convention.`);
process.exit(0);
