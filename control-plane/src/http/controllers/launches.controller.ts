import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { pool, withTransaction } from "../../db.js";
import { registerVercelProjectForSelfHeal } from "../../vercel-redeploy-self-heal.js";
import { requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";
import { isValidUuid } from "../lib/email-preview-helpers.js";

export async function buildSpecsList(req: Request, res: Response): Promise<void> {
  try {
    const initiativeId = req.query.initiative_id as string | undefined;
    if (!initiativeId || !isValidUuid(initiativeId)) {
      res.status(400).json({ error: "initiative_id (UUID) required" });
      return;
    }
    const r = await pool.query(
      "SELECT id, initiative_id, spec_json, created_at, updated_at FROM build_specs WHERE initiative_id = $1 ORDER BY created_at DESC",
      [initiativeId]
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function buildSpecsGetById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) {
      res.status(400).json({ error: "Invalid UUID" });
      return;
    }
    const r = await pool.query("SELECT id, initiative_id, spec_json, created_at, updated_at FROM build_specs WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function buildSpecsPost(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as { initiative_id?: string; spec?: Record<string, unknown>; extended?: boolean };
    const initiativeId = body?.initiative_id;
    const spec = body?.spec ?? {};
    if (!initiativeId || !isValidUuid(initiativeId)) {
      res.status(400).json({ error: "initiative_id (UUID) required" });
      return;
    }
    const specJson = typeof spec === "object" && spec !== null ? spec : {};
    const bid = uuid();
    const lid = uuid();
    await withTransaction(async (client) => {
      await client.query(
        "INSERT INTO build_specs (id, initiative_id, spec_json, updated_at) VALUES ($1, $2, $3, now())",
        [bid, initiativeId, JSON.stringify(specJson)]
      );
      await client.query(
        "INSERT INTO launches (id, initiative_id, status, build_spec_id, updated_at) VALUES ($1, $2, 'draft', $3, now())",
        [lid, initiativeId, bid]
      );
    });
    const vercelProjectId = (specJson as { vercel_project_id?: string; projectId?: string }).vercel_project_id ?? (specJson as { vercel_project_id?: string; projectId?: string }).projectId;
    if (typeof vercelProjectId === "string" && vercelProjectId.trim()) {
      const teamId = (specJson as { vercel_team_id?: string; teamId?: string }).vercel_team_id ?? (specJson as { vercel_team_id?: string; teamId?: string }).teamId;
      registerVercelProjectForSelfHeal(vercelProjectId.trim(), typeof teamId === "string" ? teamId.trim() : undefined).catch((e) =>
        console.warn("[build_specs] Vercel self-heal register failed:", (e as Error).message)
      );
    }
    const launchRow = await pool.query(
      "SELECT id, initiative_id, status, build_spec_id, artifact_id, deploy_url, deploy_id, domain, verification_status, created_at, updated_at FROM launches WHERE id = $1",
      [lid]
    );
    res.status(201).json({
      build_spec_id: bid,
      launch_id: lid,
      launch: launchRow.rows[0] ?? { id: lid, initiative_id: initiativeId, status: "draft", build_spec_id: bid, artifact_id: null, deploy_url: null, deploy_id: null, domain: null, verification_status: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function buildSpecsFromStrategy(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as { initiative_id?: string; strategy_doc?: string };
    const initiativeId = body?.initiative_id;
    const strategyDoc = body?.strategy_doc ?? "";
    if (!initiativeId || !isValidUuid(initiativeId)) {
      res.status(400).json({ error: "initiative_id (UUID) required" });
      return;
    }
    const spec: Record<string, unknown> = { strategy_doc: strategyDoc };
    const bid = uuid();
    const lid = uuid();
    await withTransaction(async (client) => {
      await client.query(
        "INSERT INTO build_specs (id, initiative_id, spec_json, updated_at) VALUES ($1, $2, $3, now())",
        [bid, initiativeId, JSON.stringify(spec)]
      );
      await client.query(
        "INSERT INTO launches (id, initiative_id, status, build_spec_id, updated_at) VALUES ($1, $2, 'draft', $3, now())",
        [lid, initiativeId, bid]
      );
    });
    const launchRow = await pool.query(
      "SELECT id, initiative_id, status, build_spec_id, artifact_id, deploy_url, deploy_id, domain, verification_status, created_at, updated_at FROM launches WHERE id = $1",
      [lid]
    );
    res.status(201).json({
      build_spec_id: bid,
      launch_id: lid,
      launch: launchRow.rows[0] ?? { id: lid, initiative_id: initiativeId, status: "draft", build_spec_id: bid, artifact_id: null, deploy_url: null, deploy_id: null, domain: null, verification_status: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function launchesList(req: Request, res: Response): Promise<void> {
  try {
    const initiativeId = req.query.initiative_id as string | undefined;
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (initiativeId && isValidUuid(initiativeId)) {
      conditions.push(`initiative_id = $${i++}`);
      params.push(initiativeId);
    }
    params.push(limit);
    const r = await pool.query(
      `SELECT id, initiative_id, status, build_spec_id, artifact_id, deploy_url, deploy_id, domain, verification_status, created_at, updated_at FROM launches WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i}`,
      params
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function launchesGetById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) {
      res.status(400).json({ error: "Invalid UUID" });
      return;
    }
    const r = await pool.query(
      "SELECT id, initiative_id, status, build_spec_id, artifact_id, deploy_url, deploy_id, domain, verification_status, created_at, updated_at FROM launches WHERE id = $1",
      [id]
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

export async function launchesActions(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const action = String(req.params.action ?? "");
    const inputs = (req.body ?? {}) as Record<string, unknown>;
    if (!action) {
      res.status(400).json({ error: "action required" });
      return;
    }
    const projectId = typeof inputs.projectId === "string" ? inputs.projectId.trim() : null;
    if (projectId) {
      const teamId = typeof inputs.teamId === "string" ? inputs.teamId.trim() : undefined;
      registerVercelProjectForSelfHeal(projectId, teamId).catch((e) =>
        console.warn("[launches/actions] Vercel self-heal register failed:", (e as Error).message)
      );
    }
    res.json({ ok: true, action, inputs });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function launchesValidate(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) {
      res.status(400).json({ error: "Invalid UUID" });
      return;
    }
    const r = await pool.query("SELECT id FROM launches WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ passed: true, checks: [] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
