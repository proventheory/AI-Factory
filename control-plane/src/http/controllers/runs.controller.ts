import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { pool, withTransaction } from "../../db.js";
import { createRun } from "../../scheduler.js";
import { routeRun, executeRollback } from "../../release-manager.js";
import type { Environment } from "../../types.js";
import { triggerNoArtifactsRemediationForRun, triggerBadArtifactsRemediationForRun } from "../../no-artifacts-self-heal.js";
import type { Contract } from "../../template-image-validators.js";
import { requireRole } from "../security/rbac.js";
import { handleDbMissingTable } from "../middleware/error-handler.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";
import { isTemplateImageContractsMissing } from "../lib/template-lint-gate.js";
import { intentTypeFilterValues } from "../../lib/intent-type.js";

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const environment = req.query.environment as string | undefined;
    const status = req.query.status as string | undefined;
    const cohort = req.query.cohort as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (environment) {
      conditions.push(`r.environment = $${i++}`);
      params.push(environment);
    }
    if (status) {
      conditions.push(`r.status::text = $${i++}`);
      params.push(status);
    }
    if (cohort) {
      conditions.push(`r.cohort = $${i++}`);
      params.push(cohort);
    }
    const intent_type = req.query.intent_type as string | undefined;
    if (intent_type) {
      const vals = intentTypeFilterValues(intent_type);
      if (vals.length === 1) {
        conditions.push(`i.intent_type = $${i++}`);
        params.push(vals[0]);
      } else {
        conditions.push(`i.intent_type IN ($${i++}, $${i++})`);
        params.push(vals[0], vals[1]);
      }
    }
    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;
    const q = `
      WITH fail AS (
        SELECT run_id, max(error_signature) FILTER (WHERE status = 'failed') AS top_error_signature,
               count(*) FILTER (WHERE status = 'failed')::int AS failures_count
        FROM job_runs GROUP BY run_id
      )
      SELECT r.*, f.top_error_signature, f.failures_count, i.intent_type, i.title AS initiative_title, i.id AS initiative_id
      FROM runs r
      LEFT JOIN fail f ON f.run_id = r.id
      LEFT JOIN plans p ON p.id = r.plan_id
      LEFT JOIN initiatives i ON i.id = p.initiative_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY r.routed_at DESC NULLS LAST, r.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    if (handleDbMissingTable(e, res)) return;
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.id ?? "");
    const [run, planRow, planNodes, planEdges, nodeProgress, jobRuns, runArtifacts, runEvents, releaseRow, jobEvents] = await Promise.all([
      pool.query("SELECT * FROM runs WHERE id = $1", [runId]).then((r) => r.rows[0]),
      pool.query("SELECT p.initiative_id FROM plans p JOIN runs r ON r.plan_id = p.id WHERE r.id = $1", [runId]).then((r) => r.rows[0] ?? null),
      pool.query("SELECT pn.* FROM plans p JOIN plan_nodes pn ON pn.plan_id = p.id WHERE p.id = (SELECT plan_id FROM runs WHERE id = $1)", [runId]).then((r) => r.rows),
      pool.query("SELECT pe.* FROM plans p JOIN plan_edges pe ON pe.plan_id = p.id WHERE p.id = (SELECT plan_id FROM runs WHERE id = $1)", [runId]).then((r) => r.rows),
      pool.query("SELECT * FROM node_progress WHERE run_id = $1", [runId]).then((r) => r.rows),
      pool.query("SELECT jr.* FROM job_runs jr WHERE jr.run_id = $1 ORDER BY plan_node_id, attempt DESC", [runId]).then((r) => r.rows),
      pool.query("SELECT * FROM artifacts WHERE run_id = $1 ORDER BY created_at", [runId]).then((r) => r.rows),
      pool.query("SELECT * FROM run_events WHERE run_id = $1 ORDER BY created_at", [runId]).then((r) => r.rows),
      pool.query("SELECT rel.runner_image_digest, rel.workplane_bundle_version, rel.policy_version AS release_policy_version FROM runs r JOIN releases rel ON rel.id = r.release_id WHERE r.id = $1", [runId]).then((r) => r.rows[0] ?? null),
      pool.query("SELECT je.* FROM job_events je JOIN job_runs jr ON jr.id = je.job_run_id WHERE jr.run_id = $1 ORDER BY je.created_at DESC LIMIT 120", [runId]).then((r) => r.rows),
    ]);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    const initiative_id = (planRow as { initiative_id?: string } | null)?.initiative_id ?? null;
    const pinned_context = releaseRow
      ? {
          runner_image_digest: (releaseRow as { runner_image_digest?: string }).runner_image_digest ?? null,
          workplane_bundle_version: (releaseRow as { workplane_bundle_version?: string }).workplane_bundle_version ?? null,
          release_policy_version: (releaseRow as { release_policy_version?: string }).release_policy_version ?? null,
        }
      : null;
    res.json({
      run: { ...run, initiative_id },
      initiative_id,
      pinned_context,
      plan_nodes: planNodes,
      plan_edges: planEdges,
      node_progress: nodeProgress,
      job_runs: jobRuns,
      artifacts: runArtifacts,
      run_events: runEvents,
      job_events: jobEvents,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getArtifacts(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.id ?? "");
    const exists = await pool.query("SELECT id FROM runs WHERE id = $1", [runId]);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    const r = await pool.query("SELECT * FROM artifacts WHERE run_id = $1 ORDER BY created_at", [runId]);
    if (r.rows.length === 0) setImmediate(() => triggerNoArtifactsRemediationForRun(runId));
    else setImmediate(() => triggerBadArtifactsRemediationForRun(runId));
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT id, status FROM runs WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json({ id: r.rows[0].id, status: r.rows[0].status });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getLogEntries(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.id ?? "");
    const exists = await pool.query("SELECT id FROM runs WHERE id = $1", [runId]);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(0, parseInt(String(req.query.offset || 0), 10) || 0);
    const source = typeof req.query.source === "string" && req.query.source.trim() ? req.query.source.trim() : null;
    const order = String(req.query.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM run_log_entries WHERE run_id = $1" + (source ? " AND source = $2" : ""),
      source ? [runId, source] : [runId]
    );
    const total = (countResult.rows[0] as { total: number }).total;
    const q = source
      ? "SELECT id, run_id, job_run_id, source, level, message, logged_at FROM run_log_entries WHERE run_id = $1 AND source = $2 ORDER BY logged_at " + order + " LIMIT $3 OFFSET $4"
      : "SELECT id, run_id, job_run_id, source, level, message, logged_at FROM run_log_entries WHERE run_id = $1 ORDER BY logged_at " + order + " LIMIT $2 OFFSET $3";
    const params = source ? [runId, source, limit, offset] : [runId, limit, offset];
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset, total });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42P01" || (typeof err.message === "string" && err.message.includes("run_log_entries"))) {
      res.status(503).json({
        error: "run_log_entries table not present. Run migration 20250312000000_run_log_entries.sql to enable log mirror.",
      });
      return;
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
}

export async function ingestLogs(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.id ?? "");
    const runRow = await pool.query("SELECT id, created_at, updated_at FROM runs WHERE id = $1", [runId]);
    if (runRow.rows.length === 0) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    const { ingestRunLogsOneOff } = await import("../../render-log-ingest.js");
    const result = await ingestRunLogsOneOff(runId, runRow.rows[0] as { created_at: Date; updated_at: Date });
    res.status(200).json({ ok: true, ingested: result.ingested, message: result.message });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42P01" || (typeof err.message === "string" && err.message.includes("run_log_entries"))) {
      res.status(503).json({
        error: "run_log_entries table not present. Run migration 20250312000000_run_log_entries.sql to enable log mirror.",
      });
      return;
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
}

export async function imageAssignment(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.id ?? "");
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Body must be ImageAssignment JSON object" });
      return;
    }
    const r = await pool.query("UPDATE runs SET image_assignment_json = $2::jsonb WHERE id = $1 RETURNING id", [runId, JSON.stringify(body)]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.status(200).json({ ok: true, run_id: runId });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42703" || (typeof err.message === "string" && err.message.includes("image_assignment_json"))) {
      res.status(503).json({
        error: "runs.image_assignment_json column not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to enable.",
      });
      return;
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
}

export async function validateImageAssignment(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.id ?? "");
    let runRow: { rows: { image_assignment_json: unknown }[] };
    try {
      runRow = await pool.query("SELECT image_assignment_json FROM runs WHERE id = $1", [runId]);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "42703" || (typeof err.message === "string" && err.message.includes("image_assignment_json"))) {
        res.status(503).json({
          error: "runs.image_assignment_json column not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to enable.",
        });
        return;
      }
      throw e;
    }
    if (runRow.rows.length === 0) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    const assignment = runRow.rows[0].image_assignment_json;
    if (!assignment || typeof assignment !== "object") {
      res.status(400).json({ error: "Run has no image_assignment_json" });
      return;
    }
    const templateId = (assignment as { template_id?: string }).template_id;
    if (!templateId) {
      res.status(400).json({ error: "image_assignment_json missing template_id" });
      return;
    }
    let contract: Contract | null = null;
    try {
      const contractRow = await pool.query(
        "SELECT hero_required, logo_safe_hero, product_hero_allowed, max_content_slots, max_product_slots, collapses_empty_modules FROM template_image_contracts WHERE template_id = $1 AND version = 'v1'",
        [templateId]
      );
      contract = contractRow.rows.length > 0 ? (contractRow.rows[0] as Contract) : null;
    } catch (err) {
      if (!isTemplateImageContractsMissing(err)) throw err;
    }
    const { evaluateImageAssignmentValidations } = await import("../../template-image-validators.js");
    const results = evaluateImageAssignmentValidations(assignment, contract);
    for (const v of results) {
      await pool.query(
        "INSERT INTO validations (id, run_id, validator_type, status, created_at) VALUES (gen_random_uuid(), $1, $2, $3, now())",
        [runId, `image_assignment:${v.code}`, v.status]
      );
    }
    const failed = results.filter((r) => r.status === "fail");
    res.status(200).json({ ok: true, run_id: runId, evaluated: results.length, failed: failed.length, results });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function cancel(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const runId = String(req.params.id ?? "");
    const reason = (req.body as { reason?: string })?.reason ?? null;
    const r = await pool
      .query(
        "UPDATE runs SET cancelled_at = now(), cancelled_reason = $2, status = 'failed' WHERE id = $1 RETURNING id, status, cancelled_at",
        [runId, reason]
      )
      .catch(() => pool.query("UPDATE runs SET status = 'failed' WHERE id = $1 RETURNING id, status", [runId]));
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export function createStub(_req: Request, res: Response): void {
  res.status(501).json({ error: "Use scheduler.createRun via internal API; not yet exposed with validation" });
}

export async function byArtifactType(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as { produces?: string; consumes?: string[]; initiative_id?: string; environment?: string };
    const produces = body?.produces?.trim();
    const initiativeId = body?.initiative_id?.trim();
    if (!produces) {
      res.status(400).json({ error: "Body must include produces (artifact type key)" });
      return;
    }
    if (!initiativeId) {
      res.status(400).json({ error: "Body must include initiative_id" });
      return;
    }
    const consumes = Array.isArray(body?.consumes) ? body.consumes.filter((c): c is string => typeof c === "string") : [];
    const environment = body?.environment && ["sandbox", "staging", "prod"].includes(body.environment) ? body.environment : "sandbox";

    const runId = await withTransaction(async (client) => {
      const { resolveOperators } = await import("../../capability-resolver.js");
      const { createHash } = await import("crypto");
      const result = await resolveOperators(client as import("pg").PoolClient, { produces, consumes });
      if (!result.operators.length) {
        throw new Error(
          `No operator produces artifact type "${produces}"${consumes.length ? ` and consumes [${consumes.join(", ")}]` : ""}. Check capability graph.`
        );
      }
      const jobType = result.operators[0];

      const planHash = createHash("sha256").update(`by_artifact_type:${produces}:${consumes.join(",")}`).digest("hex");
      let planId: string;
      const existing = await client.query("SELECT id FROM plans WHERE initiative_id = $1 AND plan_hash = $2", [initiativeId, planHash]);
      if (existing.rows.length > 0) {
        planId = (existing.rows[0] as { id: string }).id;
      } else {
        const initCheck = await client.query("SELECT id FROM initiatives WHERE id = $1", [initiativeId]);
        if (initCheck.rows.length === 0) throw new Error("Initiative not found");
        planId = uuid();
        const versionRow = await client.query("SELECT coalesce(max(version), 0) + 1 AS v FROM plans WHERE initiative_id = $1", [initiativeId]);
        const version = (versionRow.rows[0]?.v as number) ?? 1;
        await client.query(
          "INSERT INTO plans (id, initiative_id, plan_hash, name, version) VALUES ($1, $2, $3, $4, $5)",
          [planId, initiativeId, planHash, `Produce ${produces}`, version]
        );
        const nodeId = uuid();
        await client.query(
          "INSERT INTO plan_nodes (id, plan_id, node_key, job_type, node_type) VALUES ($1, $2, $3, $4, 'job')",
          [nodeId, planId, "produce", jobType]
        );
      }

      let releaseId: string;
      try {
        const route = await routeRun(pool, environment as "sandbox" | "staging" | "prod");
        releaseId = route.releaseId;
      } catch (routeErr) {
        const msg = (routeErr as Error).message;
        if (!msg.includes("No promoted release")) throw routeErr;
        const ins = await pool.query(
          "INSERT INTO releases (id, status, percent_rollout, policy_version) VALUES ($1, 'promoted', 100, 'latest') RETURNING id",
          [uuid()]
        );
        releaseId = (ins.rows[0] as { id: string }).id;
      }

      return createRun(client, {
        planId,
        releaseId,
        policyVersion: "latest",
        environment: environment as "sandbox" | "staging" | "prod",
        cohort: "control",
        rootIdempotencyKey: `by-artifact-type:${produces}:${Date.now()}`,
        llmSource: "gateway",
      });
    });

    res.status(201).json({
      id: runId,
      produces,
      consumes,
      message:
        "Resolved operator from capability graph; single-node plan and run created. Runner will produce the artifact when connected.",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Initiative not found") {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.includes("No operator produces")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

export async function rerun(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const runId = String(req.params.id ?? "");
    let r = await pool
      .query("SELECT plan_id, release_id, policy_version, environment, cohort, llm_source FROM runs WHERE id = $1", [runId])
      .catch(() => null);
    if (!r || r.rows.length === 0) {
      r = await pool.query("SELECT plan_id, release_id, policy_version, environment, cohort FROM runs WHERE id = $1", [runId]);
      if (r.rows.length === 0) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
    }
    const row = r.rows[0] as { plan_id: string; release_id: string; policy_version?: string; environment: string; cohort: string; llm_source?: string };
    const llmSource = row.llm_source === "openai_direct" ? ("openai_direct" as const) : ("gateway" as const);
    const newRunId = await withTransaction(async (client) => {
      return createRun(client, {
        planId: row.plan_id,
        releaseId: row.release_id,
        policyVersion: row.policy_version ?? "latest",
        environment: row.environment as "sandbox" | "staging" | "prod",
        cohort: row.cohort as "control" | "canary" | null,
        rootIdempotencyKey: `rerun:${runId}:${Date.now()}`,
        llmSource,
      });
    });
    res.status(201).json({ id: newRunId });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function rollback(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["approver", "admin"])) return;
    const runId = String(req.params.id ?? "");
    const r = await pool.query("SELECT release_id, environment FROM runs WHERE id = $1", [runId]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    const { release_id, environment } = r.rows[0] as { release_id: string; environment: string };
    await executeRollback(pool, release_id, environment as Environment);
    res.json({ ok: true, release_id, environment });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
