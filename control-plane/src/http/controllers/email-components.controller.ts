import type { Request, Response } from "express";
import mjml2html from "mjml";
import { pool } from "../../db.js";
import { requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";
import { brandPlaceholderMap, substitutePlaceholders, substitutePlaceholdersDoubleCurly, isValidUuid } from "../lib/email-preview-helpers.js";

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      "SELECT * FROM email_component_library ORDER BY position ASC, created_at ASC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    const count = await pool.query("SELECT count(*)::int AS total FROM email_component_library");
    const total = (count.rows[0] as { total: number })?.total ?? 0;
    res.json({ items: r.rows, total, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function assembled(req: Request, res: Response): Promise<void> {
  try {
    const idsParam = (req.query.ids as string) ?? "";
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      res.status(400).json({ error: "ids query required (comma-separated UUIDs)" });
      return;
    }
    for (const id of ids) {
      if (!isValidUuid(id)) {
        res.status(400).json({ error: `Invalid UUID: ${id}` });
        return;
      }
    }
    const r = await pool.query(
      `SELECT id, mjml_fragment, html_fragment, use_context, position FROM email_component_library WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)`,
      [ids]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "No components found" });
      return;
    }
    const brandProfileId = req.query.brand_profile_id as string | undefined;
    let brandMap: Record<string, string> = {};
    if (brandProfileId && isValidUuid(brandProfileId)) {
      const brandR = await pool.query("SELECT name, identity, design_tokens FROM brand_profiles WHERE id = $1", [brandProfileId]);
      if (brandR.rows.length > 0) {
        brandMap = brandPlaceholderMap(brandR.rows[0] as Record<string, unknown>);
      }
    }
    if (ids.length === 1 && req.query.format === "html") {
      const row = r.rows[0] as { html_fragment?: string | null; use_context?: string | null };
      const useContext = (row.use_context ?? "").toLowerCase();
      const htmlFragment = row.html_fragment != null && String(row.html_fragment).trim() !== "" ? String(row.html_fragment).trim() : null;
      if (useContext === "landing_page" && htmlFragment) {
        const substituted = Object.keys(brandMap).length > 0
          ? substitutePlaceholdersDoubleCurly(htmlFragment, brandMap)
          : htmlFragment;
        const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>${substituted}</body></html>`;
        res.type("text/html").send(wrapped);
        return;
      }
    }
    const fragments = (r.rows as { mjml_fragment: string }[]).map((row) => row.mjml_fragment ?? "").filter(Boolean);
    let mjml = `<mjml>\n<mj-body>\n${fragments.join("\n")}\n</mj-body>\n</mjml>`;
    if (Object.keys(brandMap).length > 0) {
      mjml = substitutePlaceholders(mjml, brandMap);
    }
    if (req.query.format === "html") {
      const { html } = mjml2html(mjml, { validationLevel: "skip" });
      res.type("text/html").send(html);
      return;
    }
    res.type("application/json").json({ mjml });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) {
      res.status(400).json({ error: "Invalid UUID" });
      return;
    }
    const r = await pool.query("SELECT * FROM email_component_library WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function post(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as {
      component_type?: string;
      name?: string;
      description?: string;
      mjml_fragment?: string | null;
      html_fragment?: string | null;
      placeholder_docs?: unknown;
      position?: number;
      use_context?: string;
    };
    if (!body.component_type?.trim() || !body.name?.trim()) {
      res.status(400).json({ error: "component_type and name required" });
      return;
    }
    const hasMjml = body.mjml_fragment != null && String(body.mjml_fragment).trim() !== "";
    const hasHtml = body.html_fragment != null && String(body.html_fragment).trim() !== "";
    if (!hasMjml && !hasHtml) {
      res.status(400).json({ error: "At least one of mjml_fragment or html_fragment required (use html_fragment for landing_page e.g. WordPress/PHP footer)" });
      return;
    }
    const useContext = typeof body.use_context === "string" && body.use_context.trim() ? body.use_context.trim().toLowerCase() : "email";
    const r = await pool.query(
      `INSERT INTO email_component_library (component_type, name, description, mjml_fragment, html_fragment, placeholder_docs, position, use_context, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now()) RETURNING *`,
      [
        body.component_type.trim(),
        body.name.trim(),
        body.description?.trim() ?? null,
        hasMjml ? body.mjml_fragment : null,
        hasHtml ? body.html_fragment : null,
        body.placeholder_docs != null ? JSON.stringify(body.placeholder_docs) : "[]",
        typeof body.position === "number" ? body.position : 0,
        useContext,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function patch(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) {
      res.status(400).json({ error: "Invalid UUID" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const allowed = ["component_type", "name", "description", "mjml_fragment", "html_fragment", "placeholder_docs", "position", "use_context"];
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowed) {
      if (body[field] !== undefined) {
        if (field === "placeholder_docs") {
          sets.push(`${field} = $${i++}::jsonb`);
          params.push(JSON.stringify(body[field]));
        } else if (field === "position" && typeof body[field] === "number") {
          sets.push(`${field} = $${i++}`);
          params.push(body[field]);
        } else if (field === "use_context" && typeof body[field] === "string") {
          sets.push(`${field} = $${i++}`);
          params.push(body[field].trim().toLowerCase() || "email");
        } else if (field === "mjml_fragment" || field === "html_fragment") {
          sets.push(`${field} = $${i++}`);
          params.push(typeof body[field] === "string" ? body[field] : null);
        } else if (typeof body[field] === "string") {
          sets.push(`${field} = $${i++}`);
          params.push(body[field]);
        }
      }
    }
    if (params.length === 0) {
      res.status(400).json({ error: "No updatable fields" });
      return;
    }
    params.push(id);
    const r = await pool.query(
      `UPDATE email_component_library SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
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

export async function del(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) {
      res.status(400).json({ error: "Invalid UUID" });
      return;
    }
    const r = await pool.query("DELETE FROM email_component_library WHERE id = $1 RETURNING id", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(200).json({ deleted: true, id });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
