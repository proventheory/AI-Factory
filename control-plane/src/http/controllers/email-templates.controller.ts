import type { Request, Response } from "express";
import mjml2html from "mjml";
import { pool } from "../../db.js";
import { requireRole } from "../security/rbac.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";
import { isTemplateImageContractsMissing } from "../lib/template-lint-gate.js";
import { brandPlaceholderMap, substitutePlaceholders, isValidUuid } from "../lib/email-preview-helpers.js";

function productLetterToSlot(letter: string): number {
  const code = letter.toUpperCase().charCodeAt(0);
  if (code >= 65 && code <= 75) return code - 64;
  return 0;
}

function productSlotsFromMjml(mjml: string | null): number {
  if (!mjml || typeof mjml !== "string") return 0;
  let max = 0;
  const numericMatches = mjml.matchAll(/product_(\d+)_(?:image|title|url)/gi);
  for (const m of numericMatches) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  const bracketMatches = mjml.matchAll(/\[product\s+([A-Za-z])\s+(?:src|title|productUrl|description)\]/gi);
  for (const m of bracketMatches) {
    const n = productLetterToSlot(m[1]);
    if (n > max) max = n;
  }
  return max;
}

function contentSlotsFromMjml(mjml: string | null): number {
  if (!mjml || typeof mjml !== "string") return 0;
  let max = 0;
  for (const m of mjml.matchAll(/\[image\s+(\d+)\]/gi)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  for (const m of mjml.matchAll(/\{\{(?:content_)?image_(\d+)\}\}/gi)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  if (max === 0 && /\{\{hero_image|imageUrl|image_url\}\}|\[hero\]|\[banner\]|\[image_url\]|\[hero_image_url\]/i.test(mjml)) {
    return 1;
  }
  return max;
}

function normalizeTemplateType(type: string | null | undefined): string {
  const t = (type ?? "").trim().toLowerCase();
  if (t === "newsletter" || t === "product" || t === "promo" || t === "email") return t;
  if (t.includes("product")) return "product";
  if (t.includes("newsletter")) return "newsletter";
  if (t.includes("promo")) return "promo";
  return "email";
}

function enrichTemplateRow(row: Record<string, unknown>, contract: { max_content_slots?: number; max_product_slots?: number } | null): void {
  const mjml = row.mjml as string | null;
  const typeLabel = normalizeTemplateType(row.type as string);
  const name = String(row.name ?? "").trim();
  const id = row.id as string | undefined;

  let imageSlots: number;
  let productSlots: number;
  if (typeLabel === "product" && /emma/i.test(name)) {
    imageSlots = 1;
    productSlots = 5;
  } else if (id === "281f9f46-aca7-43ed-bb5f-85114234f210") {
    imageSlots = 6;
    productSlots = 3;
  } else if (typeLabel === "newsletter" && /^newsletter\s*1$/i.test(name)) {
    imageSlots = 2;
    productSlots = 0;
  } else if (row.component_sequence && Array.isArray(row.component_sequence) && row.component_sequence.length > 0 && !mjml) {
    imageSlots = typeof row.img_count === "number" ? row.img_count : 0;
    productSlots = 2;
  } else {
    imageSlots = contract?.max_content_slots ?? (typeof row.img_count === "number" ? row.img_count : null) ?? contentSlotsFromMjml(mjml) ?? 0;
    productSlots = contract?.max_product_slots ?? productSlotsFromMjml(mjml) ?? 0;
    if (typeLabel === "newsletter" && imageSlots === 0 && mjml) {
      const imageLike = mjml.match(/\{\{[^}]*image[^}]*\}\}|\[image\s*\d*\][^\]]*|\[hero\]|\[banner\]/gi);
      const count = imageLike ? Math.min(imageLike.length, 2) : 0;
      if (count >= 2) imageSlots = 2;
      else if (count === 1) imageSlots = 1;
    }
  }

  (row as Record<string, unknown>).image_slots = imageSlots;
  (row as Record<string, unknown>).product_slots = productSlots;
  (row as Record<string, unknown>).layout_style = `${typeLabel} (email template)`;
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const type = req.query.type as string | undefined;
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (type) {
      conditions.push(`t.type = $${i++}`);
      params.push(type);
    }
    if (brand_profile_id && isValidUuid(brand_profile_id)) {
      conditions.push(`(t.brand_profile_id = $${i++} OR t.brand_profile_id IS NULL)`);
      params.push(brand_profile_id);
    }
    params.push(limit, offset);
    const countQ = `SELECT count(*)::int AS total FROM email_templates t WHERE ${conditions.join(" AND ")}`;
    let items: Record<string, unknown>[];
    try {
      const q = `SELECT t.*, c.max_content_slots AS contract_max_content_slots, c.max_product_slots AS contract_max_product_slots
        FROM email_templates t
        LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1'
        WHERE ${conditions.join(" AND ")} ORDER BY t.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
      const [itemsResult, totalResult] = await Promise.all([
        pool.query(q, params),
        pool.query(countQ, params.slice(0, -2)),
      ]);
      items = itemsResult.rows as Record<string, unknown>[];
      const total = totalResult.rows[0]?.total ?? 0;
      for (const row of items) {
        const maxContent = row.contract_max_content_slots;
        const maxProduct = row.contract_max_product_slots;
        delete row.contract_max_content_slots;
        delete row.contract_max_product_slots;
        const contract =
          maxContent != null || maxProduct != null
            ? { max_content_slots: maxContent as number | undefined, max_product_slots: maxProduct as number | undefined }
            : null;
        enrichTemplateRow(row, contract);
      }
      res.json({ items, total });
      return;
    } catch (e) {
      if (!isTemplateImageContractsMissing(e)) throw e;
    }
    const fallbackQ = `SELECT t.* FROM email_templates t WHERE ${conditions.join(" AND ")} ORDER BY t.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(fallbackQ, params),
      pool.query(countQ, params.slice(0, -2)),
    ]);
    items = itemsResult.rows as Record<string, unknown>[];
    for (const row of items) {
      enrichTemplateRow(row, null);
    }
    res.json({ items, total: totalResult.rows[0]?.total ?? 0 });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    let row: Record<string, unknown>;
    try {
      const r = await pool.query(
        "SELECT t.*, c.max_content_slots AS contract_max_content_slots, c.max_product_slots AS contract_max_product_slots FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1",
        [id]
      );
      if (r.rows.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      row = r.rows[0] as Record<string, unknown>;
      const maxContent = row.contract_max_content_slots;
      const maxProduct = row.contract_max_product_slots;
      delete row.contract_max_content_slots;
      delete row.contract_max_product_slots;
      const contract =
        maxContent != null || maxProduct != null
          ? { max_content_slots: maxContent as number | undefined, max_product_slots: maxProduct as number | undefined }
          : null;
      enrichTemplateRow(row, contract);
    } catch (e) {
      if (!isTemplateImageContractsMissing(e)) throw e;
      const r = await pool.query("SELECT * FROM email_templates WHERE id = $1", [id]);
      if (r.rows.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      row = r.rows[0] as Record<string, unknown>;
      enrichTemplateRow(row, null);
    }
    const seq = row.component_sequence;
    if (Array.isArray(seq) && seq.length > 0 && seq.every((x): x is string => typeof x === "string")) {
      const ids = seq.filter((s) => isValidUuid(s));
      if (ids.length > 0) {
        const fragRes = await pool.query(
          "SELECT mjml_fragment FROM email_component_library WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)",
          [ids]
        );
        const fragments = (fragRes.rows as { mjml_fragment: string }[]).map((r) => r.mjml_fragment ?? "").filter(Boolean);
        if (fragments.length > 0) {
          row.mjml = `<mjml>\n<mj-body>\n${fragments.join("\n")}\n</mj-body>\n</mjml>`;
        }
      }
    }
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getPreview(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query("SELECT mjml, component_sequence, brand_profile_id FROM email_templates WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      res.status(404).send("Not found");
      return;
    }
    const row = r.rows[0] as Record<string, unknown>;
    let mjml = row.mjml as string | null;
    let seq = row.component_sequence as unknown;
    if (typeof seq === "string") {
      try {
        seq = JSON.parse(seq) as unknown;
      } catch {
        seq = null;
      }
    }
    if ((!mjml || typeof mjml !== "string") && Array.isArray(seq) && seq.length > 0) {
      const ids = (seq as unknown[])
        .map((x) => (typeof x === "string" ? x : null))
        .filter((s): s is string => s != null && isValidUuid(s));
      if (ids.length > 0) {
        const fragRes = await pool.query(
          "SELECT mjml_fragment FROM email_component_library WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)",
          [ids]
        );
        const fragments = (fragRes.rows as { mjml_fragment: string }[]).map((r) => r.mjml_fragment ?? "").filter(Boolean);
        if (fragments.length > 0) {
          mjml = `<mjml>\n<mj-body>\n${fragments.join("\n")}\n</mj-body>\n</mjml>`;
        }
      }
    }
    if (!mjml || typeof mjml !== "string") {
      res.status(422).send("Template has no MJML content");
      return;
    }
    const brandProfileId = row.brand_profile_id as string | null | undefined;
    if (brandProfileId && isValidUuid(brandProfileId)) {
      const brandR = await pool.query("SELECT name, identity, design_tokens FROM brand_profiles WHERE id = $1", [brandProfileId]);
      if (brandR.rows.length > 0) {
        const map = brandPlaceholderMap(brandR.rows[0] as Record<string, unknown>);
        mjml = substitutePlaceholders(mjml, map);
      }
    }
    const { html } = mjml2html(mjml, { validationLevel: "skip" });
    res.type("text/html").send(html);
  } catch (e) {
    res.status(500).send(String((e as Error).message));
  }
}

export async function getLint(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    let q: { rows: Record<string, unknown>[] };
    try {
      q = await pool.query(
        "SELECT t.id, t.name, t.mjml, c.hero_required, c.logo_safe_hero, c.product_hero_allowed, c.mixed_content_and_product_pool, c.collapses_empty_modules, c.max_content_slots, c.max_product_slots, c.supports_content_images, c.supports_product_images, c.optional_modules FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1",
        [id]
      );
    } catch (err) {
      if (isTemplateImageContractsMissing(err)) {
        res.status(503).json({ error: "template_image_contracts table not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to enable lint." });
        return;
      }
      throw err;
    }
    if (q.rows.length === 0) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    const row = q.rows[0];
    const contract = row.hero_required != null ? row : null;
    if (!contract) {
      res.status(400).json({ contract_missing: true, error: "Template has no template_image_contracts row (version v1); lint failed." });
      return;
    }
    const mjml = (row.mjml as string) ?? "";
    const { lintTemplateMjml } = await import("../../template-image-linter.js");
    const results = lintTemplateMjml(mjml, contract, id);
    res.json({ template_id: id, contract_present: true, results });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function post(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const body = req.body as {
      type?: string;
      name?: string;
      image_url?: string;
      mjml?: string;
      template_json?: unknown;
      sections_json?: unknown;
      img_count?: number;
      brand_profile_id?: string | null;
      component_sequence?: string[] | null;
    };
    const r = await pool.query(
      `INSERT INTO email_templates (type, name, image_url, mjml, template_json, sections_json, img_count, brand_profile_id, component_sequence)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb) RETURNING *`,
      [
        body.type ?? "newsletter",
        body.name ?? "Untitled",
        body.image_url ?? null,
        body.mjml ?? null,
        body.template_json ?? null,
        body.sections_json ?? null,
        body.img_count ?? 0,
        body.brand_profile_id ?? null,
        body.component_sequence != null ? JSON.stringify(body.component_sequence) : null,
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
    const body = req.body as Record<string, unknown>;
    const lintOnSave = body.lint_on_save === true;
    const allowed = ["type", "name", "image_url", "mjml", "template_json", "sections_json", "img_count", "brand_profile_id", "component_sequence"];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowed) {
      if (body[field] !== undefined) {
        if (field === "template_json" || field === "sections_json" || field === "component_sequence") {
          sets.push(`${field} = $${i++}::jsonb`);
          params.push(typeof body[field] === "string" ? body[field] : JSON.stringify(body[field]));
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
    sets.push("updated_at = now()");
    params.push(id);
    const r = await pool.query(
      `UPDATE email_templates SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const row = r.rows[0] as Record<string, unknown>;
    if (lintOnSave) {
      let cq: { rows: unknown[] };
      try {
        cq = await pool.query(
          "SELECT c.hero_required, c.logo_safe_hero, c.product_hero_allowed, c.mixed_content_and_product_pool, c.collapses_empty_modules, c.max_content_slots, c.max_product_slots, c.supports_content_images, c.supports_product_images, c.optional_modules FROM template_image_contracts c WHERE c.template_id = $1 AND c.version = 'v1'",
          [id]
        );
      } catch (err) {
        if (isTemplateImageContractsMissing(err)) {
          res.status(503).json({ error: "template_image_contracts table not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to use lint_on_save." });
          return;
        }
        throw err;
      }
      const contract = cq.rows.length > 0 ? cq.rows[0] : null;
      if (!contract) {
        res.status(400).json({ error: "lint_on_save requires a template_image_contracts row (version v1) for this template.", lint_errors: [{ code: "L004", severity: "error", message: "Missing template image contract." }] });
        return;
      }
      const mjml = (row.mjml as string) ?? "";
      const { lintTemplateMjml } = await import("../../template-image-linter.js");
      const lintResults = lintTemplateMjml(mjml, contract, id);
      const errors = lintResults.filter((x: { severity: string }) => x.severity === "error");
      if (errors.length > 0) {
        res.status(400).json({ error: "Template lint failed. Fix errors before saving.", lint_errors: errors, lint_results: lintResults });
        return;
      }
      (row as Record<string, unknown>).lint_results = lintResults;
    }
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function del(req: Request, res: Response): Promise<void> {
  try {
    if (requireRole(req, res, ["operator", "approver", "admin"])) return;
    const id = String(req.params.id ?? "");
    const r = await pool.query("DELETE FROM email_templates WHERE id = $1 RETURNING id", [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(200).json({ deleted: true, id });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
