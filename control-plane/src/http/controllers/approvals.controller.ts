import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { completeApprovalAndAdvance } from "../../scheduler.js";
import { requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

export async function pending(_req: Request, res: Response): Promise<void> {
  try {
    const r = await pool
      .query(
        `SELECT ar.id, ar.run_id, ar.plan_node_id, ar.requested_at, ar.requested_reason, ar.context_ref,
              ar.requested_by,
              pn.node_key, pn.job_type
       FROM approval_requests ar
       JOIN plan_nodes pn ON pn.id = ar.plan_node_id
       ORDER BY ar.requested_at ASC`
      )
      .catch(() => ({ rows: [] }));
    const items = (r.rows ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      action_required: "approve_or_reject",
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["approver", "admin"])) return;
    const body = req.body as { run_id?: string; job_run_id?: string; plan_node_id?: string; action?: string; comment?: string };
    const { run_id, job_run_id, plan_node_id, action, comment } = body;
    if (!run_id || !action) {
      res.status(400).json({ error: "run_id and action (approve|reject) required" });
      return;
    }
    if (action !== "approve" && action !== "reject") {
      res.status(400).json({ error: "action must be approve or reject" });
      return;
    }
    const approver = (req.headers["x-user-id"] as string) ?? "api";
    const actionVal = action === "approve" ? "approved" : "rejected";
    let r: { rows: unknown[] };
    try {
      r = await pool.query(
        `INSERT INTO approvals (run_id, job_run_id, plan_node_id, approver, action, comment)
         VALUES ($1, $2, $3, $4, $5::approval_action, $6) RETURNING *`,
        [run_id, job_run_id ?? null, plan_node_id ?? null, approver, actionVal, comment ?? null]
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "42703") {
        r = await pool.query(
          `INSERT INTO approvals (run_id, job_run_id, approver, action) VALUES ($1, $2, $3, $4::approval_action) RETURNING *`,
          [run_id, job_run_id ?? null, approver, actionVal]
        );
      } else throw e;
    }
    if (plan_node_id) {
      await pool.query("DELETE FROM approval_requests WHERE run_id = $1 AND plan_node_id = $2", [run_id, plan_node_id]).catch(() => {});
      if (actionVal === "approved") {
        const client = await pool.connect();
        let committed = false;
        try {
          await client.query("BEGIN");
          await completeApprovalAndAdvance(client, run_id, plan_node_id);
          await client.query("COMMIT");
          committed = true;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          if (!committed) await client.query("ROLLBACK").catch(() => {});
          client.release();
        }
      }
    }
    res.status(201).json(r.rows[0] ?? { run_id, action: actionVal });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const run_id = req.query.run_id as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (run_id) {
      conditions.push(`run_id = $${i++}`);
      params.push(run_id);
    }
    params.push(limit, offset);
    const q = `SELECT * FROM approvals WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
