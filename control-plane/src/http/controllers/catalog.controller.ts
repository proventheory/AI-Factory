import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

/** GET /v1/catalog/products */
export async function listCatalogProducts(req: Request, res: Response): Promise<void> {
  try {
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    if (!brand_profile_id) return void res.status(400).json({ error: "brand_profile_id is required" });
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const r = await pool.query(
      "SELECT id, brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, metadata_json, created_at FROM brand_catalog_products WHERE brand_profile_id = $1 ORDER BY name LIMIT $2 OFFSET $3",
      [brand_profile_id, limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** POST /v1/catalog/products */
export async function upsertCatalogProduct(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { brand_profile_id?: string; source_system?: string; external_ref?: string; name?: string; description?: string; image_url?: string; price_cents?: number; currency?: string; metadata_json?: unknown };
    const { brand_profile_id, source_system, external_ref } = body;
    if (!brand_profile_id || !source_system || !external_ref) {
      return void res.status(400).json({ error: "brand_profile_id, source_system, and external_ref are required" });
    }
    const r = await pool.query(
      `INSERT INTO brand_catalog_products (brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (brand_profile_id, source_system, external_ref) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, brand_catalog_products.name),
         description = COALESCE(EXCLUDED.description, brand_catalog_products.description),
         image_url = COALESCE(EXCLUDED.image_url, brand_catalog_products.image_url),
         price_cents = COALESCE(EXCLUDED.price_cents, brand_catalog_products.price_cents),
         currency = COALESCE(EXCLUDED.currency, brand_catalog_products.currency),
         metadata_json = COALESCE(EXCLUDED.metadata_json, brand_catalog_products.metadata_json),
         updated_at = now()
       RETURNING id, brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, metadata_json, created_at, updated_at`,
      [brand_profile_id, source_system, external_ref, body.name ?? null, body.description ?? null, body.image_url ?? null, body.price_cents ?? null, body.currency ?? "USD", body.metadata_json != null ? JSON.stringify(body.metadata_json) : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
