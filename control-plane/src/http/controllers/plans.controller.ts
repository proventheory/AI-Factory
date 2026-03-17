import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { pool, withTransaction } from "../../db.js";
import { createRun } from "../../scheduler.js";
import { routeRun } from "../../release-manager.js";
import { requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";
import { runTemplateLintGate } from "../lib/template-lint-gate.js";

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const initiative_id = req.query.initiative_id as string | undefined;
    let q = "SELECT p.*, i.title AS initiative_title, i.intent_type FROM plans p JOIN initiatives i ON i.id = p.initiative_id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2";
    const params: unknown[] = [limit, offset];
    if (initiative_id) {
      q = "SELECT p.*, i.title AS initiative_title, i.intent_type FROM plans p JOIN initiatives i ON i.id = p.initiative_id WHERE p.initiative_id = $1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3";
      params.unshift(initiative_id);
    }
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const planId = String(req.params.id ?? "");
    const [plan, nodes, edges] = await Promise.all([
      pool.query("SELECT p.*, i.title AS initiative_title, i.intent_type FROM plans p JOIN initiatives i ON i.id = p.initiative_id WHERE p.id = $1", [planId]).then((r) => r.rows[0]),
      pool.query("SELECT * FROM plan_nodes WHERE plan_id = $1 ORDER BY node_key", [planId]).then((r) => r.rows),
      pool.query("SELECT * FROM plan_edges WHERE plan_id = $1", [planId]).then((r) => r.rows),
    ]);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    res.json({ plan, nodes, edges });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function start(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const planId = String(req.params.id ?? "");
    const body = (req.body as { environment?: string; llm_source?: string }) ?? {};
    const environment = body?.environment ?? "sandbox";
    const llmSource = body?.llm_source === "openai_direct" ? ("openai_direct" as const) : ("gateway" as const);
    if (!["sandbox", "staging", "prod"].includes(environment)) {
      res.status(400).json({ error: "environment must be sandbox, staging, or prod" });
      return;
    }
    const planRow = await pool.query("SELECT id, initiative_id FROM plans WHERE id = $1", [planId]);
    if (planRow.rows.length === 0) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    const initiativeId = (planRow.rows[0] as { initiative_id: string }).initiative_id;
    const initRow = await pool.query("SELECT template_id, intent_type FROM initiatives WHERE id = $1", [initiativeId]);
    if (initRow.rows.length > 0) {
      const { template_id: templateId, intent_type: intentType } = initRow.rows[0] as { template_id: string | null; intent_type: string };
      if (intentType === "email_design_generator" && templateId) {
        const gate = await runTemplateLintGate(pool, templateId);
        if (!gate.ok) {
          const message = "Template lint failed: " + gate.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
          res.status(400).json({ error: message, lint_errors: gate.errors });
          return;
        }
      }
    }

    let releaseId: string;
    try {
      const route = await routeRun(pool, environment as "sandbox" | "staging" | "prod");
      releaseId = route.releaseId;
    } catch (routeErr) {
      const msg = (routeErr as Error).message;
      if (!msg.includes("No promoted release")) throw routeErr;
      const ins = await pool.query(
        `INSERT INTO releases (id, status, percent_rollout, policy_version) VALUES ($1, 'promoted', 100, 'latest') RETURNING id`,
        [uuid()]
      );
      releaseId = (ins.rows[0] as { id: string }).id;
    }

    const runId = await withTransaction(async (client) => {
      return createRun(client, {
        planId,
        releaseId,
        policyVersion: "latest",
        environment: environment as "sandbox" | "staging" | "prod",
        cohort: "control",
        rootIdempotencyKey: `console:${planId}:${Date.now()}`,
        llmSource,
      });
    });
    res.status(201).json({ id: runId });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
