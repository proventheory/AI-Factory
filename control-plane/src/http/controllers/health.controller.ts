import type { Request, Response } from "express";
import { pool } from "../../db.js";

export function health(_req: Request, res: Response): void {
  res.json({
    status: "ok",
    service: "control-plane",
    /** Console uses this to detect pre–Shopify-shpat_ API builds (missing = redeploy control-plane). */
    capabilities: {
      shopify_brand_admin_token: true,
    },
  });
}

export async function healthDb(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query("SELECT 1");
    const url = process.env.DATABASE_URL;
    let database_hint: { host?: string; port?: string } | undefined;
    if (url && typeof url === "string") {
      try {
        const u = new URL(url.replace(/^postgres:\/\//, "postgresql://"));
        database_hint = { host: u.hostname || undefined, port: u.port || undefined };
      } catch {
        database_hint = { host: "(parse error)" };
      }
    }
    res.json({ status: "ok", db: "connected", database_hint });
  } catch (e) {
    res.status(503).json({ status: "error", db: String((e as Error).message) });
  }
}

export function healthMigrations(_req: Request, res: Response): void {
  res.json({
    status: "ok",
    message: "Migrations run on Control Plane startup via run-migrate.mjs",
    note: "No migration registry table; check startup logs for apply status.",
  });
}

export async function healthSchema(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", schema_drift_endpoint: "/v1/schema_drift" });
  } catch (e) {
    res.status(503).json({ status: "error", schema: String((e as Error).message) });
  }
}

export async function v1Health(_req: Request, res: Response): Promise<void> {
  try {
    const [workers, activeLeases, staleLeases] = await Promise.all([
      pool.query(`SELECT worker_id, last_heartbeat_at, runner_version FROM worker_registry ORDER BY last_heartbeat_at DESC`).then((r) => r.rows),
      pool.query(`
        SELECT jc.job_run_id, jc.worker_id, jc.claimed_at, jc.lease_expires_at, jc.heartbeat_at
        FROM job_claims jc WHERE jc.released_at IS NULL ORDER BY jc.heartbeat_at DESC
      `).then((r) => r.rows),
      pool.query(`
        SELECT count(*)::int AS c FROM job_claims WHERE released_at IS NULL AND heartbeat_at < now() - interval '2 minutes'
      `).then((r) => r.rows[0]?.c ?? 0),
    ]);
    res.json({ workers, active_leases: activeLeases, stale_leases_count: staleLeases });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export function ingestClientError(req: Request, res: Response): void {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "JSON body required (e.g. { message, code, context })" });
    return;
  }
  res.status(202).json({ accepted: true, message: "Error report accepted for processing." });
}
