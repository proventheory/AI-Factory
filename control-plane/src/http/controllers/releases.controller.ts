import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { runUpgradeGates } from "../../upgrade-gates.js";
import { requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status as string | undefined;
    let q = "SELECT * FROM releases ORDER BY created_at DESC LIMIT $1 OFFSET $2";
    const params: unknown[] = [limit, offset];
    if (status) {
      q = "SELECT * FROM releases WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
      params.unshift(status);
    }
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT * FROM releases WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function rollout(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["approver", "admin"])) return;
    const releaseId = String(req.params.id ?? "");
    const percent = Number((req.body as { percent?: number }).percent);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      res.status(400).json({ error: "Body must include percent (0–100)" });
      return;
    }
    const gates = await runUpgradeGates(pool, { releaseId });
    if (!gates.pass) {
      res.status(400).json({
        error: "Upgrade gates failed",
        schema_errors: gates.schemaPolicy.errors,
        control_plane_errors: gates.controlPlane.errors,
      });
      return;
    }
    await pool.query(
      "UPDATE releases SET percent_rollout = $1, status = 'promoted' WHERE id = $2",
      [percent, releaseId]
    );
    const up = await pool.query("SELECT id, percent_rollout FROM releases WHERE id = $1", [releaseId]);
    if (up.rows.length === 0) {
      res.status(404).json({ error: "Release not found" });
      return;
    }
    res.json(up.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function canary(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["approver", "admin"])) return;
    const releaseId = String(req.params.id ?? "");
    const { environment = "prod", percent = 0 } = (req.body as { environment?: string; percent?: number }) ?? {};
    const pct = Math.max(0, Math.min(100, Number(percent)));
    const gates = await runUpgradeGates(pool, { releaseId });
    if (!gates.pass) {
      res.status(400).json({
        error: "Upgrade gates failed",
        schema_errors: gates.schemaPolicy.errors,
        control_plane_errors: gates.controlPlane.errors,
      });
      return;
    }
    const ruleId = `canary-${releaseId.slice(0, 8)}-${environment}`;
    await pool.query(
      `INSERT INTO release_routes (rule_id, release_id, environment, cohort, percent, active_from, active_to)
       VALUES ($1, $2, $3::environment_type, 'canary', $4, now(), NULL)`,
      [ruleId, releaseId, environment, pct]
    );
    const policies = await pool.query(
      "SELECT * FROM release_routes WHERE release_id = $1 AND environment = $2",
      [releaseId, environment]
    );
    res.json({ release_id: releaseId, environment, canary_percent: pct, routes: policies.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
