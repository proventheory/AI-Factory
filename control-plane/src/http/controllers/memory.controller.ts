import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { lookupBySignature as incidentLookup } from "../../incident-memory.js";
import { getRole, requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

export async function memoryLookup(req: Request, res: Response): Promise<void> {
  try {
    const signature =
      (req.query.signature as string) || (req.query.failure_signature as string) || "";
    const scopeKey = (req.query.scope_key as string) || null;
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const incidents = await incidentLookup(pool, signature, null, limit);
    let entries: unknown[] = [];
    try {
      let q =
        "SELECT memory_id, memory_type, scope_type, scope_key, title, summary, signature_json, resolution_json, confidence, times_seen, last_seen_at FROM memory_entries WHERE memory_type IN ('incident', 'repair_recipe', 'failure_pattern')";
      const params: unknown[] = [];
      let i = 1;
      if (scopeKey) {
        q += ` AND (scope_key = $${i++} OR scope_key IS NULL)`;
        params.push(scopeKey);
      }
      q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
      params.push(limit);
      const r = await pool.query(q, params);
      entries = r.rows;
    } catch {
      // table may not exist
    }
    res.json({ similar_incidents: incidents, memory_entries: entries });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.json({ similar_incidents: [], memory_entries: [] });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function memoryEntriesList(req: Request, res: Response): Promise<void> {
  try {
    const memoryType = (req.query.memory_type as string) || null;
    const scopeType = (req.query.scope_type as string) || null;
    const scopeKey = (req.query.scope_key as string) || null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    let q =
      "SELECT memory_id, memory_type, scope_type, scope_key, title, summary, signature_json, evidence_json, resolution_json, confidence, times_seen, last_seen_at, created_at FROM memory_entries WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (memoryType) {
      q += ` AND memory_type = $${i++}`;
      params.push(memoryType);
    }
    if (scopeType) {
      q += ` AND scope_type = $${i++}`;
      params.push(scopeType);
    }
    if (scopeKey) {
      q += ` AND scope_key = $${i++}`;
      params.push(scopeKey);
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

export async function agentMemoryList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const initiative_id = req.query.initiative_id as string | undefined;
    const run_id = req.query.run_id as string | undefined;
    const scope = req.query.scope as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (initiative_id) {
      conditions.push(`initiative_id = $${i++}`);
      params.push(initiative_id);
    }
    if (run_id) {
      conditions.push(`run_id = $${i++}`);
      params.push(run_id);
    }
    if (scope) {
      conditions.push(`scope = $${i++}`);
      params.push(scope);
    }
    params.push(limit, offset);
    const q = `SELECT * FROM agent_memory WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function agentMemoryGetById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT * FROM agent_memory WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function agentMemoryPost(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as {
      initiative_id?: string;
      run_id?: string;
      scope: string;
      key: string;
      value: string;
    };
    if (!body.scope || !body.key) {
      res.status(400).json({ error: "scope and key required" });
      return;
    }
    const r = await pool.query(
      `INSERT INTO agent_memory (initiative_id, run_id, scope, key, value)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        body.initiative_id ?? null,
        body.run_id ?? null,
        body.scope,
        body.key,
        body.value ?? "",
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function agentMemoryPatch(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const id = String(req.params.id ?? "");
    const body = req.body as { value?: string; scope?: string; key?: string };
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.value !== undefined) {
      sets.push(`value = $${i++}`);
      params.push(body.value);
    }
    if (body.scope !== undefined) {
      sets.push(`scope = $${i++}`);
      params.push(body.scope);
    }
    if (body.key !== undefined) {
      sets.push(`key = $${i++}`);
      params.push(body.key);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    params.push(id);
    const r = await pool.query(
      `UPDATE agent_memory SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
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

export async function mcpServersList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      "SELECT * FROM mcp_server_config ORDER BY name LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function mcpServersGetById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT * FROM mcp_server_config WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function mcpServersPost(req: Request, res: Response): Promise<void> {
  try {
    const role = getRole(req);
    if (role !== "admin" && role !== "operator") {
      res.status(403).json({ error: "Admin or Operator required" });
      return;
    }
    const body = req.body as {
      name: string;
      server_type: string;
      url_or_cmd: string;
      args_json?: unknown;
      env_json?: unknown;
      auth_header?: string;
      capabilities?: string[];
    };
    if (!body.name || !body.server_type || !body.url_or_cmd) {
      res.status(400).json({ error: "name, server_type, url_or_cmd required" });
      return;
    }
    const r = await pool.query(
      `INSERT INTO mcp_server_config (name, server_type, url_or_cmd, args_json, env_json, auth_header, capabilities)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        body.name,
        body.server_type,
        body.url_or_cmd,
        body.args_json ? JSON.stringify(body.args_json) : null,
        body.env_json ? JSON.stringify(body.env_json) : null,
        body.auth_header ?? null,
        body.capabilities ?? null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function mcpServersPatch(req: Request, res: Response): Promise<void> {
  try {
    const role = getRole(req);
    if (role !== "admin" && role !== "operator") {
      res.status(403).json({ error: "Admin or Operator required" });
      return;
    }
    const id = String(req.params.id ?? "");
    const body = req.body as Record<string, unknown>;
    const allowedFields = [
      "name",
      "server_type",
      "url_or_cmd",
      "args_json",
      "env_json",
      "auth_header",
      "capabilities",
      "active",
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        const val =
          field === "args_json" || field === "env_json"
            ? JSON.stringify(body[field])
            : body[field];
        sets.push(`${field} = $${i++}`);
        params.push(val);
      }
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    sets.push("updated_at = now()");
    params.push(id);
    const r = await pool.query(
      `UPDATE mcp_server_config SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
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

export async function mcpServersDelete(req: Request, res: Response): Promise<void> {
  try {
    const role = getRole(req);
    if (role !== "admin") {
      res.status(403).json({ error: "Admin required" });
      return;
    }
    const id = String(req.params.id ?? "");
    const r = await pool.query(
      "DELETE FROM mcp_server_config WHERE id = $1 RETURNING id",
      [id]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ deleted: true, id });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function mcpServersTest(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT * FROM mcp_server_config WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const server = r.rows[0] as {
      server_type: string;
      url_or_cmd: string;
      auth_header?: string;
    };
    if (server.server_type === "http") {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const result = await fetch(server.url_or_cmd, {
          method: "GET",
          signal: controller.signal,
        })
          .then((r) => ({ ok: r.ok, status: r.status }))
          .catch((e) => ({ ok: false, status: 0, error: String(e) }));
        clearTimeout(timeout);
        res.json({ reachable: result.ok || (result as { status: number }).status > 0, status: (result as { status: number }).status });
      } catch (e) {
        res.json({ reachable: false, error: String((e as Error).message) });
      }
    } else {
      res.json({
        server_type: "stdio",
        message:
          "Stdio servers cannot be tested remotely; they are spawned by the Runner.",
      });
    }
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function routingPoliciesList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      "SELECT * FROM routing_policies WHERE active = true ORDER BY job_type LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function routingPoliciesPost(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as {
      job_type: string;
      model_tier?: string;
      config_json?: unknown;
    };
    if (!body.job_type) {
      res.status(400).json({ error: "job_type required" });
      return;
    }
    const r = await pool.query(
      `INSERT INTO routing_policies (job_type, model_tier, config_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_type) DO UPDATE SET model_tier = $2, config_json = $3, updated_at = now()
       RETURNING *`,
      [
        body.job_type,
        body.model_tier ?? "auto/chat",
        body.config_json ? JSON.stringify(body.config_json) : null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function llmBudgetsList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      "SELECT * FROM llm_budgets WHERE active = true ORDER BY scope_type, scope_value LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function llmBudgetsPost(req: Request, res: Response): Promise<void> {
  try {
    const role = getRole(req);
    if (role !== "admin" && role !== "operator") {
      res.status(403).json({ error: "Admin or Operator required" });
      return;
    }
    const body = req.body as {
      scope_type: string;
      scope_value: string;
      budget_tokens?: number;
      budget_dollars?: number;
      period?: string;
    };
    if (!body.scope_type || !body.scope_value) {
      res.status(400).json({ error: "scope_type and scope_value required" });
      return;
    }
    const r = await pool.query(
      `INSERT INTO llm_budgets (scope_type, scope_value, budget_tokens, budget_dollars, period)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scope_type, scope_value) DO UPDATE SET budget_tokens = $3, budget_dollars = $4, period = $5, updated_at = now()
       RETURNING *`,
      [
        body.scope_type,
        body.scope_value,
        body.budget_tokens ?? null,
        body.budget_dollars ?? null,
        body.period ?? "monthly",
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
