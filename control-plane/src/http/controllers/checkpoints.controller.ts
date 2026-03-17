import type { Request, Response } from "express";
import { pool } from "../../db.js";

export async function checkpointsList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const scopeType = (req.query.scope_type as string) || null;
    const scopeId = (req.query.scope_id as string) || null;
    let q =
      "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (scopeType) {
      q += ` AND scope_type = $${i++}`;
      params.push(scopeType);
    }
    if (scopeId) {
      q += ` AND scope_id = $${i++}`;
      params.push(scopeId);
    }
    q += ` ORDER BY created_at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.json({ items: [], limit: 50 });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function checkpointsCreate(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { scope_type?: string; scope_id?: string; run_id?: string };
    if (!body?.scope_type || !body?.scope_id) {
      res.status(400).json({ error: "scope_type and scope_id required" });
      return;
    }
    const r = await pool.query(
      "INSERT INTO graph_checkpoints (scope_type, scope_id, run_id) VALUES ($1, $2, $3) RETURNING checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at",
      [body.scope_type, body.scope_id, body.run_id ?? null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function checkpointsGetById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query(
      "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE checkpoint_id = $1",
      [id]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function checkpointsDiff(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const cp = await pool.query(
      "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE checkpoint_id = $1",
      [id]
    );
    if (cp.rows.length === 0) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    const checkpoint = cp.rows[0] as {
      checkpoint_id: string;
      scope_type: string;
      scope_id: string;
      created_at: string;
      schema_snapshot_artifact_id: string | null;
    };
    res.json({
      checkpoint_id: checkpoint.checkpoint_id,
      scope_type: checkpoint.scope_type,
      scope_id: checkpoint.scope_id,
      created_at: checkpoint.created_at,
      current_schema: { tables: 0, columns: 0 },
      current_tables: [],
      current_columns: [],
      snapshot_artifact_id: checkpoint.schema_snapshot_artifact_id,
      snapshot_diff: null,
      message:
        "Post-migration audit not run; set up artifact content for schema snapshot to compute diff.",
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function knownGood(req: Request, res: Response): Promise<void> {
  try {
    const scopeType = (req.query.scope_type as string) || null;
    const scopeId = (req.query.scope_id as string) || null;
    if (!scopeType || !scopeId) {
      res.status(400).json({ error: "scope_type and scope_id required" });
      return;
    }
    const r = await pool.query(
      "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE scope_type = $1 AND scope_id = $2 ORDER BY created_at DESC LIMIT 1",
      [scopeType, scopeId]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "No checkpoint found for this scope" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function failureClusters(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const r = await pool.query(
      "SELECT failure_class, COUNT(*) AS count, MAX(last_seen_at) AS last_seen FROM incident_memory GROUP BY failure_class ORDER BY count DESC, last_seen DESC LIMIT $1",
      [limit]
    );
    res.json({ clusters: r.rows });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.json({ clusters: [] });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}
