import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import { pool, withTransaction } from "./db.js";
import { createRun, completeApprovalAndAdvance } from "./scheduler.js";
import { executeRollback } from "./release-manager.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** RBAC stub: resolve role from header or JWT. In production use Supabase Auth + custom claim. */
function getRole(_req: express.Request): "viewer" | "operator" | "approver" | "admin" {
  const role = _req.headers["x-role"] as string | undefined;
  if (role === "admin" || role === "approver" || role === "operator" || role === "viewer") return role;
  return "viewer";
}

/** GET /health */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "control-plane" });
});

/** GET /health/db — check DB connectivity */
app.get("/health/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (e) {
    res.status(503).json({ status: "error", db: String((e as Error).message) });
  }
});

/** GET /v1/dashboard — stub: stale_leases, queue_depth, workers count */
app.get("/v1/dashboard", async (req, res) => {
  try {
    const env = (req.query.environment as string) ?? "sandbox";
    const [staleLeases, queueDepth, workers] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS c FROM job_claims WHERE released_at IS NULL AND heartbeat_at < now() - interval '2 minutes'`
      ).then(r => r.rows[0]?.c ?? 0),
      pool.query(
        `SELECT count(*)::int AS c FROM job_runs jr JOIN runs r ON r.id = jr.run_id WHERE r.environment = $1 AND r.started_at > now() - interval '1 hour' AND jr.status IN ('queued','running')`,
        [env]
      ).then(r => r.rows[0]?.c ?? 0),
      pool.query(`SELECT count(*)::int AS c FROM worker_registry WHERE last_heartbeat_at > now() - interval '5 minutes'`).then(r => r.rows[0]?.c ?? 0),
    ]);
    res.json({ stale_leases: staleLeases, queue_depth: queueDepth, workers_alive: workers });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/initiatives — list with filters and pagination */
app.get("/v1/initiatives", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const intent_type = req.query.intent_type as string | undefined;
    const risk_level = req.query.risk_level as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (intent_type) { conditions.push(`intent_type = $${i++}`); params.push(intent_type); }
    if (risk_level) { conditions.push(`risk_level = $${i++}`); params.push(risk_level); }
    params.push(limit, offset);
    const q = `SELECT * FROM initiatives WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/initiatives/:id */
app.get("/v1/initiatives/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM initiatives WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PATCH /v1/initiatives/:id — update initiative (Operator+) */
app.patch("/v1/initiatives/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as Record<string, unknown>;
    const allowed = ["intent_type", "title", "risk_level", "goal_state", "source_ref", "template_id", "priority"];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowed) {
      if (body[field] !== undefined) {
        if (field === "risk_level") { sets.push(`${field} = $${i++}::risk_level`); }
        else { sets.push(`${field} = $${i++}`); }
        params.push(body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE initiatives SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/initiatives — create (Operator+ in prod); accepts goal_state, source_ref, template_id */
app.post("/v1/initiatives", async (req, res) => {
  try {
    const body = req.body as {
      intent_type?: string; title?: string; risk_level?: string; created_by?: string;
      goal_state?: string; goal_metadata?: Record<string, unknown>; source_ref?: string; template_id?: string; priority?: number;
    };
    const { intent_type, title, risk_level, created_by, goal_state, goal_metadata, source_ref, template_id, priority } = body;
    if (!intent_type || !risk_level) return res.status(400).json({ error: "intent_type and risk_level required" });
    const r = await pool.query(
      `INSERT INTO initiatives (intent_type, title, risk_level, created_by, goal_state, goal_metadata, source_ref, template_id, priority)
       VALUES ($1,$2,$3::risk_level,$4,$5,$6::jsonb,$7,$8,$9) RETURNING *`,
      [
        intent_type, title ?? null, risk_level, created_by ?? null,
        goal_state ?? null, goal_metadata ? JSON.stringify(goal_metadata) : null, source_ref ?? null, template_id ?? null, priority ?? 0,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42703") {
      return pool.query(
        `INSERT INTO initiatives (intent_type, title, risk_level, created_by) VALUES ($1,$2,$3::risk_level,$4) RETURNING *`,
        [(req.body as { intent_type: string }).intent_type, (req.body as { title?: string }).title ?? null, (req.body as { risk_level: string }).risk_level, (req.body as { created_by?: string }).created_by ?? null]
      ).then(r => res.status(201).json(r.rows[0])).catch(e2 => res.status(500).json({ error: String((e2 as Error).message) }));
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/plans — list with pagination (optional initiative_id filter) */
app.get("/v1/plans", async (req, res) => {
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
});

/** GET /v1/plans/:id — plan with nodes and edges (for DAG) */
app.get("/v1/plans/:id", async (req, res) => {
  try {
    const planId = req.params.id;
    const [plan, nodes, edges] = await Promise.all([
      pool.query("SELECT p.*, i.title AS initiative_title, i.intent_type FROM plans p JOIN initiatives i ON i.id = p.initiative_id WHERE p.id = $1", [planId]).then(r => r.rows[0]),
      pool.query("SELECT * FROM plan_nodes WHERE plan_id = $1 ORDER BY node_key", [planId]).then(r => r.rows),
      pool.query("SELECT * FROM plan_edges WHERE plan_id = $1", [planId]).then(r => r.rows),
    ]);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json({ plan, nodes, edges });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/runs — list with filters and pagination */
app.get("/v1/runs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const environment = req.query.environment as string | undefined;
    const status = req.query.status as string | undefined;
    const cohort = req.query.cohort as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (environment) { conditions.push(`r.environment = $${i++}`); params.push(environment); }
    if (status) { conditions.push(`r.status = $${i++}`); params.push(status); }
    if (cohort) { conditions.push(`r.cohort = $${i++}`); params.push(cohort); }
    params.push(limit, offset);
    const q = `
      WITH fail AS (
        SELECT run_id, max(error_signature) FILTER (WHERE status = 'failed') AS top_error_signature,
               count(*) FILTER (WHERE status = 'failed')::int AS failures_count
        FROM job_runs GROUP BY run_id
      )
      SELECT r.*, f.top_error_signature, f.failures_count
      FROM runs r LEFT JOIN fail f ON f.run_id = r.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY r.started_at DESC NULLS LAST
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/runs/:id — full flight recorder (run + plan + node_progress + job_runs + tool_calls + events) */
app.get("/v1/runs/:id", async (req, res) => {
  try {
    const runId = req.params.id;
    const [run, planNodes, planEdges, nodeProgress, jobRuns, runEvents] = await Promise.all([
      pool.query("SELECT * FROM runs WHERE id = $1", [runId]).then(r => r.rows[0]),
      pool.query("SELECT pn.* FROM plans p JOIN plan_nodes pn ON pn.plan_id = p.id WHERE p.id = (SELECT plan_id FROM runs WHERE id = $1)", [runId]).then(r => r.rows),
      pool.query("SELECT pe.* FROM plans p JOIN plan_edges pe ON pe.plan_id = p.id WHERE p.id = (SELECT plan_id FROM runs WHERE id = $1)", [runId]).then(r => r.rows),
      pool.query("SELECT * FROM node_progress WHERE run_id = $1", [runId]).then(r => r.rows),
      pool.query("SELECT jr.* FROM job_runs jr WHERE jr.run_id = $1 ORDER BY plan_node_id, attempt DESC", [runId]).then(r => r.rows),
      pool.query("SELECT * FROM run_events WHERE run_id = $1 ORDER BY created_at", [runId]).then(r => r.rows),
    ]);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json({ run, plan_nodes: planNodes, plan_edges: planEdges, node_progress: nodeProgress, job_runs: jobRuns, run_events: runEvents });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/runs/:id/artifacts — list artifacts for a run (optional producer_plan_node_id in response) */
app.get("/v1/runs/:id/artifacts", async (req, res) => {
  try {
    const runId = req.params.id;
    const exists = await pool.query("SELECT id FROM runs WHERE id = $1", [runId]);
    if (exists.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    const r = await pool.query(
      "SELECT * FROM artifacts WHERE run_id = $1 ORDER BY created_at",
      [runId]
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/runs/:id/status — for CI polling: run status (queued, running, succeeded, failed) */
app.get("/v1/runs/:id/status", async (req, res) => {
  try {
    const r = await pool.query("SELECT id, status FROM runs WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    res.json({ id: r.rows[0].id, status: r.rows[0].status });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/runs/:id/cancel — set run cancelled (cancelled_at + status or metadata) */
app.post("/v1/runs/:id/cancel", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const runId = req.params.id;
    const reason = (req.body as { reason?: string })?.reason ?? null;
    const r = await pool.query(
      "UPDATE runs SET cancelled_at = now(), cancelled_reason = $2, status = 'failed' WHERE id = $1 RETURNING id, status, cancelled_at",
      [runId, reason]
    ).catch(() => pool.query("UPDATE runs SET status = 'failed' WHERE id = $1 RETURNING id, status", [runId]));
    if (r.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/runs — create run (requires plan_id, release_id, environment, root_idempotency_key) — stub; real impl uses scheduler.createRun */
app.post("/v1/runs", async (req, res) => {
  res.status(501).json({ error: "Use scheduler.createRun via internal API; not yet exposed with validation" });
});

/** POST /v1/initiatives/:id/plan — create a plan via plan compiler (idempotent by plan_hash) */
app.post("/v1/initiatives/:id/plan", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const initiativeId = req.params.id;
    const body = (req.body as { seed?: string; force?: boolean }) ?? {};
    const { compilePlan } = await import("./plan-compiler.js");
    const compiled = await compilePlan(pool, initiativeId, { seed: body.seed, force: body.force });
    const nodeCount = compiled.nodeIds.size;
    res.status(201).json({ id: compiled.planId, initiative_id: initiativeId, status: "draft", nodes: nodeCount, plan_hash: compiled.planHash });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Initiative not found") return res.status(404).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

/** POST /v1/runs/:id/rerun — create a new run with the same plan (Operator+) */
app.post("/v1/runs/:id/rerun", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const runId = req.params.id;
    const r = await pool.query(
      "SELECT plan_id, release_id, policy_version, environment, cohort FROM runs WHERE id = $1",
      [runId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    const row = r.rows[0];
    const newRunId = await withTransaction(async (client) => {
      return createRun(client, {
        planId: row.plan_id,
        releaseId: row.release_id,
        policyVersion: row.policy_version ?? "latest",
        environment: row.environment,
        cohort: row.cohort,
        rootIdempotencyKey: `rerun:${runId}:${Date.now()}`,
      });
    });
    res.status(201).json({ id: newRunId });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/runs/:id/rollback — trigger rollback for this run's release in this environment */
app.post("/v1/runs/:id/rollback", async (req, res) => {
  try {
    const role = getRole(req);
    if (role !== "admin" && role !== "operator") return res.status(403).json({ error: "Forbidden" });
    const runId = req.params.id;
    const r = await pool.query("SELECT release_id, environment FROM runs WHERE id = $1", [runId]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    const { release_id, environment } = r.rows[0];
    await executeRollback(pool, release_id, environment);
    res.json({ ok: true, release_id, environment });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/releases/:id/rollout — set percent_rollout (0–100) for the release (Admin/Operator) */
app.post("/v1/releases/:id/rollout", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const releaseId = req.params.id;
    const percent = Number((req.body as { percent?: number }).percent);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      return res.status(400).json({ error: "Body must include percent (0–100)" });
    }
    await pool.query(
      "UPDATE releases SET percent_rollout = $1, status = 'promoted' WHERE id = $2",
      [percent, releaseId]
    );
    const up = await pool.query("SELECT id, percent_rollout FROM releases WHERE id = $1", [releaseId]);
    if (up.rows.length === 0) return res.status(404).json({ error: "Release not found" });
    res.json(up.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/releases/:id/canary — set canary percent in release_routes for an environment */
app.post("/v1/releases/:id/canary", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const releaseId = req.params.id;
    const { environment = "prod", percent = 0 } = req.body as { environment?: string; percent?: number };
    const pct = Math.max(0, Math.min(100, Number(percent)));
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
});

/** GET /v1/approvals/pending — list runs/nodes waiting for human approval (from approval_requests) */
app.get("/v1/approvals/pending", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT ar.id, ar.run_id, ar.plan_node_id, ar.requested_at, ar.requested_reason, ar.context_ref,
              pn.node_key, pn.job_type
       FROM approval_requests ar
       JOIN plan_nodes pn ON pn.id = ar.plan_node_id
       ORDER BY ar.requested_at ASC`
    ).catch(() => ({ rows: [] }));
    res.json({ items: r.rows ?? [] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/approvals — record an approval decision; accepts plan_node_id; clears approval_requests row */
app.post("/v1/approvals", async (req, res) => {
  try {
    const role = getRole(req);
    if (role !== "approver" && role !== "admin") return res.status(403).json({ error: "Approver or Admin required" });
    const body = req.body as { run_id?: string; job_run_id?: string; plan_node_id?: string; action?: string; comment?: string };
    const { run_id, job_run_id, plan_node_id, action, comment } = body;
    if (!run_id || !action) return res.status(400).json({ error: "run_id and action (approve|reject) required" });
    if (action !== "approve" && action !== "reject") return res.status(400).json({ error: "action must be approve or reject" });
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
        try {
          await client.query("BEGIN");
          await completeApprovalAndAdvance(client, run_id, plan_node_id);
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      }
    }
    res.status(201).json(r.rows[0] ?? { run_id, action: actionVal });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/job_runs/:id/retry — requeue a failed job_run (new attempt, status queued) */
app.post("/v1/job_runs/:id/retry", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const jobRunId = req.params.id;
    const jr = await pool.query(
      "SELECT id, run_id, plan_node_id, attempt FROM job_runs WHERE id = $1",
      [jobRunId]
    );
    if (jr.rows.length === 0) return res.status(404).json({ error: "Job run not found" });
    const row = jr.rows[0];
    const newAttempt = (row.attempt ?? 1) + 1;
    const newJobRunId = uuid();
    await pool.query(
      `INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key)
       VALUES ($1, $2, $3, $4, 'queued', $5)`,
      [newJobRunId, row.run_id, row.plan_node_id, newAttempt, `retry:${jobRunId}:${newAttempt}`]
    );
    res.status(201).json({ id: newJobRunId, run_id: row.run_id, attempt: newAttempt });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/plans — list with pagination (optional initiative_id filter) */
app.get("/v1/plans", async (req, res) => {
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
});

/** GET /v1/plans/:id — plan with nodes and edges (for DAG) */
app.get("/v1/plans/:id", async (req, res) => {
  try {
    const planId = req.params.id;
    const [plan, nodes, edges] = await Promise.all([
      pool.query("SELECT p.*, i.title AS initiative_title, i.intent_type FROM plans p JOIN initiatives i ON i.id = p.initiative_id WHERE p.id = $1", [planId]).then(r => r.rows[0]),
      pool.query("SELECT * FROM plan_nodes WHERE plan_id = $1 ORDER BY node_key", [planId]).then(r => r.rows),
      pool.query("SELECT * FROM plan_edges WHERE plan_id = $1", [planId]).then(r => r.rows),
    ]);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json({ plan, nodes, edges });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/job_runs — list with filters and pagination */
app.get("/v1/job_runs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const environment = req.query.environment as string | undefined;
    const status = req.query.status as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (environment) { conditions.push(`r.environment = $${i++}`); params.push(environment); }
    if (status) { conditions.push(`jr.status = $${i++}`); params.push(status); }
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
});

/** GET /v1/releases — list with optional status filter */
app.get("/v1/releases", async (req, res) => {
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
});

/** GET /v1/releases/:id */
app.get("/v1/releases/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM releases WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/tool_calls — list with pagination and filters (run_id = tool_calls for that run via job_runs) */
app.get("/v1/tool_calls", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const run_id = req.query.run_id as string | undefined;
    const job_run_id = req.query.job_run_id as string | undefined;
    const status = req.query.status as string | undefined;
    const adapter_id = req.query.adapter_id as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (run_id) { conditions.push(`tc.job_run_id IN (SELECT id FROM job_runs WHERE run_id = $${i++})`); params.push(run_id); }
    if (job_run_id) { conditions.push(`tc.job_run_id = $${i++}`); params.push(job_run_id); }
    if (status) { conditions.push(`tc.status = $${i++}`); params.push(status); }
    if (adapter_id) { conditions.push(`tc.adapter_id = $${i++}`); params.push(adapter_id); }
    params.push(limit, offset);
    const from = run_id ? "tool_calls tc" : "tool_calls";
    const prefix = run_id ? "tc." : "";
    const q = `SELECT ${prefix}* FROM ${from} ${run_id ? "" : "tc "}WHERE ${conditions.join(" AND ").replace(/tc\.job_run_id/g, run_id ? "tc.job_run_id" : "job_run_id").replace(/tc\.status/g, run_id ? "tc.status" : "status").replace(/tc\.adapter_id/g, run_id ? "tc.adapter_id" : "adapter_id")} ORDER BY ${prefix}started_at DESC NULLS LAST LIMIT $${i} OFFSET $${i + 1}`;
    const filterCount = [run_id, job_run_id, status, adapter_id].filter(Boolean).length;
    const limitParamNum = filterCount + 1;
    const offsetParamNum = filterCount + 2;
    const statusParamNum = job_run_id ? 3 : 2;
    const adapterParamNum = job_run_id ? (status ? 4 : 3) : (status ? 3 : 2);
    const safeQ = run_id
      ? "SELECT tc.* FROM tool_calls tc JOIN job_runs jr ON jr.id = tc.job_run_id WHERE jr.run_id = $1 "
          + (job_run_id ? "AND tc.job_run_id = $2 " : "")
          + (status ? "AND tc.status = $" + statusParamNum + " " : "")
          + (adapter_id ? "AND tc.adapter_id = $" + adapterParamNum + " " : "")
          + "ORDER BY tc.started_at DESC NULLS LAST LIMIT $" + limitParamNum + " OFFSET $" + offsetParamNum
      : "";
    const paramList: unknown[] = [run_id, job_run_id, status, adapter_id].filter(Boolean);
    paramList.push(limit, offset);
    const finalQ = run_id
      ? `SELECT tc.* FROM tool_calls tc JOIN job_runs jr ON jr.id = tc.job_run_id WHERE jr.run_id = $1 ORDER BY tc.started_at DESC NULLS LAST LIMIT $2 OFFSET $3`
      : `SELECT * FROM tool_calls WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC NULLS LAST LIMIT $${i} OFFSET $${i + 1}`;
    const finalParams = run_id ? [run_id, limit, offset] : params;
    const r = await pool.query(run_id ? finalQ : `SELECT * FROM tool_calls WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC NULLS LAST LIMIT $${i} OFFSET $${i + 1}`, finalParams);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/artifacts/:id — single artifact with optional download URL */
app.get("/v1/artifacts/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM artifacts WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Artifact not found" });
    const artifact = r.rows[0] as { uri?: string; [k: string]: unknown };
    if (artifact.uri?.startsWith("supabase-storage://")) {
      try {
        const { getArtifactSignedUrl } = await import("../../runners/src/artifact-storage.js");
        const downloadUrl = await getArtifactSignedUrl(artifact.uri);
        if (downloadUrl) (artifact as Record<string, unknown>).download_url = downloadUrl;
      } catch { /* storage not configured */ }
    }
    res.json(artifact);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/artifacts — list with pagination and filters */
app.get("/v1/artifacts", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const run_id = req.query.run_id as string | undefined;
    const artifact_class = req.query.artifact_class as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (run_id) { conditions.push(`run_id = $${i++}`); params.push(run_id); }
    if (artifact_class) { conditions.push(`artifact_class = $${i++}`); params.push(artifact_class); }
    params.push(limit, offset);
    const q = `SELECT * FROM artifacts WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/llm_calls — list with pagination, filters, and time range */
app.get("/v1/llm_calls", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const run_id = req.query.run_id as string | undefined;
    const job_run_id = req.query.job_run_id as string | undefined;
    const model_tier = req.query.model_tier as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const format = req.query.format as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (run_id) { conditions.push(`run_id = $${i++}`); params.push(run_id); }
    if (job_run_id) { conditions.push(`job_run_id = $${i++}`); params.push(job_run_id); }
    if (model_tier) { conditions.push(`model_tier = $${i++}`); params.push(model_tier); }
    if (from) { conditions.push(`created_at >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`created_at <= $${i++}`); params.push(to); }
    params.push(limit, offset);
    const q = `SELECT id, run_id, job_run_id, model_tier, model_id, tokens_in, tokens_out, latency_ms, created_at FROM llm_calls WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    if (format === "csv") {
      const header = "id,run_id,job_run_id,model_tier,model_id,tokens_in,tokens_out,latency_ms,created_at";
      const rows = r.rows.map((row: Record<string, unknown>) => `${row.id},${row.run_id},${row.job_run_id},${row.model_tier},${row.model_id},${row.tokens_in ?? ""},${row.tokens_out ?? ""},${row.latency_ms ?? ""},${row.created_at}`);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=llm_calls.csv");
      return res.send([header, ...rows].join("\n"));
    }
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/usage — aggregate LLM usage with percentiles and error rates */
app.get("/v1/usage", async (req, res) => {
  try {
    const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const [byTier, totals, percentiles] = await Promise.all([
      pool.query(`
        SELECT model_tier, count(*)::int AS calls,
               coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
               coalesce(sum(tokens_out), 0)::bigint AS tokens_out,
               coalesce(avg(latency_ms), 0)::int AS avg_latency_ms
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
        GROUP BY model_tier ORDER BY calls DESC
      `, [from, to]).then(r => r.rows),
      pool.query(`
        SELECT count(*)::int AS calls,
               coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
               coalesce(sum(tokens_out), 0)::bigint AS tokens_out
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
      `, [from, to]).then(r => r.rows[0] ?? { calls: 0, tokens_in: 0, tokens_out: 0 }),
      pool.query(`
        SELECT
          coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p50_latency_ms,
          coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p95_latency_ms
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2 AND latency_ms IS NOT NULL
      `, [from, to]).then(r => r.rows[0] ?? { p50_latency_ms: 0, p95_latency_ms: 0 }).catch(() => ({ p50_latency_ms: 0, p95_latency_ms: 0 })),
    ]);
    const errorCount = await pool.query(`
      SELECT count(*)::int AS c FROM job_runs
      WHERE status = 'failed' AND started_at BETWEEN $1 AND $2
    `, [from, to]).then(r => r.rows[0]?.c ?? 0).catch(() => 0);
    res.json({ by_tier: byTier, totals, percentiles, error_count: errorCount, from, to });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/policies — list with pagination */
app.get("/v1/policies", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query("SELECT version, created_at, rules_json FROM policies ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/adapters — list with pagination and filters */
app.get("/v1/adapters", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const name = req.query.name as string | undefined;
    let q = "SELECT * FROM adapters ORDER BY created_at DESC LIMIT $1 OFFSET $2";
    const params: unknown[] = [limit, offset];
    if (name) {
      q = "SELECT * FROM adapters WHERE name = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
      params.unshift(name);
    }
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/capability_grants — list with pagination and filters */
app.get("/v1/capability_grants", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const environment = req.query.environment as string | undefined;
    const adapter_id = req.query.adapter_id as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (environment) { conditions.push(`environment = $${i++}`); params.push(environment); }
    if (adapter_id) { conditions.push(`adapter_id = $${i++}`); params.push(adapter_id); }
    params.push(limit, offset);
    const q = `SELECT * FROM capability_grants WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/secret_refs — list refs only (no values), pagination and filters */
app.get("/v1/secret_refs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const scope = req.query.scope as string | undefined;
    let q = "SELECT id, name, vault_path, scope, capabilities_allowed, rotated_at FROM secret_refs ORDER BY name LIMIT $1 OFFSET $2";
    const params: unknown[] = [limit, offset];
    if (scope) {
      q = "SELECT id, name, vault_path, scope, capabilities_allowed, rotated_at FROM secret_refs WHERE scope = $1 ORDER BY name LIMIT $2 OFFSET $3";
      params.unshift(scope);
    }
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/audit — unified ledger (run_events + job_events) with pagination and filters */
app.get("/v1/audit", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const run_id = req.query.run_id as string | undefined;
    const job_run_id = req.query.job_run_id as string | undefined;
    let items: unknown[];
    if (run_id) {
      const [re, je] = await Promise.all([
        pool.query("SELECT 'run_event' AS source, id::text, run_id, NULL::uuid AS job_run_id, event_type::text, created_at, NULL::jsonb AS payload_json FROM run_events WHERE run_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [run_id, limit, offset]),
        pool.query("SELECT 'job_event' AS source, je.id::text, jr.run_id, je.job_run_id, je.event_type::text, je.created_at, je.payload_json FROM job_events je JOIN job_runs jr ON jr.id = je.job_run_id WHERE jr.run_id = $1 ORDER BY je.created_at DESC LIMIT $2 OFFSET $3", [run_id, limit, offset]),
      ]);
      items = [...re.rows, ...je.rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
    } else if (job_run_id) {
      const r = await pool.query(
        "SELECT 'job_event' AS source, id::text, (SELECT run_id FROM job_runs WHERE id = $1) AS run_id, job_run_id, event_type::text, created_at, payload_json FROM job_events WHERE job_run_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [job_run_id, limit, offset]
      );
      items = r.rows;
    } else {
      const r = await pool.query(
        `(SELECT 'run_event' AS source, id::text, run_id, NULL::uuid AS job_run_id, event_type::text, created_at, NULL::jsonb AS payload_json FROM run_events)
         UNION ALL (SELECT 'job_event', je.id::text, jr.run_id, je.job_run_id, je.event_type::text, je.created_at, je.payload_json FROM job_events je JOIN job_runs jr ON jr.id = je.job_run_id)
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      items = r.rows;
    }
    res.json({ items, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/incidents — cluster by error_signature (from failed job_runs) */
app.get("/v1/incidents", async (req, res) => {
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
});

/** GET /v1/incidents/:signature — sample runs for this error signature */
app.get("/v1/incidents/:signature", async (req, res) => {
  try {
    const signature = decodeURIComponent(req.params.signature);
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
});

/** GET /v1/validations — list by run_id or job_run_id (for Run detail Validations tab) */
app.get("/v1/validations", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const run_id = req.query.run_id as string | undefined;
    const job_run_id = req.query.job_run_id as string | undefined;
    let q = "SELECT * FROM validations WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (run_id) { q += ` AND run_id = $${i++}`; params.push(run_id); }
    if (job_run_id) { q += ` AND job_run_id = $${i++}`; params.push(job_run_id); }
    q += ` ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(limit, offset);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/approvals — list with pagination and filters */
app.get("/v1/approvals", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const run_id = req.query.run_id as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (run_id) { conditions.push(`run_id = $${i++}`); params.push(run_id); }
    params.push(limit, offset);
    const q = `SELECT * FROM approvals WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/health — workers and active leases (detailed) */
app.get("/v1/health", async (_req, res) => {
  try {
    const [workers, activeLeases, staleLeases] = await Promise.all([
      pool.query(`SELECT worker_id, last_heartbeat_at, runner_version FROM worker_registry ORDER BY last_heartbeat_at DESC`).then(r => r.rows),
      pool.query(`
        SELECT jc.job_run_id, jc.worker_id, jc.claimed_at, jc.lease_expires_at, jc.heartbeat_at
        FROM job_claims jc WHERE jc.released_at IS NULL ORDER BY jc.heartbeat_at DESC
      `).then(r => r.rows),
      pool.query(`
        SELECT count(*)::int AS c FROM job_claims WHERE released_at IS NULL AND heartbeat_at < now() - interval '2 minutes'
      `).then(r => r.rows[0]?.c ?? 0),
    ]);
    res.json({ workers, active_leases: activeLeases, stale_leases_count: staleLeases });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/webhooks/github — create initiative from GitHub events; self-healing on fix-me label */
app.post("/v1/webhooks/github", async (req, res) => {
  try {
    const payload = req.body as {
      action?: string;
      issue?: { html_url?: string; number?: number; title?: string; body?: string; labels?: { name: string }[] };
      pull_request?: { html_url?: string; number?: number; title?: string };
      label?: { name: string };
      repository?: { full_name?: string };
    };
    const event = req.headers["x-github-event"] as string | undefined;
    if (event === "ping") return res.status(200).json({ ok: true });

    const repo = payload.repository?.full_name ?? "unknown";
    const issue = payload.issue;
    const pr = payload.pull_request;

    // Phase 6: fix-me label triggers self-healing run
    if (payload.action === "labeled" && payload.label?.name === "fix-me" && (issue || pr)) {
      const selfHealEnabled = process.env.ENABLE_SELF_HEAL === "true";
      if (!selfHealEnabled) {
        return res.json({ received: true, self_heal: "disabled", message: "Set ENABLE_SELF_HEAL=true to enable self-healing" });
      }
      const sourceUrl = issue?.html_url ?? pr?.html_url;
      const title = `Self-heal: ${issue?.title ?? pr?.title ?? "fix-me"}`;
      let ir: { rows: { id: string }[] };
      try {
        ir = await pool.query(
          `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state, template_id)
           VALUES ('issue_fix', $1, 'med', $2, 'draft', 'issue_fix') RETURNING id`,
          [title, sourceUrl]
        );
      } catch {
        ir = await pool.query(
          `INSERT INTO initiatives (intent_type, title, risk_level) VALUES ('issue_fix', $1, 'med') RETURNING id`,
          [title]
        );
      }
      const initId = ir.rows[0]?.id;
      if (initId) {
        try {
          const { compilePlan } = await import("./plan-compiler.js");
          await compilePlan(pool, initId, { force: true });
        } catch { /* plan compilation is best-effort on webhook */ }
      }
      return res.status(201).json({ initiative_id: initId, self_heal: true, repo, source_ref: sourceUrl });
    }

    // Standard: create initiative from issue/PR events
    if (!issue?.html_url) return res.status(200).json({ received: true });
    const intent_type = issue.labels?.some((l: { name: string }) => l.name === "bug") ? "issue_fix" : "software";
    const title = issue.title ?? `Issue #${issue.number}`;
    let r: { rows: { id: string }[] };
    try {
      r = await pool.query(
        `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state)
         VALUES ($1, $2, 'low', $3, 'draft') RETURNING id`,
        [intent_type, title, issue.html_url]
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "42703") {
        r = await pool.query(
          `INSERT INTO initiatives (intent_type, title, risk_level) VALUES ($1, $2, 'low') RETURNING id`,
          [intent_type, title]
        );
      } else throw e;
    }
    const initiativeId = r.rows[0]?.id;
    if (!initiativeId) return res.status(500).json({ error: "Failed to create initiative" });
    res.status(201).json({ initiative_id: initiativeId, repo, source_ref: issue.html_url });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/initiatives/:id/replan — alias for POST .../plan with force=true */
app.post("/v1/initiatives/:id/replan", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const initiativeId = req.params.id;
    const { compilePlan } = await import("./plan-compiler.js");
    const compiled = await compilePlan(pool, initiativeId, { force: true });
    res.status(201).json({ id: compiled.planId, initiative_id: initiativeId, status: "draft", nodes: compiled.nodeIds.size, plan_hash: compiled.planHash });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Initiative not found") return res.status(404).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

// =====================================================================
// Phase 3+5: Enhanced telemetry with time range, group-by, export
// =====================================================================

/** GET /v1/usage/by_job_type — cost/token breakdown by job_type */
app.get("/v1/usage/by_job_type", async (req, res) => {
  try {
    const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const r = await pool.query(`
      SELECT pn.job_type,
             count(*)::int AS calls,
             coalesce(sum(lc.tokens_in), 0)::bigint AS tokens_in,
             coalesce(sum(lc.tokens_out), 0)::bigint AS tokens_out,
             coalesce(avg(lc.latency_ms), 0)::int AS avg_latency_ms
      FROM llm_calls lc
      JOIN job_runs jr ON jr.id = lc.job_run_id
      JOIN plan_nodes pn ON pn.id = jr.plan_node_id
      WHERE lc.created_at BETWEEN $1 AND $2
      GROUP BY pn.job_type ORDER BY calls DESC
    `, [from, to]);
    res.json({ items: r.rows, from, to });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/usage/by_model — breakdown by model_id */
app.get("/v1/usage/by_model", async (req, res) => {
  try {
    const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const r = await pool.query(`
      SELECT model_id, model_tier,
             count(*)::int AS calls,
             coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
             coalesce(sum(tokens_out), 0)::bigint AS tokens_out,
             coalesce(avg(latency_ms), 0)::int AS avg_latency_ms,
             count(*) FILTER (WHERE latency_ms > 5000)::int AS slow_calls
      FROM llm_calls WHERE created_at BETWEEN $1 AND $2
      GROUP BY model_id, model_tier ORDER BY calls DESC
    `, [from, to]);
    res.json({ items: r.rows, from, to });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/job_runs/:id/llm_calls — per-node LLM usage for run replay */
app.get("/v1/job_runs/:id/llm_calls", async (req, res) => {
  try {
    const jobRunId = req.params.id;
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
});

// =====================================================================
// Phase 7: agent_memory CRUD
// =====================================================================

/** GET /v1/agent_memory — list with filters */
app.get("/v1/agent_memory", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const initiative_id = req.query.initiative_id as string | undefined;
    const run_id = req.query.run_id as string | undefined;
    const scope = req.query.scope as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (initiative_id) { conditions.push(`initiative_id = $${i++}`); params.push(initiative_id); }
    if (run_id) { conditions.push(`run_id = $${i++}`); params.push(run_id); }
    if (scope) { conditions.push(`scope = $${i++}`); params.push(scope); }
    params.push(limit, offset);
    const q = `SELECT * FROM agent_memory WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/agent_memory/:id */
app.get("/v1/agent_memory/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM agent_memory WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/agent_memory — create (admin/testing) */
app.post("/v1/agent_memory", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as { initiative_id?: string; run_id?: string; scope: string; key: string; value: string };
    if (!body.scope || !body.key) return res.status(400).json({ error: "scope and key required" });
    const r = await pool.query(
      `INSERT INTO agent_memory (initiative_id, run_id, scope, key, value)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.initiative_id ?? null, body.run_id ?? null, body.scope, body.key, body.value ?? ""]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PATCH /v1/agent_memory/:id — update value */
app.patch("/v1/agent_memory/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as { value?: string; scope?: string; key?: string };
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.value !== undefined) { sets.push(`value = $${i++}`); params.push(body.value); }
    if (body.scope !== undefined) { sets.push(`scope = $${i++}`); params.push(body.scope); }
    if (body.key !== undefined) { sets.push(`key = $${i++}`); params.push(body.key); }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE agent_memory SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

// =====================================================================
// Phase 5 MCP: mcp_server_config CRUD
// =====================================================================

/** GET /v1/mcp_servers — list MCP server configs */
app.get("/v1/mcp_servers", async (req, res) => {
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
});

/** GET /v1/mcp_servers/:id */
app.get("/v1/mcp_servers/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM mcp_server_config WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/mcp_servers — create */
app.post("/v1/mcp_servers", async (req, res) => {
  try {
    const role = getRole(req);
    if (role !== "admin" && role !== "operator") return res.status(403).json({ error: "Admin or Operator required" });
    const body = req.body as { name: string; server_type: string; url_or_cmd: string; args_json?: unknown; env_json?: unknown; auth_header?: string; capabilities?: string[] };
    if (!body.name || !body.server_type || !body.url_or_cmd) return res.status(400).json({ error: "name, server_type, url_or_cmd required" });
    const r = await pool.query(
      `INSERT INTO mcp_server_config (name, server_type, url_or_cmd, args_json, env_json, auth_header, capabilities)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [body.name, body.server_type, body.url_or_cmd, body.args_json ? JSON.stringify(body.args_json) : null, body.env_json ? JSON.stringify(body.env_json) : null, body.auth_header ?? null, body.capabilities ?? null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PATCH /v1/mcp_servers/:id — update */
app.patch("/v1/mcp_servers/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role !== "admin" && role !== "operator") return res.status(403).json({ error: "Admin or Operator required" });
    const body = req.body as Record<string, unknown>;
    const allowedFields = ["name", "server_type", "url_or_cmd", "args_json", "env_json", "auth_header", "capabilities", "active"];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        const val = (field === "args_json" || field === "env_json") ? JSON.stringify(body[field]) : body[field];
        sets.push(`${field} = $${i++}`);
        params.push(val);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push(`updated_at = now()`);
    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE mcp_server_config SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/mcp_servers/:id */
app.delete("/v1/mcp_servers/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role !== "admin") return res.status(403).json({ error: "Admin required" });
    const r = await pool.query("DELETE FROM mcp_server_config WHERE id = $1 RETURNING id", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/mcp_servers/:id/test — ping / test connection */
app.post("/v1/mcp_servers/:id/test", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM mcp_server_config WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const server = r.rows[0] as { server_type: string; url_or_cmd: string; auth_header?: string };
    if (server.server_type === "http") {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const result = await fetch(server.url_or_cmd, { method: "GET", signal: controller.signal }).then(r => ({ ok: r.ok, status: r.status })).catch(e => ({ ok: false, status: 0, error: String(e) }));
        clearTimeout(timeout);
        res.json({ reachable: result.ok || result.status > 0, status: result.status });
      } catch (e) {
        res.json({ reachable: false, error: String((e as Error).message) });
      }
    } else {
      res.json({ server_type: "stdio", message: "Stdio servers cannot be tested remotely; they are spawned by the Runner." });
    }
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

// =====================================================================
// Phase 5: routing_policies CRUD
// =====================================================================

/** GET /v1/routing_policies */
app.get("/v1/routing_policies", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query("SELECT * FROM routing_policies WHERE active = true ORDER BY job_type LIMIT $1 OFFSET $2", [limit, offset]);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/routing_policies — create or update (upsert by job_type) */
app.post("/v1/routing_policies", async (req, res) => {
  try {
    const role = getRole(req);
    if (role !== "admin" && role !== "operator") return res.status(403).json({ error: "Admin or Operator required" });
    const body = req.body as { job_type: string; model_tier?: string; config_json?: unknown };
    if (!body.job_type) return res.status(400).json({ error: "job_type required" });
    const r = await pool.query(
      `INSERT INTO routing_policies (job_type, model_tier, config_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_type) DO UPDATE SET model_tier = $2, config_json = $3, updated_at = now()
       RETURNING *`,
      [body.job_type, body.model_tier ?? "auto/chat", body.config_json ? JSON.stringify(body.config_json) : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/llm_budgets */
app.get("/v1/llm_budgets", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query("SELECT * FROM llm_budgets WHERE active = true ORDER BY scope_type, scope_value LIMIT $1 OFFSET $2", [limit, offset]);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/llm_budgets — create or update (upsert by scope) */
app.post("/v1/llm_budgets", async (req, res) => {
  try {
    const role = getRole(req);
    if (role !== "admin" && role !== "operator") return res.status(403).json({ error: "Admin or Operator required" });
    const body = req.body as { scope_type: string; scope_value: string; budget_tokens?: number; budget_dollars?: number; period?: string };
    if (!body.scope_type || !body.scope_value) return res.status(400).json({ error: "scope_type and scope_value required" });
    const r = await pool.query(
      `INSERT INTO llm_budgets (scope_type, scope_value, budget_tokens, budget_dollars, period)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scope_type, scope_value) DO UPDATE SET budget_tokens = $3, budget_dollars = $4, period = $5, updated_at = now()
       RETURNING *`,
      [body.scope_type, body.scope_value, body.budget_tokens ?? null, body.budget_dollars ?? null, body.period ?? "monthly"]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

// =====================================================================
// Brand Profiles CRUD
// =====================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(s: string): boolean {
  return UUID_REGEX.test(s);
}

/** GET /v1/brand_profiles — list with filters and pagination */
app.get("/v1/brand_profiles", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (status) { conditions.push(`status = $${i++}`); params.push(status); }
    if (search) { conditions.push(`(name ILIKE $${i} OR slug ILIKE $${i})`); params.push(`%${search}%`); i++; }
    params.push(limit, offset);
    const q = `SELECT * FROM brand_profiles WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(q, params),
      pool.query(`SELECT count(*)::int AS total FROM brand_profiles WHERE ${conditions.join(" AND ")}`, params.slice(0, -2)),
    ]);
    res.json({ items: itemsResult.rows, total: totalResult.rows[0]?.total ?? 0 });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/brand_profiles/:id */
app.get("/v1/brand_profiles/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query("SELECT * FROM brand_profiles WHERE id = $1", [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const profile = r.rows[0] as { brand_theme_id?: string; [k: string]: unknown };
    if (profile.brand_theme_id) {
      const themeR = await pool.query("SELECT token_overrides FROM brand_themes WHERE id = $1", [profile.brand_theme_id]);
      if (themeR.rows.length > 0 && themeR.rows[0].token_overrides) {
        (profile as Record<string, unknown>).token_overrides = themeR.rows[0].token_overrides;
      }
    }
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/brand_profiles */
app.post("/v1/brand_profiles", async (req, res) => {
  try {
    const body = req.body as {
      name: string; identity?: unknown; tone?: unknown; visual_style?: unknown; copy_style?: unknown;
      design_tokens?: unknown; deck_theme?: unknown; report_theme?: unknown;
    };
    if (!body.name) return res.status(400).json({ error: "name required" });
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const r = await pool.query(
      `INSERT INTO brand_profiles (name, slug, identity, tone, visual_style, copy_style, design_tokens, deck_theme, report_theme)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb) RETURNING *`,
      [
        body.name, slug,
        body.identity ? JSON.stringify(body.identity) : null,
        body.tone ? JSON.stringify(body.tone) : null,
        body.visual_style ? JSON.stringify(body.visual_style) : null,
        body.copy_style ? JSON.stringify(body.copy_style) : null,
        body.design_tokens ? JSON.stringify(body.design_tokens) : null,
        body.deck_theme ? JSON.stringify(body.deck_theme) : null,
        body.report_theme ? JSON.stringify(body.report_theme) : null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PUT /v1/brand_profiles/:id */
app.put("/v1/brand_profiles/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const body = req.body as Record<string, unknown>;
    const jsonbFields = ["identity", "tone", "visual_style", "copy_style", "design_tokens", "deck_theme", "report_theme"];
    const scalarFields = ["name", "slug", "brand_theme_id", "status"];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of scalarFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${i++}`);
        params.push(body[field]);
      }
    }
    for (const field of jsonbFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = coalesce(bp.${field}, '{}') || $${i++}::jsonb`);
        params.push(JSON.stringify(body[field]));
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = now()");
    params.push(id);
    const r = await pool.query(
      `UPDATE brand_profiles bp SET ${sets.join(", ")} WHERE bp.id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/brand_profiles/:id — soft delete */
app.delete("/v1/brand_profiles/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query(
      "UPDATE brand_profiles SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id, status",
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/brand_profiles/:id/embeddings */
app.get("/v1/brand_profiles/:id/embeddings", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const embedding_type = req.query.embedding_type as string | undefined;
    const conditions: string[] = ["brand_profile_id = $1"];
    const params: unknown[] = [id];
    let i = 2;
    if (embedding_type) { conditions.push(`embedding_type = $${i++}`); params.push(embedding_type); }
    params.push(limit, offset);
    const q = `SELECT * FROM brand_embeddings WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const countQ = `SELECT count(*)::int AS total FROM brand_embeddings WHERE ${conditions.join(" AND ")}`;
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(q, params),
      pool.query(countQ, params.slice(0, -2)),
    ]);
    res.json({ items: itemsResult.rows, total: totalResult.rows[0]?.total ?? 0 });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/brand_profiles/:id/embeddings */
app.post("/v1/brand_profiles/:id/embeddings", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const body = req.body as { content: string; embedding_type: string; metadata?: unknown };
    if (!body.content || !body.embedding_type) return res.status(400).json({ error: "content and embedding_type required" });
    const eid = uuid();
    await pool.query(
      `INSERT INTO brand_embeddings (id, brand_profile_id, content, embedding_type, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5::jsonb, NULL)`,
      [eid, id, body.content, body.embedding_type, body.metadata ? JSON.stringify(body.metadata) : null]
    );
    const r = await pool.query("SELECT * FROM brand_embeddings WHERE id = $1", [eid]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/brand_profiles/:id/embeddings/search — TODO: requires pre-computed embedding for vector search */
app.post("/v1/brand_profiles/:id/embeddings/search", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    // TODO: Implement vector similarity search once embeddings are pre-computed by a separate service.
    res.json({ results: [] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/brand_profiles/:id/embeddings/:eid */
app.delete("/v1/brand_profiles/:id/embeddings/:eid", async (req, res) => {
  try {
    const id = req.params.id;
    const eid = req.params.eid;
    if (!isValidUuid(id) || !isValidUuid(eid)) return res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query(
      "DELETE FROM brand_embeddings WHERE id = $1 AND brand_profile_id = $2 RETURNING id",
      [eid, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.status(200).json({ deleted: true, id: eid });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/brand_profiles/:id/assets */
app.get("/v1/brand_profiles/:id/assets", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const asset_type = req.query.asset_type as string | undefined;
    let q = "SELECT * FROM brand_assets WHERE brand_profile_id = $1";
    const params: unknown[] = [id];
    if (asset_type) { q += " AND asset_type = $2"; params.push(asset_type); }
    q += " ORDER BY created_at";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/brand_profiles/:id/assets */
app.post("/v1/brand_profiles/:id/assets", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const body = req.body as { asset_type: string; uri: string; filename?: string; mime_type?: string; metadata?: unknown };
    if (!body.asset_type || !body.uri) return res.status(400).json({ error: "asset_type and uri required" });
    const aid = uuid();
    await pool.query(
      `INSERT INTO brand_assets (id, brand_profile_id, asset_type, uri, filename, mime_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [aid, id, body.asset_type, body.uri, body.filename ?? null, body.mime_type ?? null, body.metadata ? JSON.stringify(body.metadata) : null]
    );
    const r = await pool.query("SELECT * FROM brand_assets WHERE id = $1", [aid]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/brand_profiles/:id/assets/:aid */
app.delete("/v1/brand_profiles/:id/assets/:aid", async (req, res) => {
  try {
    const id = req.params.id;
    const aid = req.params.aid;
    if (!isValidUuid(id) || !isValidUuid(aid)) return res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query(
      "DELETE FROM brand_assets WHERE id = $1 AND brand_profile_id = $2 RETURNING id",
      [aid, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.status(200).json({ deleted: true, id: aid });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

// =====================================================================
// Document Templates CRUD
// =====================================================================

/** GET /v1/document_templates */
app.get("/v1/document_templates", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    const template_type = req.query.template_type as string | undefined;
    const status = req.query.status as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (brand_profile_id) { conditions.push(`brand_profile_id = $${i++}`); params.push(brand_profile_id); }
    if (template_type) { conditions.push(`template_type = $${i++}`); params.push(template_type); }
    if (status) { conditions.push(`status = $${i++}`); params.push(status); }
    params.push(limit, offset);
    const q = `SELECT * FROM document_templates WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const countQ = `SELECT count(*)::int AS total FROM document_templates WHERE ${conditions.join(" AND ")}`;
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(q, params),
      pool.query(countQ, params.slice(0, -2)),
    ]);
    res.json({ items: itemsResult.rows, total: totalResult.rows[0]?.total ?? 0 });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/document_templates/:id */
app.get("/v1/document_templates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const r = await pool.query("SELECT * FROM document_templates WHERE id = $1", [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const template = r.rows[0];
    const comps = await pool.query(
      "SELECT * FROM document_components WHERE template_id = $1 ORDER BY position",
      [id]
    );
    (template as Record<string, unknown>).components = comps.rows;
    res.json(template);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/document_templates */
app.post("/v1/document_templates", async (req, res) => {
  try {
    const body = req.body as {
      brand_profile_id?: string; template_type?: string; name?: string; description?: string;
      template_config?: unknown; component_sequence?: unknown; status?: string;
    };
    const r = await pool.query(
      `INSERT INTO document_templates (brand_profile_id, template_type, name, description, template_config, component_sequence, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) RETURNING *`,
      [
        body.brand_profile_id ?? null, body.template_type ?? null, body.name ?? null, body.description ?? null,
        body.template_config ? JSON.stringify(body.template_config) : null,
        body.component_sequence ? JSON.stringify(body.component_sequence) : null,
        body.status ?? "draft",
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PUT /v1/document_templates/:id */
app.put("/v1/document_templates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body as Record<string, unknown>;
    const allowed = ["brand_profile_id", "template_type", "name", "description", "template_config", "component_sequence", "status"];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowed) {
      if (body[field] !== undefined) {
        const val = (field === "template_config" || field === "component_sequence") ? JSON.stringify(body[field]) : body[field];
        sets.push(`${field} = $${i++}`);
        params.push(val);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = now()");
    params.push(id);
    const r = await pool.query(
      `UPDATE document_templates SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/document_templates/:id — soft delete */
app.delete("/v1/document_templates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const r = await pool.query(
      "UPDATE document_templates SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id, status",
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/document_templates/:id/components */
app.post("/v1/document_templates/:id/components", async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body as { component_type: string; config?: unknown; position?: number };
    if (!body.component_type) return res.status(400).json({ error: "component_type required" });
    const cid = uuid();
    await pool.query(
      `INSERT INTO document_components (id, template_id, component_type, config, position)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [cid, id, body.component_type, body.config ? JSON.stringify(body.config) : "{}", body.position ?? 0]
    );
    const r = await pool.query("SELECT * FROM document_components WHERE id = $1", [cid]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PUT /v1/document_templates/:id/components/:cid */
app.put("/v1/document_templates/:id/components/:cid", async (req, res) => {
  try {
    const id = req.params.id;
    const cid = req.params.cid;
    const body = req.body as { config?: unknown; position?: number };
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.config !== undefined) { sets.push(`config = $${i++}::jsonb`); params.push(JSON.stringify(body.config)); }
    if (body.position !== undefined) { sets.push(`position = $${i++}`); params.push(body.position); }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    params.push(cid, id);
    const r = await pool.query(
      `UPDATE document_components SET ${sets.join(", ")} WHERE id = $${i} AND template_id = $${i + 1} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/document_templates/:id/components/:cid */
app.delete("/v1/document_templates/:id/components/:cid", async (req, res) => {
  try {
    const id = req.params.id;
    const cid = req.params.cid;
    const r = await pool.query(
      "DELETE FROM document_components WHERE id = $1 AND template_id = $2 RETURNING id",
      [cid, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.status(200).json({ deleted: true, id: cid });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

export function startApi(port: number = Number(process.env.PORT) || 3001): void {
  app.listen(port, () => console.log(`[api] Listening on port ${port}`));
}
