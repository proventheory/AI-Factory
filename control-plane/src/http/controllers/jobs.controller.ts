import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { pool } from "../../db.js";
import { requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

export async function jobFailures(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { job_run_id?: string; run_id?: string; error_signature?: string };
    const jobRunId = body?.job_run_id;
    if (!jobRunId) {
      res.status(400).json({ error: "job_run_id required" });
      return;
    }
    await pool
      .query(`UPDATE job_runs SET next_retry_at = now() WHERE id = $1 AND status = 'failed'`, [jobRunId])
      .catch(() => {});
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
}

export async function jobRunRetry(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const jobRunId = String(req.params.id ?? "");
    const jr = await pool.query("SELECT id, run_id, plan_node_id, attempt FROM job_runs WHERE id = $1", [jobRunId]);
    if (jr.rows.length === 0) {
      res.status(404).json({ error: "Job run not found" });
      return;
    }
    const row = jr.rows[0] as { run_id: string; plan_node_id: string; attempt?: number };
    const newAttempt = (row.attempt ?? 1) + 1;
    const newJobRunId = uuid();
    const idempotencyKey = `${row.run_id}:${row.plan_node_id}`;
    await pool.query(
      `INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key)
       VALUES ($1, $2, $3, $4, 'queued', $5)`,
      [newJobRunId, row.run_id, row.plan_node_id, newAttempt, idempotencyKey]
    );
    res.status(201).json({ id: newJobRunId, run_id: row.run_id, attempt: newAttempt });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function jobRunsList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const environment = req.query.environment as string | undefined;
    const status = req.query.status as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (environment) {
      conditions.push(`r.environment = $${i++}`);
      params.push(environment);
    }
    if (status) {
      conditions.push(`jr.status::text = $${i++}`);
      params.push(status);
    }
    params.push(limit, offset);
    const q = `
      SELECT jr.*, r.environment, pn.node_key, pn.job_type,
             jc.worker_id AS active_worker_id, jc.heartbeat_at, jc.lease_expires_at
      FROM job_runs jr
      JOIN runs r ON r.id = jr.run_id
      JOIN plan_nodes pn ON pn.id = jr.plan_node_id
      LEFT JOIN job_claims jc ON jc.job_run_id = jr.id AND jc.released_at IS NULL
      WHERE ${conditions.join(" AND ")}
      ORDER BY jr.started_at DESC NULLS LAST
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function jobRunLlmCalls(req: Request, res: Response): Promise<void> {
  try {
    const jobRunId = String(req.params.id ?? "");
    const r = await pool.query(
      `SELECT id, model_tier, model_id, tokens_in, tokens_out, latency_ms, created_at
       FROM llm_calls WHERE job_run_id = $1 ORDER BY created_at`,
      [jobRunId]
    );
    const summary = await pool.query(
      `SELECT count(*)::int AS calls,
              coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
              coalesce(sum(tokens_out), 0)::bigint AS tokens_out,
              coalesce(avg(latency_ms), 0)::int AS avg_latency_ms
       FROM llm_calls WHERE job_run_id = $1`,
      [jobRunId]
    );
    res.json({ items: r.rows, summary: summary.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
