import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";
import { ARTIFACT_METADATA_JSON_ALLOWLIST } from "../lib/metadata-guards.js";

const MAX_ARTIFACT_CONTENT_BYTES = 2 * 1024 * 1024; // 2MB

/** GET /v1/tool_calls — list with pagination and filters (run_id = tool_calls for that run via job_runs) */
export async function listToolCalls(req: Request, res: Response): Promise<void> {
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
    const finalQ = run_id
      ? `SELECT tc.* FROM tool_calls tc JOIN job_runs jr ON jr.id = tc.job_run_id WHERE jr.run_id = $1 ORDER BY tc.started_at DESC NULLS LAST LIMIT $2 OFFSET $3`
      : `SELECT * FROM tool_calls WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC NULLS LAST LIMIT $${i} OFFSET $${i + 1}`;
    const finalParams = run_id ? [run_id, limit, offset] : params;
    const r = await pool.query(run_id ? finalQ : `SELECT * FROM tool_calls WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC NULLS LAST LIMIT $${i} OFFSET $${i + 1}`, finalParams);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/artifacts/:id — single artifact with optional download URL */
export async function getArtifact(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT * FROM artifacts WHERE id = $1", [id]);
    if (r.rows.length === 0) return void res.status(404).json({ error: "Artifact not found" });
    const artifact = r.rows[0] as { uri?: string; [k: string]: unknown };
    if (artifact.uri?.startsWith("supabase-storage://")) {
      try {
        const { getArtifactSignedUrl } = await import("../../artifact-storage.js");
        const downloadUrl = await getArtifactSignedUrl(artifact.uri);
        if (downloadUrl) (artifact as Record<string, unknown>).download_url = downloadUrl;
      } catch { /* storage not configured */ }
    }
    res.json(artifact);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/artifacts/:id/content — artifact body for preview (e.g. landing page HTML). Use as view URL. */
export async function getArtifactContent(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT id, artifact_type, metadata_json, uri FROM artifacts WHERE id = $1", [id]);
    if (r.rows.length === 0) return void res.status(404).send("Artifact not found");
    const row = r.rows[0] as { artifact_type: string; metadata_json: { content?: string } | null; uri?: string };
    let content: string | null = row.metadata_json?.content ?? null;
    if (content == null && row.uri?.startsWith("supabase-storage://")) {
      try {
        const { downloadArtifact } = await import("../../artifact-storage.js");
        content = await downloadArtifact(row.uri);
      } catch { /* storage not configured */ }
    }
    if (content == null) return void res.status(404).send("Artifact content not available");
    const isHtml = row.artifact_type === "landing_page" || row.artifact_type === "email_template";
    res.setHeader("Content-Type", isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(content);
  } catch (e) {
    res.status(500).send(String((e as Error).message));
  }
}

/** GET /v1/artifacts/:id/analyze — analyze rendered email artifact for load failures (unreplaced placeholders, bad image src). For self-heal and template proof. */
export async function getArtifactAnalyze(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT id, artifact_type, metadata_json, uri FROM artifacts WHERE id = $1", [id]);
    if (r.rows.length === 0) return void res.status(404).json({ error: "Artifact not found" });
    const row = r.rows[0] as { artifact_type: string; metadata_json: { content?: string } | null; uri?: string };
    let content: string | null = row.metadata_json?.content ?? null;
    if (content == null && row.uri?.startsWith("supabase-storage://")) {
      try {
        const { downloadArtifact } = await import("../../artifact-storage.js");
        content = await downloadArtifact(row.uri);
      } catch { /* storage not configured */ }
    }
    if (content == null) return void res.status(404).json({ error: "Artifact content not available" });
    const { analyzeArtifactContent } = await import("../../artifact-content-analyzer.js");
    const result = analyzeArtifactContent(content);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** PATCH /v1/artifacts/:id — update artifact metadata_json (content and/or metadata). Primary use: email_template edit (Phase 5). Operator+ only. */
export async function patchArtifact(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    let body: { content?: string; metadata?: Record<string, unknown> };
    try {
      body = typeof req.body === "object" && req.body !== null ? req.body : {};
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    if (body.content !== undefined && typeof body.content !== "string") {
      res.status(400).json({ error: "content must be a string" });
      return;
    }
    if (body.content !== undefined && Buffer.byteLength(body.content, "utf8") > MAX_ARTIFACT_CONTENT_BYTES) {
      res.status(400).json({ error: "content too large" });
      return;
    }
    if (body.metadata !== undefined) {
      if (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata)) {
        res.status(400).json({ error: "metadata must be a plain object" });
        return;
      }
      if (Object.getPrototypeOf(body.metadata) !== Object.prototype) {
        res.status(400).json({ error: "metadata must be a plain object" });
        return;
      }
      for (const key of Object.keys(body.metadata)) {
        if (!ARTIFACT_METADATA_JSON_ALLOWLIST.has(key)) {
          console.warn(
            `[PATCH artifact] metadata key "${key}" is not in the documented allowlist (content, mjml, error_signature, type). See docs/SCHEMA_JSON_GUARDRAILS.md.`,
            { artifact_id: req.params.id }
          );
        }
      }
    }
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT id, metadata_json FROM artifacts WHERE id = $1", [id]);
    if (r.rows.length === 0) return void res.status(404).json({ error: "Artifact not found" });
    const row = r.rows[0] as { id: string; metadata_json: Record<string, unknown> | null };
    let nextMeta = (row.metadata_json && typeof row.metadata_json === "object" ? { ...row.metadata_json } : {}) as Record<string, unknown>;
    if (body.content !== undefined) nextMeta = { ...nextMeta, content: body.content };
    if (body.metadata !== undefined) nextMeta = { ...nextMeta, ...body.metadata };
    await pool.query("UPDATE artifacts SET metadata_json = $1::jsonb WHERE id = $2", [JSON.stringify(nextMeta), id]);
    const updated = await pool.query("SELECT * FROM artifacts WHERE id = $1", [id]);
    const updatedRow = updated.rows[0] as { run_id?: string };
    if (process.env.NODE_ENV !== "test") console.info("[PATCH artifact]", { artifact_id: id, run_id: updatedRow?.run_id });
    res.json(updated.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** PATCH /v1/artifacts/:id/knowledge — set Artifact/Knowledge graph fields: derived_from_artifact_id, scope_type, scope_id. */
export async function patchArtifactKnowledge(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const id = String(req.params.id ?? "");
    const body = (req.body as { derived_from_artifact_id?: string | null; scope_type?: string | null; scope_id?: string | null }) ?? {};
    const check = await pool.query("SELECT id FROM artifacts WHERE id = $1", [id]);
    if (check.rows.length === 0) return void res.status(404).json({ error: "Artifact not found" });
    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.derived_from_artifact_id !== undefined) {
      updates.push(`derived_from_artifact_id = $${i++}`);
      params.push(body.derived_from_artifact_id || null);
    }
    if (body.scope_type !== undefined) {
      updates.push(`scope_type = $${i++}`);
      params.push(body.scope_type || null);
    }
    if (body.scope_id !== undefined) {
      updates.push(`scope_id = $${i++}`);
      params.push(body.scope_id || null);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: "Body must include at least one of derived_from_artifact_id, scope_type, scope_id" });
      return;
    }
    params.push(id);
    await pool.query(
      `UPDATE artifacts SET ${updates.join(", ")} WHERE id = $${i}`,
      params
    );
    const updated = await pool.query("SELECT id, derived_from_artifact_id, scope_type, scope_id FROM artifacts WHERE id = $1", [id]);
    res.json(updated.rows[0] ?? { id });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "42703") {
      res.status(503).json({ error: "Artifact knowledge columns not present. Run migration 20250331000012_artifact_knowledge_graph.sql." });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** POST /v1/artifacts/:id/referenced_by — add a page reference (Artifact/Knowledge graph: referenced_by). */
export async function postArtifactReferencedBy(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const id = String(req.params.id ?? "");
    const body = req.body as { page_ref?: string; ref_type?: string };
    const pageRef = body?.page_ref?.trim();
    if (!pageRef) {
      res.status(400).json({ error: "Body must include page_ref (URL or page identifier)" });
      return;
    }
    const refType = body?.ref_type?.trim() || "page";
    const check = await pool.query("SELECT id FROM artifacts WHERE id = $1", [id]);
    if (check.rows.length === 0) return void res.status(404).json({ error: "Artifact not found" });
    await pool.query(
      "INSERT INTO artifact_page_references (artifact_id, page_ref, ref_type) VALUES ($1, $2, $3) ON CONFLICT (artifact_id, page_ref) DO NOTHING",
      [id, pageRef, refType]
    );
    const refs = await pool.query("SELECT id, page_ref, ref_type FROM artifact_page_references WHERE artifact_id = $1", [id]);
    res.status(201).json({ artifact_id: id, referenced_by: refs.rows });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.status(503).json({ error: "artifact_page_references table not present. Run migration 20250331000012_artifact_knowledge_graph.sql." });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/artifacts — list with pagination and filters */
export async function listArtifacts(req: Request, res: Response): Promise<void> {
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
}

/** GET /v1/llm_calls — list with pagination, filters, and time range */
export async function listLlmCalls(req: Request, res: Response): Promise<void> {
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
      res.send([header, ...rows].join("\n"));
      return;
    }
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/validations — list by run_id or job_run_id (for Run detail Validations tab) */
export async function listValidations(req: Request, res: Response): Promise<void> {
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
}

/** POST /v1/template_proof/start — start a template proof batch (Sticky Green + all templates). Body: brand_profile_id, duration_minutes, optional template_ids. Returns 202 with batch_id. */
export async function postTemplateProofStart(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as { brand_profile_id?: string; duration_minutes?: number; template_ids?: string[] };
    const brandProfileId = body?.brand_profile_id;
    const durationMinutes = Math.min(Math.max(Number(body?.duration_minutes) || 30, 1), 120);
    if (!brandProfileId) {
      res.status(400).json({ error: "brand_profile_id is required" });
      return;
    }
    const r = await pool.query(
      `INSERT INTO template_proof_batches (brand_profile_id, status, end_at) VALUES ($1, 'running', now() + ($2 || ' minutes')::interval) RETURNING id, status, started_at, end_at`,
      [brandProfileId, durationMinutes]
    );
    const batch = r.rows[0] as { id: string; status: string; started_at: string; end_at: string };
    setImmediate(async () => {
      try {
        const { runProofLoop } = await import("../../template-proof-job.js");
        await runProofLoop({
          batchId: batch.id,
          brandProfileId,
          durationMinutes,
          templateIds: body?.template_ids,
        });
      } catch (e) {
        console.error("[template-proof] Loop error:", e);
        await pool.query(
          "UPDATE template_proof_batches SET status = 'failed', completed_at = now() WHERE id = $1",
          [batch.id]
        );
      }
    });
    res.status(202).json({ batch_id: batch.id, status: batch.status, started_at: batch.started_at, end_at: batch.end_at });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42P01" || (typeof err.message === "string" && err.message.includes("template_proof"))) {
      res.status(503).json({ error: "template_proof_batches table not present. Run migration 20250312000001_template_proof.sql." });
      return;
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
}

/** GET /v1/template_proof — list proof runs (latest per template or by batch_id). Query: batch_id, template_id, limit, latest_per_template=1. */
export async function listTemplateProof(req: Request, res: Response): Promise<void> {
  try {
    const batchId = req.query.batch_id as string | undefined;
    const templateId = req.query.template_id as string | undefined;
    const latestPerTemplate = req.query.latest_per_template === "1" || req.query.latest_per_template === "true";
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    if (batchId) {
      const r = await pool.query(
        "SELECT * FROM template_proof_runs WHERE batch_id = $1 ORDER BY created_at",
        [batchId]
      );
      res.json({ items: r.rows, batch_id: batchId });
      return;
    }
    const r = latestPerTemplate
      ? await pool.query(
          "SELECT DISTINCT ON (template_id) * FROM template_proof_runs ORDER BY template_id, created_at DESC"
        )
      : templateId
        ? await pool.query("SELECT * FROM template_proof_runs WHERE template_id = $1 ORDER BY created_at DESC LIMIT $2", [templateId, limit])
        : await pool.query("SELECT * FROM template_proof_runs ORDER BY created_at DESC LIMIT $1", [limit]);
    res.json({ items: r.rows });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42P01" || (typeof err.message === "string" && err.message.includes("template_proof"))) {
      res.status(503).json({ error: "template_proof_runs table not present. Run migration 20250312000001_template_proof.sql." });
      return;
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
}

/** GET /v1/template_proof/:batchId — batch detail and summary. */
export async function getTemplateProofBatch(req: Request, res: Response): Promise<void> {
  try {
    const batchId = String(req.params.batchId ?? "");
    const batchRow = await pool.query("SELECT * FROM template_proof_batches WHERE id = $1", [batchId]);
    if (batchRow.rows.length === 0) return void res.status(404).json({ error: "Batch not found" });
    const runs = await pool.query("SELECT * FROM template_proof_runs WHERE batch_id = $1 ORDER BY created_at", [batchId]);
    const items = runs.rows as { status: string; artifact_count: number }[];
    const passed = items.filter((i) => i.status === "succeeded").length;
    const failed = items.filter((i) => i.status === "failed" || i.status === "timed_out").length;
    res.json({
      batch: batchRow.rows[0],
      summary: { total_templates: items.length, passed, failed, remaining: items.length - passed - failed },
      items: runs.rows,
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42P01" || (typeof err.message === "string" && err.message.includes("template_proof"))) {
      res.status(503).json({ error: "template_proof tables not present. Run migration 20250312000001_template_proof.sql." });
      return;
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
}
