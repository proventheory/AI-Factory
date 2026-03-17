import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { pool } from "../../db.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

export async function documentTemplatesList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    const template_type = req.query.template_type as string | undefined;
    const status = req.query.status as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (brand_profile_id) {
      conditions.push(`brand_profile_id = $${i++}`);
      params.push(brand_profile_id);
    }
    if (template_type) {
      conditions.push(`template_type = $${i++}`);
      params.push(template_type);
    }
    if (status) {
      conditions.push(`status = $${i++}`);
      params.push(status);
    }
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
}

export async function documentTemplatesGetById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT * FROM document_templates WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
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
}

export async function documentTemplatesPost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      brand_profile_id?: string;
      template_type?: string;
      name?: string;
      description?: string;
      template_config?: unknown;
      component_sequence?: unknown;
      status?: string;
    };
    const r = await pool.query(
      `INSERT INTO document_templates (brand_profile_id, template_type, name, description, template_config, component_sequence, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) RETURNING *`,
      [
        body.brand_profile_id ?? null,
        body.template_type ?? null,
        body.name ?? null,
        body.description ?? null,
        body.template_config ? JSON.stringify(body.template_config) : null,
        body.component_sequence ? JSON.stringify(body.component_sequence) : null,
        body.status ?? "draft",
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function documentTemplatesPut(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const body = req.body as Record<string, unknown>;
    const allowed = [
      "brand_profile_id",
      "template_type",
      "name",
      "description",
      "template_config",
      "component_sequence",
      "status",
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowed) {
      if (body[field] !== undefined) {
        const val =
          field === "template_config" || field === "component_sequence"
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
      `UPDATE document_templates SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
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

export async function documentTemplatesDelete(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query(
      "UPDATE document_templates SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id, status",
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

export async function documentTemplatesComponentsPost(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const body = req.body as { component_type: string; config?: unknown; position?: number };
    if (!body.component_type) {
      res.status(400).json({ error: "component_type required" });
      return;
    }
    const cid = uuid();
    await pool.query(
      `INSERT INTO document_components (id, template_id, component_type, config, position)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        cid,
        id,
        body.component_type,
        body.config ? JSON.stringify(body.config) : "{}",
        body.position ?? 0,
      ]
    );
    const r = await pool.query("SELECT * FROM document_components WHERE id = $1", [cid]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function documentTemplatesComponentsPut(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const cid = String(req.params.cid ?? "");
    const body = req.body as { config?: unknown; position?: number };
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.config !== undefined) {
      sets.push(`config = $${i++}::jsonb`);
      params.push(JSON.stringify(body.config));
    }
    if (body.position !== undefined) {
      sets.push(`position = $${i++}`);
      params.push(body.position);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    params.push(cid, id);
    const r = await pool.query(
      `UPDATE document_components SET ${sets.join(", ")} WHERE id = $${i} AND template_id = $${i + 1} RETURNING *`,
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

export async function documentTemplatesComponentsDelete(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const cid = String(req.params.cid ?? "");
    const r = await pool.query(
      "DELETE FROM document_components WHERE id = $1 AND template_id = $2 RETURNING id",
      [cid, id]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(200).json({ deleted: true, id: cid });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function pexelsSearch(req: Request, res: Response): Promise<void> {
  try {
    const key = process.env.PEXELS_API_KEY;
    if (!key) {
      res.status(503).json({ error: "Pexels API not configured (PEXELS_API_KEY)" });
      return;
    }
    const q = (req.query.q as string)?.trim() || "nature";
    const per_page = Math.min(Math.max(Number(req.query.per_page) || 20, 1), 80);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${per_page}&page=${page}`;
    const resp = await fetch(url, { headers: { Authorization: key } });
    if (!resp.ok) {
      const text = await resp.text();
      res.status(resp.status).json({ error: text || "Pexels API error" });
      return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function campaignImagesCopy(req: Request, res: Response): Promise<void> {
  try {
    const url = (req.body?.url as string)?.trim();
    if (!url || !url.startsWith("http")) {
      res.status(400).json({ error: "Body must include url (http(s))" });
      return;
    }
    const { copyImageToCdn } = await import("../../campaign-images-storage.js");
    const result = await copyImageToCdn(url);
    if (!result) {
      res.status(502).json({
        error: "Failed to copy image to CDN (check SUPABASE_* env and URL)",
      });
      return;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
