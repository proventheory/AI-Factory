#!/usr/bin/env node
/**
 * One-time fix when Console shows "Control Plane database schema is missing".
 * Run this with the SAME DATABASE_URL the Control Plane API uses (e.g. from .env).
 * Then refresh the Console. Prefer fixing the Render build (use Dockerfile.control-plane, no Start Command override) so future deploys self-heal.
 *
 * Usage: node scripts/one-time-migrate-for-console.mjs
 *        npm run db:migrate:console
 * Requires: DATABASE_URL in env or .env
 */
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url?.trim()) {
  console.error("DATABASE_URL is not set. Set it in .env or the environment (use the same DB as the Control Plane API).");
  process.exit(1);
}

console.log("Running migrations against the same DB the API uses...");
const { spawnSync } = await import("child_process");
const { fileURLToPath } = await import("url");
const { dirname, join } = await import("path");
const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, "run-migrate.mjs");
const result = spawnSync(process.execPath, [scriptPath], {
  env: process.env,
  cwd: join(__dirname, ".."),
  stdio: "inherit",
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
console.log("Done. Refresh the Console (Initiatives, Launches, etc.) — schema should now be present.");
