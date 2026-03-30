#!/usr/bin/env node
/**
 * Run core schemas and optional Supabase migrations using pg (no psql required).
 * Reads DATABASE_URL from env.
 *
 * Order: schemas/001_core_schema.sql, 002_state_machines..., then listed supabase/migrations.
 * Note: supabase/migrations/20250303000000_ai_factory_core.sql through 20250303000005_multi_framework.sql
 * are NOT run here — core schema comes from schemas/001_core_schema.sql (and 002). The 20250303* files
 * are the Supabase-origin equivalents; run-migrate uses the schemas/ files and then picks up from 20250303000008.
 */
import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(__dirname, "..");

/** Single source of truth; also bundled into control-plane for Render (no runtime import() of ESM). */
const migrations = JSON.parse(readFileSync(join(__dirname, "sql-migrations.manifest.json"), "utf8"));

/** Keep in sync with control-plane/src/migrations/supabase-migrate-url.ts */
function resolveMigrationConnectionString(databaseUrl, explicitMigrateUrl) {
  const explicit = explicitMigrateUrl?.trim();
  if (explicit) return explicit;
  const primary = databaseUrl?.trim();
  if (!primary) throw new Error("DATABASE_URL is not set");
  if (!primary.includes("pooler.supabase.com")) return primary;
  try {
    const normalized = primary.replace(/^postgres:\/\//i, "postgresql://");
    const u = new URL(normalized);
    const user = decodeURIComponent(u.username || "");
    const refMatch = user.match(/^postgres\.([a-zA-Z0-9]+)$/i);
    if (refMatch) {
      const ref = refMatch[1];
      const pass =
        u.password !== undefined && u.password !== ""
          ? `:${decodeURIComponent(u.password)}`
          : "";
      const search = u.search || "";
      console.log(
        "[migrations] Using direct Supabase host db.*.supabase.co for DDL (avoids Session pooler MaxClientsInSessionMode).",
      );
      return `postgresql://postgres${pass}@db.${ref}.supabase.co:5432/postgres${search}`;
    }
    const port = u.port || "5432";
    if (port === "5432") {
      u.port = "6543";
      console.log(
        "[migrations] Using Supabase transaction pooler :6543 for DDL (higher client limit than Session :5432).",
      );
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return primary;
}

/**
 * @param {string} [overrideRoot] - App root (parent of schemas/, supabase/). Defaults to repo root when run as CLI.
 */
export async function runMigrations(overrideRoot) {
  const url = resolveMigrationConnectionString(process.env.DATABASE_URL, process.env.DATABASE_URL_MIGRATE);
  if (process.env.DATABASE_URL_MIGRATE?.trim()) {
    console.log("[migrations] Using DATABASE_URL_MIGRATE for startup SQL (explicit).");
  }
  const root = overrideRoot ?? defaultRoot;
  const client = new pg.Client({ connectionString: url });

  for (const m of migrations) {
    const fullPath = join(root, m.path);
    if (!existsSync(fullPath)) {
      throw new Error(`Migration listed but not found: ${m.path}`);
    }
  }

  await client.connect();
  try {
    for (const m of migrations) {
      const fullPath = join(root, m.path);
      const sql = readFileSync(fullPath, "utf8");
      try {
        await client.query(sql);
        console.log(`Ran ${m.name}`);
      } catch (err) {
        const code = err.code;
        const skipCodes = m.skipIfErrorCodes ?? (m.skipIfErrorCode ? [m.skipIfErrorCode] : []);
        const shouldSkip = skipCodes.length && skipCodes.includes(code);
        if (shouldSkip) {
          try {
            await client.query("ROLLBACK");
          } catch (_) {
            /* ignore rollback error */
          }
          console.log(`Skipped ${m.name}: ${m.skipMessage}`);
        } else {
          try {
            await client.query("ROLLBACK");
          } catch (_) {
            /* ignore */
          }
          throw err;
        }
      }
    }
    console.log("Migration complete.");
  } finally {
    await client.end();
  }
}

const selfPath = fileURLToPath(import.meta.url);
const invokedAsCli = Boolean(process.argv[1] && resolve(process.argv[1]) === resolve(selfPath));
if (invokedAsCli) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
