import type { Response } from "express";

/** Return 503 with migration hint when DB is missing tables (42P01). */
export function handleDbMissingTable(e: unknown, res: Response, tableHint = "job_runs"): boolean {
  const code = (e as { code?: string }).code;
  if (code === "42P01") {
    res.status(503).json({
      error: `Database schema not applied: relation "${tableHint}" does not exist. Migrations run automatically on every Control Plane start; redeploy the service or check that it uses the default CMD and DATABASE_URL (see docs/runbooks/console-db-relation-does-not-exist.md).`,
    });
    return true;
  }
  return false;
}
