import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { pool } from "../../db.js";
import { requireRole } from "../security/rbac.js";
import { normalizeRiskLevel } from "../lib/risk.js";
import { checkEmailDesignMetadataJsonBlocklist } from "../lib/metadata-guards.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const campaign_kind = req.query.campaign_kind as string | undefined;
    const conditions = ["i.intent_type = 'email_design_generator'"];
    const params: unknown[] = [limit, offset];
    if (campaign_kind === "landing_page") {
      conditions.push("(m.metadata_json->>'campaign_kind') = 'landing_page'");
    }
    const whereClause = conditions.join(" AND ");
    const r = await pool.query(
      `SELECT i.id, i.title, i.intent_type, i.risk_level, i.created_at,
              m.subject_line, m.from_name, m.from_email, m.template_artifact_id, m.audience_segment_ref, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_design_generator_metadata m ON m.initiative_id = i.id
       WHERE ${whereClause}
       ORDER BY i.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const fullSelect = `SELECT i.id, i.title, i.created_at, i.brand_profile_id, i.template_id, m.subject_line, m.from_name, m.from_email, m.reply_to, m.template_artifact_id, m.audience_segment_ref, m.metadata_json, m.created_at AS metadata_created_at, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_design_generator_metadata m ON m.initiative_id = i.id
       WHERE i.id = $1 AND i.intent_type = 'email_design_generator'`;
    const minimalSelect = `SELECT i.id, i.title, i.created_at, i.template_id, m.subject_line, m.from_name, m.from_email, m.reply_to, m.template_artifact_id, m.audience_segment_ref, m.metadata_json, m.created_at AS metadata_created_at, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_design_generator_metadata m ON m.initiative_id = i.id
       WHERE i.id = $1 AND i.intent_type = 'email_design_generator'`;
    let r: { rows: Record<string, unknown>[] };
    try {
      r = await pool.query(fullSelect, [id]);
    } catch (e) {
      if ((e as { code?: string }).code === "42703" || String((e as Error).message).includes("brand_profile_id")) {
        r = await pool.query(minimalSelect, [id]);
        if (r.rows.length > 0) {
          const row = r.rows[0] as Record<string, unknown>;
          row.brand_profile_id = null;
          if (!("template_id" in row)) row.template_id = null;
        }
      } else throw e;
    }
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const row = r.rows[0] as Record<string, unknown>;
    if (row.template_id == null && row.metadata_json != null && typeof row.metadata_json === "object" && (row.metadata_json as Record<string, unknown>).template_id != null) {
      row.template_id = (row.metadata_json as Record<string, unknown>).template_id;
    }
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function post(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as {
      title?: string;
      subject_line?: string;
      from_name?: string;
      from_email?: string;
      brand_profile_id?: string;
      template_id?: string;
      template_artifact_id?: string;
      metadata_json?: unknown;
      risk_level?: string;
    };
    const id = uuid();
    const riskLevel = normalizeRiskLevel(body.risk_level) ?? "med";
    const err = (e: unknown) => (e as { code?: string; message?: string }).code === "42703" || String((e as Error).message).includes("brand_profile_id");
    try {
      await pool.query(
        `INSERT INTO initiatives (id, intent_type, title, risk_level, brand_profile_id, template_id) VALUES ($1, 'email_design_generator', $2, $5, $3, $4)`,
        [id, body.title ?? "New email campaign", body.brand_profile_id ?? null, body.template_id ?? null, riskLevel]
      );
    } catch (e) {
      if (err(e)) {
        try {
          await pool.query(
            `INSERT INTO initiatives (id, intent_type, title, risk_level, template_id) VALUES ($1, 'email_design_generator', $2, $3, $4)`,
            [id, body.title ?? "New email campaign", riskLevel, body.template_id ?? null]
          );
        } catch (e2) {
          if ((e2 as { code?: string }).code === "42703") {
            await pool.query(
              `INSERT INTO initiatives (id, intent_type, title, risk_level) VALUES ($1, 'email_design_generator', $2, $3)`,
              [id, body.title ?? "New email campaign", riskLevel]
            );
          } else throw e2;
        }
      } else throw e;
    }
    const metadataForDb = body.metadata_json != null && typeof body.metadata_json === "object"
      ? { ...(body.metadata_json as Record<string, unknown>), template_id: body.template_id ?? (body.metadata_json as Record<string, unknown>).template_id }
      : (body.template_id ? { template_id: body.template_id } : null);
    if (metadataForDb != null && typeof metadataForDb === "object") {
      const blocked = checkEmailDesignMetadataJsonBlocklist(metadataForDb as Record<string, unknown>);
      if (blocked) {
        res.status(400).json({
          error: `metadata_json must not contain "${blocked}". Use columns or a child table. See docs/SCHEMA_JSON_GUARDRAILS.md.`,
        });
        return;
      }
    }
    await pool.query(
      `INSERT INTO email_design_generator_metadata (initiative_id, subject_line, from_name, from_email, template_artifact_id, metadata_json) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        id,
        body.subject_line ?? null,
        body.from_name ?? null,
        body.from_email ?? null,
        body.template_artifact_id ?? null,
        metadataForDb != null ? JSON.stringify(metadataForDb) : null,
      ]
    );
    const r = await pool.query(
      `SELECT i.id, i.title, i.created_at, m.subject_line, m.from_name, m.from_email, m.template_artifact_id, m.metadata_json
       FROM initiatives i LEFT JOIN email_design_generator_metadata m ON m.initiative_id = i.id WHERE i.id = $1`,
      [id]
    );
    const row = r.rows[0] as Record<string, unknown>;
    res.status(201).json({ ...row, brand_profile_id: body.brand_profile_id ?? null, template_id: body.template_id ?? null });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function patch(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const id = String(req.params.id ?? "");
    const exists = await pool.query("SELECT id FROM initiatives WHERE id = $1 AND intent_type = 'email_design_generator'", [id]);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    if (body.metadata_json != null && typeof body.metadata_json === "object") {
      const blocked = checkEmailDesignMetadataJsonBlocklist(body.metadata_json as Record<string, unknown>);
      if (blocked) {
        res.status(400).json({
          error: `metadata_json must not contain "${blocked}". Use columns or a child table. See docs/SCHEMA_JSON_GUARDRAILS.md.`,
        });
        return;
      }
    }
    const allowed = [
      "subject_line",
      "from_name",
      "from_email",
      "reply_to",
      "audience_segment_ref",
      "template_artifact_id",
      "metadata_json",
    ];
    const updates: string[] = [];
    const params: unknown[] = [id];
    let i = 2;
    for (const field of allowed) {
      if (body[field] !== undefined) {
        if (field === "metadata_json") {
          updates.push(`metadata_json = $${i++}::jsonb`);
        } else {
          updates.push(`${field} = $${i++}`);
        }
        params.push(field === "metadata_json" && body[field] != null ? JSON.stringify(body[field]) : body[field]);
      }
    }
    updates.push("updated_at = now()");
    const r = await pool.query(
      `INSERT INTO email_design_generator_metadata (initiative_id, subject_line, from_name, from_email)
       VALUES ($1, null, null, null)
       ON CONFLICT (initiative_id) DO UPDATE SET ${updates.join(", ")}
       RETURNING *`,
      params
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
