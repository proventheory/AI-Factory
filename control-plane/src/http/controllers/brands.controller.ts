import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { pool } from "../../db.js";
import { tokenizeBrandFromUrl } from "../../brand-tokenize-from-url.js";
import { DESIGN_TOKENS_NON_TOKEN_KEYS } from "../lib/metadata-guards.js";
import { syncDesignTokensFlat } from "../lib/design-tokens.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(s: string): boolean {
  return UUID_REGEX.test(s);
}

function isBrandAssetsMissing(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation\s+["']?brand_assets["']?\s+does not exist/i.test(msg);
}

/** GET /v1/brand_profiles — list with filters and pagination */
export async function listBrandProfiles(req: Request, res: Response): Promise<void> {
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
}

/** GET /v1/brand_profiles/:id */
export async function getBrandProfile(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query("SELECT * FROM brand_profiles WHERE id = $1", [id]);
    if (r.rows.length === 0) return void res.status(404).json({ error: "Not found" });
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
}

/** GET /v1/brand_profiles/:id/usage */
export async function getBrandProfileUsage(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
    const [initCount, runsResult, docTplCount, emailTplCount] = await Promise.all([
      pool.query("SELECT count(*)::int AS c FROM initiatives WHERE brand_profile_id = $1", [id]),
      pool.query(
        `SELECT count(*)::int AS runs_count, max(r.started_at) AS last_run_at
         FROM runs r JOIN plans p ON p.id = r.plan_id JOIN initiatives i ON i.id = p.initiative_id
         WHERE i.brand_profile_id = $1`,
        [id]
      ),
      pool.query("SELECT count(*)::int AS c FROM document_templates WHERE brand_profile_id = $1", [id]),
      pool.query("SELECT count(*)::int AS c FROM email_templates WHERE brand_profile_id = $1", [id]),
    ]);
    const initiatives_count = initCount.rows[0]?.c ?? 0;
    const runs_count = runsResult.rows[0]?.runs_count ?? 0;
    const last_run_at = runsResult.rows[0]?.last_run_at ?? null;
    const document_templates_count = docTplCount.rows[0]?.c ?? 0;
    const email_templates_count = emailTplCount.rows[0]?.c ?? 0;
    res.json({
      initiatives_count,
      runs_count,
      last_run_at,
      document_templates_count,
      email_templates_count,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** POST /v1/brand_profiles/prefill_from_url */
export async function prefillBrandFromUrl(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { url?: string };
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return void res.status(400).json({ error: "url is required" });
    const result = await tokenizeBrandFromUrl(url);
    if (result.logo_url && !/supabase\.co\/storage\/v1\/object\/public\/upload\//.test(result.logo_url)) {
      try {
        const { copyImageToCdn } = await import("../../campaign-images-storage.js");
        const cdn = await copyImageToCdn(result.logo_url);
        if (cdn?.cdn_url) result.logo_url = cdn.cdn_url;
      } catch (_e) {
        // keep original logo_url if copy fails
      }
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** POST /v1/brand_profiles */
export async function createBrandProfile(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      name: string; slug?: string; identity?: unknown; tone?: unknown; visual_style?: unknown; copy_style?: unknown;
      design_tokens?: unknown; deck_theme?: unknown; report_theme?: unknown;
    };
    if (!body.name) return void res.status(400).json({ error: "name required" });
    if (body.design_tokens != null && typeof body.design_tokens === "object" && !Array.isArray(body.design_tokens)) {
      const dt = body.design_tokens as Record<string, unknown>;
      for (const key of DESIGN_TOKENS_NON_TOKEN_KEYS) {
        if (Object.prototype.hasOwnProperty.call(dt, key)) {
          console.warn(
            `[brand_profiles] design_tokens should not contain "${key}"; use initiative or email_design_generator_metadata. See docs/SCHEMA_JSON_GUARDRAILS.md.`
          );
          break;
        }
      }
    }
    const slug =
      (typeof body.slug === "string" && body.slug.trim())
        ? body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const r = await pool.query(
      `INSERT INTO brand_profiles (name, slug, identity, tone, visual_style, copy_style, design_tokens, deck_theme, report_theme)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb) RETURNING *`,
      [
        body.name,
        slug,
        JSON.stringify(body.identity ?? {}),
        JSON.stringify(body.tone ?? {}),
        JSON.stringify(body.visual_style ?? {}),
        JSON.stringify(body.copy_style ?? {}),
        JSON.stringify(body.design_tokens ?? {}),
        JSON.stringify(body.deck_theme ?? {}),
        JSON.stringify(body.report_theme ?? {}),
      ]
    );
    const inserted = r.rows[0] as { id: string; design_tokens?: unknown };
    if (body.design_tokens && inserted?.id) {
      await syncDesignTokensFlat(inserted.id, body.design_tokens);
    }
    res.status(201).json(inserted);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** PUT /v1/brand_profiles/:id */
export async function updateBrandProfile(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
    const body = req.body as Record<string, unknown>;
    if (body.design_tokens != null && typeof body.design_tokens === "object" && !Array.isArray(body.design_tokens)) {
      const dt = body.design_tokens as Record<string, unknown>;
      for (const key of DESIGN_TOKENS_NON_TOKEN_KEYS) {
        if (Object.prototype.hasOwnProperty.call(dt, key)) {
          console.warn(
            `[brand_profiles] design_tokens should not contain "${key}"; use initiative or email_design_generator_metadata. See docs/SCHEMA_JSON_GUARDRAILS.md.`,
            { brand_id: id }
          );
          break;
        }
      }
    }
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
    if (sets.length === 0) return void res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = now()");
    params.push(id);
    const r = await pool.query(
      `UPDATE brand_profiles bp SET ${sets.join(", ")} WHERE bp.id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return void res.status(404).json({ error: "Not found" });
    const updated = r.rows[0] as { design_tokens?: unknown };
    if (body.design_tokens !== undefined && updated.design_tokens) {
      await syncDesignTokensFlat(id, updated.design_tokens);
    }
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** DELETE /v1/brand_profiles/:id */
export async function deleteBrandProfile(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
    const permanent = req.query.permanent === "true" || req.query.permanent === "1";
    if (permanent) {
      const r = await pool.query("DELETE FROM brand_profiles WHERE id = $1 RETURNING id", [id]);
      if (r.rows.length === 0) return void res.status(404).json({ error: "Not found" });
      res.json({ id: r.rows[0].id, deleted: true });
    } else {
      const r = await pool.query(
        "UPDATE brand_profiles SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id, status",
        [id]
      );
      if (r.rows.length === 0) return void res.status(404).json({ error: "Not found" });
      res.json(r.rows[0]);
    }
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/organizations */
export async function listOrganizations(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const slug = req.query.slug as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (slug) { conditions.push(`slug = $${i++}`); params.push(slug); }
    params.push(limit, offset);
    const r = await pool.query(
      `SELECT id, name, slug, metadata_json, created_at FROM organizations WHERE ${conditions.join(" AND ")} ORDER BY name LIMIT $${i} OFFSET $${i + 1}`,
      params
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/stores */
export async function listStores(req: Request, res: Response): Promise<void> {
  try {
    const scope_key = req.query.scope_key as string | undefined;
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (scope_key) { conditions.push(`scope_key = $${i++}`); params.push(scope_key); }
    if (brand_profile_id) { conditions.push(`brand_profile_id = $${i++}`); params.push(brand_profile_id); }
    params.push(limit, offset);
    const r = await pool.query(
      `SELECT id, scope_key, channel, external_ref, name, brand_profile_id, created_at FROM stores WHERE ${conditions.join(" AND ")} ORDER BY name LIMIT $${i} OFFSET $${i + 1}`,
      params
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/brand_profiles/:id/embeddings */
export async function listBrandEmbeddings(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
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
}

/** POST /v1/brand_profiles/:id/embeddings */
export async function createBrandEmbedding(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
    const body = req.body as { content: string; embedding_type: string; metadata?: unknown };
    if (!body.content || !body.embedding_type) return void res.status(400).json({ error: "content and embedding_type required" });
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
}

/** POST /v1/brand_profiles/:id/embeddings/search */
export async function searchBrandEmbeddings(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
    // TODO: Implement vector similarity search once embeddings are pre-computed by a separate service.
    res.json({ results: [] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** DELETE /v1/brand_profiles/:id/embeddings/:eid */
export async function deleteBrandEmbedding(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const eid = String(req.params.eid ?? "");
    if (!isValidUuid(id) || !isValidUuid(eid)) return void res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query(
      "DELETE FROM brand_embeddings WHERE id = $1 AND brand_profile_id = $2 RETURNING id",
      [eid, id]
    );
    if (r.rows.length === 0) return void res.status(404).json({ error: "Not found" });
    res.status(200).json({ deleted: true, id: eid });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** GET /v1/brand_profiles/:id/assets */
export async function listBrandAssets(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
    const asset_type = req.query.asset_type as string | undefined;
    let q = "SELECT * FROM brand_assets WHERE brand_profile_id = $1";
    const params: unknown[] = [id];
    if (asset_type) { q += " AND asset_type = $2"; params.push(asset_type); }
    q += " ORDER BY created_at";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    if (isBrandAssetsMissing(e)) {
      res.status(200).json({ items: [] });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** POST /v1/brand_profiles/:id/assets */
export async function createBrandAsset(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    if (!isValidUuid(id)) return void res.status(400).json({ error: "Invalid UUID" });
    const body = req.body as { asset_type: string; uri: string; filename?: string; mime_type?: string; metadata?: unknown };
    if (!body.asset_type || !body.uri) return void res.status(400).json({ error: "asset_type and uri required" });
    const aid = uuid();
    await pool.query(
      `INSERT INTO brand_assets (id, brand_profile_id, asset_type, uri, filename, mime_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [aid, id, body.asset_type, body.uri, body.filename ?? null, body.mime_type ?? null, body.metadata ? JSON.stringify(body.metadata) : null]
    );
    const r = await pool.query("SELECT * FROM brand_assets WHERE id = $1", [aid]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (isBrandAssetsMissing(e)) {
      res.status(503).json({ error: "brand_assets table does not exist. Run migration 20250303000007_brand_engine.sql." });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

/** DELETE /v1/brand_profiles/:id/assets/:aid */
export async function deleteBrandAsset(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const aid = String(req.params.aid ?? "");
    if (!isValidUuid(id) || !isValidUuid(aid)) return void res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query(
      "DELETE FROM brand_assets WHERE id = $1 AND brand_profile_id = $2 RETURNING id",
      [aid, id]
    );
    if (r.rows.length === 0) return void res.status(404).json({ error: "Not found" });
    res.status(200).json({ deleted: true, id: aid });
  } catch (e) {
    if (isBrandAssetsMissing(e)) {
      res.status(503).json({ error: "brand_assets table does not exist. Run migration 20250303000007_brand_engine.sql." });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}
