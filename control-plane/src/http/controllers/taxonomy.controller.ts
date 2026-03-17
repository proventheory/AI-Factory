import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

/** GET /v1/taxonomy/websites */
export async function listTaxonomyWebsites(req: Request, res: Response): Promise<void> {
  try {
    const organization_id = req.query.organization_id as string | undefined;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    let q = "SELECT id, organization_id, airtable_base_id, airtable_record_id, name, status, url, created_at FROM taxonomy_websites WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (organization_id) { q += ` AND organization_id = $${i++}`; params.push(organization_id); }
    q += ` ORDER BY name LIMIT $${i} OFFSET $${i + 1}`;
    params.push(limit, offset);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/taxonomy/websites/:id/vocabularies */
export async function listWebsiteVocabularies(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query(
      "SELECT id, website_id, airtable_record_id, name, visibility, created_at FROM taxonomy_vocabularies WHERE website_id = $1 ORDER BY name",
      [id]
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/taxonomy/vocabularies/:id/terms */
export async function listVocabularyTerms(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const r = await pool.query(
      "SELECT id, vocabulary_id, website_id, airtable_record_id, term_name, published_status, family_type, term_id_external, url_value, created_at FROM taxonomy_terms WHERE vocabulary_id = $1 ORDER BY term_name LIMIT $2",
      [id, limit]
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
