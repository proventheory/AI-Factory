import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { lookupBySignature as incidentLookup, recordResolution as incidentRecord } from "../../incident-memory.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

export async function incidentsList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const environment = req.query.environment as string | undefined;
    const q = `
      SELECT error_signature, environment, count(*)::int AS run_count, max(started_at) AS last_seen
      FROM job_runs jr JOIN runs r ON r.id = jr.run_id
      WHERE jr.status = 'failed' AND jr.error_signature IS NOT NULL ${environment ? "AND r.environment = $1" : ""}
      GROUP BY jr.error_signature, r.environment
      ORDER BY last_seen DESC NULLS LAST
      LIMIT $${environment ? 2 : 1} OFFSET $${environment ? 3 : 2}
    `;
    const params = environment ? [environment, limit, offset] : [limit, offset];
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function incidentsBySignature(req: Request, res: Response): Promise<void> {
  try {
    const signature = decodeURIComponent(String(req.params.signature ?? ""));
    const limit = Math.min(Number(req.query.limit) || 50, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      `SELECT jr.id, jr.run_id, jr.started_at, jr.ended_at, jr.error_message, r.environment
       FROM job_runs jr JOIN runs r ON r.id = jr.run_id
       WHERE jr.error_signature = $1 ORDER BY jr.started_at DESC LIMIT $2 OFFSET $3`,
      [signature, limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function decisionLoopObserve(_req: Request, res: Response): Promise<void> {
  try {
    res.json({
      anomalies: [],
      baselines: [],
      message:
        "KPI storage not configured; add kpi_baselines and kpi_observations tables to enable.",
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function decisionLoopTick(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { auto_act?: boolean; compute_baselines?: boolean };
    res.json({
      observed: { anomalies: [] },
      baselines_computed: body?.compute_baselines ? 0 : undefined,
      message:
        "KPI storage not configured; tick is a no-op until baselines/observations are wired.",
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function incidentMemoryList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const failureClass = (req.query.failure_class as string) || null;
    let q =
      "SELECT memory_id, failure_signature, failure_class, resolution, confidence, times_seen, last_seen_at, created_at FROM incident_memory WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (failureClass) {
      q += ` AND failure_class = $${i++}`;
      params.push(failureClass);
    }
    q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
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

export async function incidentMemoryPost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      failure_signature?: string;
      failure_class?: string;
      resolution?: string;
      confidence?: number;
    };
    if (!body?.failure_signature || !body?.failure_class || !body?.resolution) {
      res.status(400).json({
        error: "failure_signature, failure_class, and resolution required",
      });
      return;
    }
    await incidentRecord(
      pool,
      body.failure_signature,
      body.failure_class,
      body.resolution,
      typeof body.confidence === "number" ? body.confidence : 0.8
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
