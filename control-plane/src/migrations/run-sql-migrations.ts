/**
 * SQL migrations for Control Plane startup (no runtime import() of ESM).
 * Order matches scripts/run-migrate.mjs via scripts/sql-migrations.manifest.json at repo root / image /app.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import pg from "pg";
import { resolveMigrationConnectionString } from "./supabase-migrate-url.js";

type MigrationRow = {
  path: string;
  name: string;
  skipIfErrorCode?: string;
  skipIfErrorCodes?: string[];
  skipMessage?: string;
};

export async function runSqlMigrations(repoRoot: string): Promise<void> {
  const manifestPath = path.join(repoRoot, "scripts", "sql-migrations.manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing migration manifest: ${manifestPath}`);
  }
  const migrations = JSON.parse(readFileSync(manifestPath, "utf8")) as MigrationRow[];

  const url = resolveMigrationConnectionString(process.env.DATABASE_URL, process.env.DATABASE_URL_MIGRATE);
  if (process.env.DATABASE_URL_MIGRATE?.trim()) {
    console.log("[migrations] Using DATABASE_URL_MIGRATE for startup SQL (explicit).");
  }
  console.log("[migrations] App root:", repoRoot, "manifest:", manifestPath, "entries:", migrations.length);

  const client = new pg.Client({ connectionString: url });

  for (const m of migrations) {
    const fullPath = path.join(repoRoot, m.path);
    if (!existsSync(fullPath)) {
      throw new Error(`Migration listed but not found: ${m.path}`);
    }
  }

  await client.connect();
  try {
    for (const m of migrations) {
      const fullPath = path.join(repoRoot, m.path);
      const sql = readFileSync(fullPath, "utf8");
      try {
        await client.query(sql);
        console.log(`Ran ${m.name}`);
      } catch (err) {
        const code = (err as { code?: string }).code;
        const skipCodes = m.skipIfErrorCodes ?? (m.skipIfErrorCode ? [m.skipIfErrorCode] : []);
        const shouldSkip = Boolean(skipCodes.length && code && skipCodes.includes(code));
        if (shouldSkip) {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* ignore */
          }
          console.log(`Skipped ${m.name}: ${m.skipMessage}`);
        } else {
          try {
            await client.query("ROLLBACK");
          } catch {
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
