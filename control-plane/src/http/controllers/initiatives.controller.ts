import type { Request, Response } from "express";
import { pool, withTransaction } from "../../db.js";
import {
  getAccessTokenForInitiative,
  hasGoogleCredentials,
  deleteGoogleCredentials,
} from "../../seo-google-oauth.js";
import { requireRole } from "../security/rbac.js";
import { normalizeRiskLevel } from "../lib/risk.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";
import { canonicalInitiativeIntentType, intentTypeFilterValues } from "../../lib/intent-type.js";

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const intent_type = req.query.intent_type as string | undefined;
    const risk_level = req.query.risk_level as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (intent_type) {
      const vals = intentTypeFilterValues(intent_type);
      if (vals.length === 1) {
        conditions.push(`intent_type = $${i++}`);
        params.push(vals[0]);
      } else {
        conditions.push(`intent_type IN ($${i++}, $${i++})`);
        params.push(vals[0], vals[1]);
      }
    }
    if (risk_level) {
      const normalized = normalizeRiskLevel(risk_level);
      conditions.push(`risk_level = $${i++}`);
      params.push(normalized);
    }
    params.push(limit, offset);
    const q = `SELECT * FROM initiatives WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const r = await pool.query("SELECT * FROM initiatives WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function patch(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as Record<string, unknown>;
    const allowed = [
      "intent_type",
      "title",
      "risk_level",
      "goal_state",
      "goal_metadata",
      "source_ref",
      "template_id",
      "priority",
      "brand_profile_id",
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowed) {
      if (body[field] !== undefined) {
        if (field === "risk_level") {
          sets.push(`${field} = $${i++}::risk_level`);
          params.push(normalizeRiskLevel(body[field] as string));
        } else if (field === "intent_type") {
          sets.push(`${field} = $${i++}`);
          params.push(canonicalInitiativeIntentType(String(body[field])));
        } else {
          sets.push(`${field} = $${i++}`);
          params.push(body[field]);
        }
      }
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE initiatives SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      intent_type?: string;
      title?: string;
      risk_level?: string;
      created_by?: string;
      goal_state?: string;
      goal_metadata?: Record<string, unknown>;
      source_ref?: string;
      template_id?: string;
      priority?: number;
      brand_profile_id?: string | null;
    };
    const { intent_type, title, risk_level, created_by, goal_state, goal_metadata, source_ref, template_id, priority, brand_profile_id } = body;
    if (!intent_type || !risk_level) {
      res.status(400).json({ error: "intent_type and risk_level required" });
      return;
    }
    const rl = normalizeRiskLevel(risk_level);
    const storedIntent = canonicalInitiativeIntentType(intent_type);
    const r = await pool.query(
      `INSERT INTO initiatives (intent_type, title, risk_level, created_by, goal_state, goal_metadata, source_ref, template_id, priority, brand_profile_id)
       VALUES ($1,$2,$3::risk_level,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`,
      [
        storedIntent,
        title ?? null,
        rl,
        created_by ?? null,
        goal_state ?? null,
        goal_metadata ? JSON.stringify(goal_metadata) : null,
        source_ref ?? null,
        template_id ?? null,
        priority ?? 0,
        brand_profile_id ?? null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42703") {
      return pool
        .query(
          `INSERT INTO initiatives (intent_type, title, risk_level, created_by) VALUES ($1,$2,$3::risk_level,$4) RETURNING *`,
          [
            canonicalInitiativeIntentType((req.body as { intent_type: string }).intent_type),
            (req.body as { title?: string }).title ?? null,
            normalizeRiskLevel((req.body as { risk_level: string }).risk_level),
            (req.body as { created_by?: string }).created_by ?? null,
          ]
        )
        .then((r) => {
          res.status(201).json(r.rows[0]);
        })
        .catch((e2) => {
          res.status(500).json({ error: String((e2 as Error).message) });
        });
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function googleAccessToken(req: Request, res: Response): Promise<void> {
  try {
    const initiativeId = String(req.params.id ?? "");
    const token = await withTransaction((client) => getAccessTokenForInitiative(client, initiativeId));
    if (!token) {
      res.status(404).json({ error: "Google not connected for this initiative" });
      return;
    }
    res.json(token);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function googleConnected(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const connected = await withTransaction((client) => hasGoogleCredentials(client, id));
    res.json({ connected: !!connected });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function deleteGoogleCredentialsHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    await withTransaction((client) => deleteGoogleCredentials(client, id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function createPlan(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const initiativeId = String(req.params.id ?? "");
    const body = (req.body as { seed?: string; force?: boolean }) ?? {};
    const { compilePlan } = await import("../../plan-compiler.js");
    const compiled = await withTransaction((client) =>
      compilePlan(client, initiativeId, { seed: body.seed, force: body.force })
    );
    const nodeCount = compiled.nodeIds.size;
    res.status(201).json({
      id: compiled.planId,
      initiative_id: initiativeId,
      status: "draft",
      nodes: nodeCount,
      plan_hash: compiled.planHash,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Initiative not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

export async function replan(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const initiativeId = String(req.params.id ?? "");
    const { compilePlan } = await import("../../plan-compiler.js");
    const compiled = await withTransaction((client) => compilePlan(client, initiativeId, { force: true }));
    res.status(201).json({
      id: compiled.planId,
      initiative_id: initiativeId,
      status: "draft",
      nodes: compiled.nodeIds.size,
      plan_hash: compiled.planHash,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Initiative not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}
