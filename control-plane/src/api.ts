import express from "express";
import cors from "cors";
import * as Sentry from "@sentry/node";
import { v4 as uuid } from "uuid";
import mjml2html from "mjml";
import { pool, withTransaction } from "./db.js";
import { createRun, completeApprovalAndAdvance } from "./scheduler.js";
import { executeRollback, routeRun } from "./release-manager.js";
import { triggerNoArtifactsRemediationForRun, triggerBadArtifactsRemediationForRun } from "./no-artifacts-self-heal.js";
import { fetchSitemapProducts, type SitemapType } from "./sitemap-products.js";
import { productsFromUrl, type ProductsFromUrlType } from "./products-from-url.js";
import { tokenizeBrandFromUrl } from "./brand-tokenize-from-url.js";
import type { Contract } from "./template-image-validators.js";

const app = express();
// CORS: allow comma-separated origins (e.g. multiple Vercel URLs) or "*"
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
const allowedOrigins = corsOrigin === "*" ? "*" : corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** $ per 1M tokens [input, output]. Order: more specific model names first. */
const LLM_PRICING: { prefix: string; input: number; output: number }[] = [
  { prefix: "gpt-4o-mini", input: 0.15, output: 0.6 },
  { prefix: "gpt-4o", input: 2.5, output: 10 },
  { prefix: "gpt-4-turbo", input: 10, output: 30 },
  { prefix: "o1-mini", input: 3, output: 12 },
  { prefix: "o1", input: 15, output: 60 },
  { prefix: "gpt-4", input: 10, output: 30 },
  { prefix: "gpt-3.5", input: 0.5, output: 1.5 },
  { prefix: "claude-3-5-sonnet", input: 3, output: 15 },
  { prefix: "claude-3-5-haiku", input: 0.25, output: 1.25 },
  { prefix: "claude-3-opus", input: 15, output: 75 },
  { prefix: "claude-3-sonnet", input: 3, output: 15 },
  { prefix: "claude-3-haiku", input: 0.25, output: 1.25 },
  { prefix: "claude-3", input: 3, output: 15 },
  { prefix: "claude-sonnet", input: 3, output: 15 },
  { prefix: "claude-opus", input: 15, output: 75 },
  { prefix: "claude-haiku", input: 0.25, output: 1.25 },
  { prefix: "claude", input: 3, output: 15 },
];

function llmProvider(modelId: string): "OpenAI" | "Anthropic" | "Other" {
  const id = (modelId || "").toLowerCase();
  if (id.startsWith("gpt-") || id.startsWith("o1-") || id.startsWith("o1")) return "OpenAI";
  if (id.startsWith("claude")) return "Anthropic";
  return "Other";
}

function llmCostUsd(modelId: string, tokensIn: number, tokensOut: number): number {
  const inM = (tokensIn || 0) / 1_000_000;
  const outM = (tokensOut || 0) / 1_000_000;
  const id = (modelId || "").toLowerCase();
  for (const p of LLM_PRICING) {
    if (id.startsWith(p.prefix)) return inM * p.input + outM * p.output;
  }
  return inM * 1 + outM * 2; // default $1 / $2 per 1M
}

/** DB enum risk_level is 'low' | 'med' | 'high'. Normalize 'medium' -> 'med' so old clients never break. */
function normalizeRiskLevel(s: string | undefined): "low" | "med" | "high" {
  if (s === "medium") return "med";
  if (s === "low" || s === "med" || s === "high") return s;
  return "med";
}

/** RBAC stub: resolve role from header or JWT. In production use Supabase Auth + custom claim. Default operator so Console can compile/start without auth. */
function getRole(_req: express.Request): "viewer" | "operator" | "approver" | "admin" {
  const role = _req.headers["x-role"] as string | undefined;
  if (role === "admin" || role === "approver" || role === "operator" || role === "viewer") return role;
  return "operator";
}

/** Flatten design_tokens for brand_design_tokens_flat. Returns { path, value_text, value_json, type, group }[] */
function flattenDesignTokens(obj: unknown, prefix = ""): { path: string; value_text: string | null; value_json: unknown; type: string; group: string }[] {
  const out: { path: string; value_text: string | null; value_json: unknown; type: string; group: string }[] = [];
  if (obj == null) return out;
  const group = prefix ? prefix.split(".")[0] : "";
  if (typeof obj === "string") {
    out.push({ path: prefix, value_text: obj, value_json: null, type: "string", group });
    return out;
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    out.push({ path: prefix, value_text: String(obj), value_json: obj, type: typeof obj, group });
    return out;
  }
  if (Array.isArray(obj)) {
    out.push({ path: prefix, value_text: null, value_json: obj, type: "array", group });
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      out.push(...flattenDesignTokens(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}

/** Sync design_tokens to brand_design_tokens_flat. No-op if table does not exist. */
async function syncDesignTokensFlat(brandId: string, designTokens: unknown): Promise<void> {
  const flat = flattenDesignTokens(designTokens);
  if (flat.length === 0) return;
  try {
    await pool.query("DELETE FROM brand_design_tokens_flat WHERE brand_id = $1", [brandId]);
    for (const row of flat) {
      await pool.query(
        `INSERT INTO brand_design_tokens_flat (brand_id, path, value, value_json, type, "group", updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, now())
         ON CONFLICT (brand_id, path) DO UPDATE SET value = $3, value_json = $4::jsonb, type = $5, "group" = $6, updated_at = now()`,
        [
          brandId,
          row.path,
          row.value_text,
          row.value_json != null ? JSON.stringify(row.value_json) : null,
          row.type,
          row.group || "root",
        ]
      );
    }
  } catch (e) {
    if ((e as { code?: string }).code !== "42P01") throw e;
    // 42P01 = undefined_table; ignore if migration not run
  }
}

/** GET /health */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "control-plane" });
});

/** GET /health/db — check DB connectivity; returns safe database_hint (host/port) so you can verify Control Plane and Runner use the same DB */
app.get("/health/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const url = process.env.DATABASE_URL;
    let database_hint: { host?: string; port?: string } | undefined;
    if (url && typeof url === "string") {
      try {
        const u = new URL(url.replace(/^postgres:\/\//, "postgresql://"));
        database_hint = { host: u.hostname || undefined, port: u.port || undefined };
      } catch {
        database_hint = { host: "(parse error)" };
      }
    }
    res.json({ status: "ok", db: "connected", database_hint });
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
    if (risk_level) {
      const normalized = normalizeRiskLevel(risk_level);
      // #region agent log
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H3", location: "api.ts:GET initiatives", message: "risk_level filter", data: { raw: risk_level, normalized }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      conditions.push(`risk_level = $${i++}`); params.push(normalized);
    }
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

/** GET /v1/email_campaigns — list initiatives with intent_type = email_campaign + metadata */
app.get("/v1/email_campaigns", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      `SELECT i.id, i.title, i.intent_type, i.risk_level, i.created_at,
              m.subject_line, m.from_name, m.from_email, m.template_artifact_id, m.audience_segment_ref, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_campaign_metadata m ON m.initiative_id = i.id
       WHERE i.intent_type = 'email_campaign'
       ORDER BY i.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/email_campaigns/:id — single email campaign (initiative + metadata) */
app.get("/v1/email_campaigns/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const fullSelect = `SELECT i.id, i.title, i.created_at, i.brand_profile_id, i.template_id, m.subject_line, m.from_name, m.from_email, m.reply_to, m.template_artifact_id, m.audience_segment_ref, m.metadata_json, m.created_at AS metadata_created_at, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_campaign_metadata m ON m.initiative_id = i.id
       WHERE i.id = $1 AND i.intent_type = 'email_campaign'`;
    const minimalSelect = `SELECT i.id, i.title, i.created_at, i.template_id, m.subject_line, m.from_name, m.from_email, m.reply_to, m.template_artifact_id, m.audience_segment_ref, m.metadata_json, m.created_at AS metadata_created_at, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_campaign_metadata m ON m.initiative_id = i.id
       WHERE i.id = $1 AND i.intent_type = 'email_campaign'`;
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
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const row = r.rows[0] as Record<string, unknown>;
    if (row.template_id == null && row.metadata_json != null && typeof row.metadata_json === "object" && (row.metadata_json as Record<string, unknown>).template_id != null) {
      row.template_id = (row.metadata_json as Record<string, unknown>).template_id;
    }
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/email_campaigns — create initiative (email_campaign) + optional metadata */
app.post("/v1/email_campaigns", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as {
      title?: string;
      subject_line?: string;
      from_name?: string;
      from_email?: string;
      brand_profile_id?: string;
      template_id?: string;
      template_artifact_id?: string;
      metadata_json?: unknown;
      risk_level?: string; // normalized; DB enum is low|med|high only
    };
    const id = uuid();
    // #region agent log
    fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H1", location: "api.ts:POST email_campaigns", message: "body.risk_level and resolved riskLevel", data: { body_risk_level: body.risk_level, has_risk_level: "risk_level" in body }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    const riskLevel = normalizeRiskLevel(body.risk_level) ?? "med"; // always normalize so "medium" -> "med" if client sends it
    // #region agent log
    fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H5", location: "api.ts:INSERT initiatives", message: "riskLevel passed to DB", data: { riskLevel, paramOrder: "id,title,brand_profile_id,template_id,riskLevel" }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    const err = (e: unknown) => (e as { code?: string; message?: string }).code === "42703" || String((e as Error).message).includes("brand_profile_id");
    try {
      await pool.query(
        `INSERT INTO initiatives (id, intent_type, title, risk_level, brand_profile_id, template_id) VALUES ($1, 'email_campaign', $2, $5, $3, $4)`,
        [id, body.title ?? "New email campaign", body.brand_profile_id ?? null, body.template_id ?? null, riskLevel]
      );
    } catch (e) {
      // #region agent log
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H2", location: "api.ts:POST email_campaigns catch", message: "INSERT initiatives fallback", data: { error: String((e as Error).message).slice(0, 80), has_template_id: !!body.template_id }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      if (err(e)) {
        try {
          await pool.query(
            `INSERT INTO initiatives (id, intent_type, title, risk_level, template_id) VALUES ($1, 'email_campaign', $2, $3, $4)`,
            [id, body.title ?? "New email campaign", riskLevel, body.template_id ?? null]
          );
        } catch (e2) {
          if ((e2 as { code?: string }).code === "42703") {
            await pool.query(
              `INSERT INTO initiatives (id, intent_type, title, risk_level) VALUES ($1, 'email_campaign', $2, $3)`,
              [id, body.title ?? "New email campaign", riskLevel]
            );
          } else throw e2;
        }
      } else throw e;
    }
    const metadataForDb = body.metadata_json != null && typeof body.metadata_json === "object"
      ? { ...(body.metadata_json as Record<string, unknown>), template_id: body.template_id ?? (body.metadata_json as Record<string, unknown>).template_id }
      : (body.template_id ? { template_id: body.template_id } : null);
    await pool.query(
      `INSERT INTO email_campaign_metadata (initiative_id, subject_line, from_name, from_email, template_artifact_id, metadata_json) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
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
       FROM initiatives i LEFT JOIN email_campaign_metadata m ON m.initiative_id = i.id WHERE i.id = $1`,
      [id]
    );
    const row = r.rows[0] as Record<string, unknown>;
    res.status(201).json({ ...row, brand_profile_id: body.brand_profile_id ?? null, template_id: body.template_id ?? null });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PATCH /v1/email_campaigns/:id — update campaign metadata (upsert) */
app.patch("/v1/email_campaigns/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const id = req.params.id;
    const exists = await pool.query("SELECT id FROM initiatives WHERE id = $1 AND intent_type = 'email_campaign'", [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const body = req.body as Record<string, unknown>;
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
      `INSERT INTO email_campaign_metadata (initiative_id, subject_line, from_name, from_email)
       VALUES ($1, null, null, null)
       ON CONFLICT (initiative_id) DO UPDATE SET ${updates.join(", ")}
       RETURNING *`,
      params
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/sitemap/products — fetch products from sitemap URL (port from email-marketing-factory campaigns route) */
app.post("/v1/sitemap/products", async (req, res) => {
  try {
    const body = req.body as {
      sitemap_url?: string;
      sitemap_type?: string;
      page?: number;
      limit?: number;
    };
    const sitemap_url = body.sitemap_url;
    const sitemap_type = body.sitemap_type as SitemapType | undefined;
    if (!sitemap_url || !sitemap_type) {
      return res.status(400).json({ error: "sitemap_url and sitemap_type are required" });
    }
    const allowedTypes: SitemapType[] = ["drupal", "ecommerce", "bigcommerce", "shopify"];
    if (!allowedTypes.includes(sitemap_type)) {
      return res.status(400).json({
        error: `sitemap_type must be one of: ${allowedTypes.join(", ")}`,
      });
    }
    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));
    const result = await fetchSitemapProducts({
      sitemap_url,
      sitemap_type,
      page,
      limit,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/products/from_url — fetch products from XML sitemap or JSON URL (e.g. Shopify collection). Same response shape as sitemap/products. */
app.post("/v1/products/from_url", async (req, res) => {
  try {
    const body = req.body as {
      url?: string;
      type?: string;
      sitemap_type?: string;
      limit?: number;
    };
    const url = body.url;
    const type = body.type as ProductsFromUrlType | undefined;
    if (!url || !type) {
      return res.status(400).json({ error: "url and type are required" });
    }
    const allowed: ProductsFromUrlType[] = ["shopify_json", "sitemap_xml"];
    if (!allowed.includes(type)) {
      return res.status(400).json({
        error: "type must be one of: shopify_json, sitemap_xml",
      });
    }
    if (type === "sitemap_xml") {
      const st = body.sitemap_type as SitemapType | undefined;
      const allowedSt: SitemapType[] = ["drupal", "ecommerce", "bigcommerce", "shopify"];
      if (!st || !allowedSt.includes(st)) {
        return res.status(400).json({
          error: "sitemap_type is required when type is sitemap_xml and must be one of: " + allowedSt.join(", "),
        });
      }
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || 20));
    const result = await productsFromUrl({
      url,
      type,
      sitemap_type: type === "sitemap_xml" ? (body.sitemap_type as SitemapType) : undefined,
      limit,
    });
    res.json(result);
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
    const allowed = ["intent_type", "title", "risk_level", "goal_state", "source_ref", "template_id", "priority", "brand_profile_id"];
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const field of allowed) {
      if (body[field] !== undefined) {
        if (field === "risk_level") {
          sets.push(`${field} = $${i++}::risk_level`);
          params.push(normalizeRiskLevel(body[field] as string));
        } else {
          sets.push(`${field} = $${i++}`);
          params.push(body[field]);
        }
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
      goal_state?: string; goal_metadata?: Record<string, unknown>; source_ref?: string; template_id?: string; priority?: number; brand_profile_id?: string | null;
    };
    const { intent_type, title, risk_level, created_by, goal_state, goal_metadata, source_ref, template_id, priority, brand_profile_id } = body;
    if (!intent_type || !risk_level) return res.status(400).json({ error: "intent_type and risk_level required" });
    const rl = normalizeRiskLevel(risk_level);
    const r = await pool.query(
      `INSERT INTO initiatives (intent_type, title, risk_level, created_by, goal_state, goal_metadata, source_ref, template_id, priority, brand_profile_id)
       VALUES ($1,$2,$3::risk_level,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`,
      [
        intent_type, title ?? null, rl, created_by ?? null,
        goal_state ?? null, goal_metadata ? JSON.stringify(goal_metadata) : null, source_ref ?? null, template_id ?? null, priority ?? 0, brand_profile_id ?? null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42703") {
      return pool.query(
`INSERT INTO initiatives (intent_type, title, risk_level, created_by) VALUES ($1,$2,$3::risk_level,$4) RETURNING *`,
      [(req.body as { intent_type: string }).intent_type, (req.body as { title?: string }).title ?? null, normalizeRiskLevel((req.body as { risk_level: string }).risk_level), (req.body as { created_by?: string }).created_by ?? null]
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
    if (status) { conditions.push(`r.status::text = $${i++}`); params.push(status); }
    if (cohort) { conditions.push(`r.cohort = $${i++}`); params.push(cohort); }
    const intent_type = req.query.intent_type as string | undefined;
    if (intent_type) { conditions.push(`i.intent_type = $${i++}`); params.push(intent_type); }
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
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/runs/:id — full flight recorder (run + plan + node_progress + job_runs + artifacts + events). Includes initiative_id from plan for runner fallback. */
app.get("/v1/runs/:id", async (req, res) => {
  try {
    const runId = req.params.id;
    const [run, planRow, planNodes, planEdges, nodeProgress, jobRuns, runArtifacts, runEvents] = await Promise.all([
      pool.query("SELECT * FROM runs WHERE id = $1", [runId]).then(r => r.rows[0]),
      pool.query("SELECT p.initiative_id FROM plans p JOIN runs r ON r.plan_id = p.id WHERE r.id = $1", [runId]).then(r => r.rows[0] ?? null),
      pool.query("SELECT pn.* FROM plans p JOIN plan_nodes pn ON pn.plan_id = p.id WHERE p.id = (SELECT plan_id FROM runs WHERE id = $1)", [runId]).then(r => r.rows),
      pool.query("SELECT pe.* FROM plans p JOIN plan_edges pe ON pe.plan_id = p.id WHERE p.id = (SELECT plan_id FROM runs WHERE id = $1)", [runId]).then(r => r.rows),
      pool.query("SELECT * FROM node_progress WHERE run_id = $1", [runId]).then(r => r.rows),
      pool.query("SELECT jr.* FROM job_runs jr WHERE jr.run_id = $1 ORDER BY plan_node_id, attempt DESC", [runId]).then(r => r.rows),
      pool.query("SELECT * FROM artifacts WHERE run_id = $1 ORDER BY created_at", [runId]).then(r => r.rows),
      pool.query("SELECT * FROM run_events WHERE run_id = $1 ORDER BY created_at", [runId]).then(r => r.rows),
    ]);
    if (!run) return res.status(404).json({ error: "Run not found" });
    const initiative_id = (planRow as { initiative_id?: string } | null)?.initiative_id ?? null;
    res.json({ run: { ...run, initiative_id }, initiative_id, plan_nodes: planNodes, plan_edges: planEdges, node_progress: nodeProgress, job_runs: jobRuns, artifacts: runArtifacts, run_events: runEvents });
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
    if (r.rows.length === 0) setImmediate(() => triggerNoArtifactsRemediationForRun(runId));
    else setImmediate(() => triggerBadArtifactsRemediationForRun(runId));
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

/** GET /v1/runs/:id/log_entries — list log entries for a run (paginated). Query: limit, offset, source, order=asc|desc. */
app.get("/v1/runs/:id/log_entries", async (req, res) => {
  try {
    const runId = req.params.id;
    const exists = await pool.query("SELECT id FROM runs WHERE id = $1", [runId]);
    if (exists.rows.length === 0) return res.status(404).json({ error: "Run not found" });
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
      return res.status(503).json({
        error: "run_log_entries table not present. Run migration 20250312000000_run_log_entries.sql to enable log mirror.",
      });
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
});

/** POST /v1/runs/:id/ingest_logs — trigger one-off log ingest for this run's time window (for Logs tab). */
app.post("/v1/runs/:id/ingest_logs", async (req, res) => {
  try {
    const runId = req.params.id;
    const runRow = await pool.query("SELECT id, created_at, updated_at FROM runs WHERE id = $1", [runId]);
    if (runRow.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    const { ingestRunLogsOneOff } = await import("./render-log-ingest.js");
    const result = await ingestRunLogsOneOff(runId, runRow.rows[0] as { created_at: Date; updated_at: Date });
    res.status(200).json({ ok: true, ingested: result.ingested, message: result.message });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42P01" || (typeof err.message === "string" && err.message.includes("run_log_entries"))) {
      return res.status(503).json({
        error: "run_log_entries table not present. Run migration 20250312000000_run_log_entries.sql to enable log mirror.",
      });
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
});

/** POST /v1/runs/:id/image_assignment — persist image assignment from runner (email_generate_mjml). Body: ImageAssignment JSON. */
app.post("/v1/runs/:id/image_assignment", async (req, res) => {
  try {
    const runId = req.params.id;
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== "object") return res.status(400).json({ error: "Body must be ImageAssignment JSON object" });
    const r = await pool.query(
      "UPDATE runs SET image_assignment_json = $2::jsonb WHERE id = $1 RETURNING id",
      [runId, JSON.stringify(body)]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    res.status(200).json({ ok: true, run_id: runId });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42703" || (typeof err.message === "string" && err.message.includes("image_assignment_json"))) {
      return res.status(503).json({
        error: "runs.image_assignment_json column not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to enable.",
      });
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
});

/** POST /v1/runs/:id/validate_image_assignment — run V001–V012 from run.image_assignment_json + template contract, write validations. */
app.post("/v1/runs/:id/validate_image_assignment", async (req, res) => {
  try {
    const runId = req.params.id;
    let runRow: { rows: { image_assignment_json: unknown }[] };
    try {
      runRow = await pool.query("SELECT image_assignment_json FROM runs WHERE id = $1", [runId]);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "42703" || (typeof err.message === "string" && err.message.includes("image_assignment_json"))) {
        return res.status(503).json({
          error: "runs.image_assignment_json column not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to enable.",
        });
      }
      throw e;
    }
    if (runRow.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    const assignment = runRow.rows[0].image_assignment_json;
    if (!assignment || typeof assignment !== "object") return res.status(400).json({ error: "Run has no image_assignment_json" });
    const templateId = (assignment as { template_id?: string }).template_id;
    if (!templateId) return res.status(400).json({ error: "image_assignment_json missing template_id" });
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
    const { evaluateImageAssignmentValidations } = await import("./template-image-validators.js");
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
    const compiled = await withTransaction((client) =>
      compilePlan(client, initiativeId, { seed: body.seed, force: body.force })
    );
    const nodeCount = compiled.nodeIds.size;
    res.status(201).json({ id: compiled.planId, initiative_id: initiativeId, status: "draft", nodes: nodeCount, plan_hash: compiled.planHash });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Initiative not found") return res.status(404).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

/** POST /v1/plans/:id/start — create a run for this plan (get or create release, then createRun). Body: { environment?: "sandbox"|"staging"|"prod", llm_source?: "gateway"|"openai_direct" }. */
app.post("/v1/plans/:id/start", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const planId = req.params.id;
    const body = req.body as { environment?: string; llm_source?: string };
    const environment = body?.environment ?? "sandbox";
    const llmSource = body?.llm_source === "openai_direct" ? "openai_direct" as const : "gateway" as const;
    if (!["sandbox", "staging", "prod"].includes(environment)) {
      return res.status(400).json({ error: "environment must be sandbox, staging, or prod" });
    }
    const planRow = await pool.query("SELECT id, initiative_id FROM plans WHERE id = $1", [planId]);
    if (planRow.rows.length === 0) return res.status(404).json({ error: "Plan not found" });
    const initiativeId = (planRow.rows[0] as { initiative_id: string }).initiative_id;
    const initRow = await pool.query("SELECT template_id, intent_type FROM initiatives WHERE id = $1", [initiativeId]);
    if (initRow.rows.length > 0) {
      const { template_id: templateId, intent_type: intentType } = initRow.rows[0] as { template_id: string | null; intent_type: string };
      if (intentType === "email_campaign" && templateId) {
        const gate = await runTemplateLintGate(pool, templateId);
        if (!gate.ok) {
          const message = "Template lint failed: " + gate.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
          return res.status(400).json({ error: message, lint_errors: gate.errors });
        }
      }
    }

    let releaseId: string;
    try {
      const route = await routeRun(pool, environment as "sandbox" | "staging" | "prod");
      releaseId = route.releaseId;
    } catch (routeErr) {
      const msg = (routeErr as Error).message;
      if (!msg.includes("No promoted release")) throw routeErr;
      const ins = await pool.query(
        `INSERT INTO releases (id, status, percent_rollout, policy_version) VALUES ($1, 'promoted', 100, 'latest') RETURNING id`,
        [uuid()]
      );
      releaseId = ins.rows[0].id;
    }

    const runId = await withTransaction(async (client) => {
      return createRun(client, {
        planId,
        releaseId,
        policyVersion: "latest",
        environment: environment as "sandbox" | "staging" | "prod",
        cohort: "control",
        rootIdempotencyKey: `console:${planId}:${Date.now()}`,
        llmSource,
      });
    });
    res.status(201).json({ id: runId });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/runs/:id/rerun — create a new run with the same plan (Operator+) */
app.post("/v1/runs/:id/rerun", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const runId = req.params.id;
    let r = await pool.query(
      "SELECT plan_id, release_id, policy_version, environment, cohort, llm_source FROM runs WHERE id = $1",
      [runId]
    ).catch(() => null);
    if (!r || r.rows.length === 0) {
      r = await pool.query(
        "SELECT plan_id, release_id, policy_version, environment, cohort FROM runs WHERE id = $1",
        [runId]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: "Run not found" });
    }
    const row = r.rows[0];
    const llmSource = (row as { llm_source?: string }).llm_source === "openai_direct" ? "openai_direct" as const : "gateway" as const;
    const newRunId = await withTransaction(async (client) => {
      return createRun(client, {
        planId: row.plan_id,
        releaseId: row.release_id,
        policyVersion: row.policy_version ?? "latest",
        environment: row.environment,
        cohort: row.cohort,
        rootIdempotencyKey: `rerun:${runId}:${Date.now()}`,
        llmSource,
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
        let committed = false;
        try {
          await client.query("BEGIN");
          await completeApprovalAndAdvance(client, run_id, plan_node_id);
          await client.query("COMMIT");
          committed = true;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          if (!committed) await client.query("ROLLBACK").catch(() => {});
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
    if (status) { conditions.push(`jr.status::text = $${i++}`); params.push(status); }
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

/** GET /v1/artifacts/:id/content — artifact body for preview (e.g. landing page HTML). Use as view URL. */
app.get("/v1/artifacts/:id/content", async (req, res) => {
  try {
    const r = await pool.query("SELECT id, artifact_type, metadata_json, uri FROM artifacts WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).send("Artifact not found");
    const row = r.rows[0] as { artifact_type: string; metadata_json: { content?: string } | null; uri?: string };
    let content: string | null = row.metadata_json?.content ?? null;
    if (content == null && row.uri?.startsWith("supabase-storage://")) {
      try {
        const { downloadArtifact } = await import("../../runners/src/artifact-storage.js");
        content = await downloadArtifact(row.uri);
      } catch { /* storage not configured */ }
    }
    if (content == null) return res.status(404).send("Artifact content not available");
    const isHtml = row.artifact_type === "landing_page" || row.artifact_type === "email_template";
    res.setHeader("Content-Type", isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(content);
  } catch (e) {
    res.status(500).send(String((e as Error).message));
  }
});

/** GET /v1/artifacts/:id/analyze — analyze rendered email artifact for load failures (unreplaced placeholders, bad image src). For self-heal and template proof. */
app.get("/v1/artifacts/:id/analyze", async (req, res) => {
  try {
    const r = await pool.query("SELECT id, artifact_type, metadata_json, uri FROM artifacts WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Artifact not found" });
    const row = r.rows[0] as { artifact_type: string; metadata_json: { content?: string } | null; uri?: string };
    let content: string | null = row.metadata_json?.content ?? null;
    if (content == null && row.uri?.startsWith("supabase-storage://")) {
      try {
        const { downloadArtifact } = await import("../../runners/src/artifact-storage.js");
        content = await downloadArtifact(row.uri);
      } catch { /* storage not configured */ }
    }
    if (content == null) return res.status(404).json({ error: "Artifact content not available" });
    const { analyzeArtifactContent } = await import("./artifact-content-analyzer.js");
    const result = analyzeArtifactContent(content);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PATCH /v1/artifacts/:id — update artifact metadata_json (content and/or metadata). Primary use: email_template edit (Phase 5). Operator+ only. */
const MAX_ARTIFACT_CONTENT_BYTES = 2 * 1024 * 1024; // 2MB
app.patch("/v1/artifacts/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });

    let body: { content?: string; metadata?: Record<string, unknown> };
    try {
      body = typeof req.body === "object" && req.body !== null ? req.body : {};
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    if (body.content !== undefined && typeof body.content !== "string") return res.status(400).json({ error: "content must be a string" });
    if (body.content !== undefined && Buffer.byteLength(body.content, "utf8") > MAX_ARTIFACT_CONTENT_BYTES) return res.status(400).json({ error: "content too large" });
    if (body.metadata !== undefined) {
      if (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata)) return res.status(400).json({ error: "metadata must be a plain object" });
      if (Object.getPrototypeOf(body.metadata) !== Object.prototype) return res.status(400).json({ error: "metadata must be a plain object" });
    }

    const id = req.params.id;
    const r = await pool.query("SELECT id, metadata_json FROM artifacts WHERE id = $1", [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Artifact not found" });
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

/** GET /v1/usage — aggregate LLM usage with percentiles, error rates, provider breakdown, and estimated cost */
app.get("/v1/usage", async (req, res) => {
  try {
    const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const [byTier, byModelRows, totals, percentiles] = await Promise.all([
      pool.query(`
        SELECT model_tier, count(*)::int AS calls,
               coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
               coalesce(sum(tokens_out), 0)::bigint AS tokens_out,
               coalesce(avg(latency_ms), 0)::int AS avg_latency_ms
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
        GROUP BY model_tier ORDER BY calls DESC
      `, [from, to]).then(r => r.rows),
      pool.query(`
        SELECT model_tier, model_id,
               count(*)::int AS calls,
               coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
               coalesce(sum(tokens_out), 0)::bigint AS tokens_out
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
        GROUP BY model_tier, model_id ORDER BY calls DESC
      `, [from, to]).then(r => r.rows as { model_tier: string; model_id: string; calls: number; tokens_in: string; tokens_out: string }[]),
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

    let estimated_cost_usd = 0;
    const byProviderMap: Record<string, { calls: number; tokens_in: number; tokens_out: number; estimated_cost_usd: number }> = {};
    for (const row of byModelRows) {
      const tokensIn = Number(row.tokens_in) || 0;
      const tokensOut = Number(row.tokens_out) || 0;
      const cost = llmCostUsd(row.model_id, tokensIn, tokensOut);
      estimated_cost_usd += cost;
      const provider = llmProvider(row.model_id);
      if (!byProviderMap[provider]) {
        byProviderMap[provider] = { calls: 0, tokens_in: 0, tokens_out: 0, estimated_cost_usd: 0 };
      }
      byProviderMap[provider].calls += row.calls;
      byProviderMap[provider].tokens_in += tokensIn;
      byProviderMap[provider].tokens_out += tokensOut;
      byProviderMap[provider].estimated_cost_usd += cost;
    }
    const by_provider = Object.entries(byProviderMap).map(([provider, agg]) => ({
      provider,
      ...agg,
      estimated_cost_usd: Math.round(agg.estimated_cost_usd * 100) / 100,
    })).sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd);

    const by_model = byModelRows.map(row => {
      const tokensIn = Number(row.tokens_in) || 0;
      const tokensOut = Number(row.tokens_out) || 0;
      const cost = llmCostUsd(row.model_id, tokensIn, tokensOut);
      return {
        model_tier: row.model_tier,
        model_id: row.model_id,
        provider: llmProvider(row.model_id),
        calls: row.calls,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        estimated_cost_usd: Math.round(cost * 100) / 100,
      };
    });

    const totalsWithCost = {
      ...totals,
      estimated_cost_usd: Math.round(estimated_cost_usd * 100) / 100,
    };
    res.json({
      by_tier: byTier,
      by_provider,
      by_model,
      totals: totalsWithCost,
      percentiles,
      error_count: errorCount,
      from,
      to,
    });
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

/** POST /v1/template_proof/start — start a template proof batch (Sticky Green + all templates). Body: brand_profile_id, duration_minutes, optional template_ids. Returns 202 with batch_id. */
app.post("/v1/template_proof/start", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as { brand_profile_id?: string; duration_minutes?: number; template_ids?: string[] };
    const brandProfileId = body?.brand_profile_id;
    const durationMinutes = Math.min(Math.max(Number(body?.duration_minutes) || 30, 1), 120);
    if (!brandProfileId) return res.status(400).json({ error: "brand_profile_id is required" });
    const r = await pool.query(
      `INSERT INTO template_proof_batches (brand_profile_id, status, end_at) VALUES ($1, 'running', now() + ($2 || ' minutes')::interval) RETURNING id, status, started_at, end_at`,
      [brandProfileId, durationMinutes]
    );
    const batch = r.rows[0] as { id: string; status: string; started_at: string; end_at: string };
    setImmediate(async () => {
      try {
        const { runProofLoop } = await import("./template-proof-job.js");
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
      return res.status(503).json({ error: "template_proof_batches table not present. Run migration 20250312000001_template_proof.sql." });
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
});

/** GET /v1/template_proof — list proof runs (latest per template or by batch_id). Query: batch_id, template_id, limit, latest_per_template=1. */
app.get("/v1/template_proof", async (req, res) => {
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
      return res.json({ items: r.rows, batch_id: batchId });
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
      return res.status(503).json({ error: "template_proof_runs table not present. Run migration 20250312000001_template_proof.sql." });
    }
    res.status(500).json({ error: String(err.message ?? e) });
  }
});

/** GET /v1/template_proof/:batchId — batch detail and summary. */
app.get("/v1/template_proof/:batchId", async (req, res) => {
  try {
    const batchId = req.params.batchId;
    const batchRow = await pool.query("SELECT * FROM template_proof_batches WHERE id = $1", [batchId]);
    if (batchRow.rows.length === 0) return res.status(404).json({ error: "Batch not found" });
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
      return res.status(503).json({ error: "template_proof tables not present. Run migration 20250312000001_template_proof.sql." });
    }
    res.status(500).json({ error: String(err.message ?? e) });
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

/** GET /v1/webhook_outbox — list outbox rows (status, limit, offset) */
app.get("/v1/webhook_outbox", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const conditions = status ? ["status = $1"] : ["1=1"];
    const params: unknown[] = status ? [status, limit, offset] : [limit, offset];
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;
    const r = await pool.query(
      `SELECT * FROM webhook_outbox WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PATCH /v1/webhook_outbox/:id — update status after send attempt */
app.patch("/v1/webhook_outbox/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body as { status?: string; attempt_count?: number; last_error?: string; next_retry_at?: string | null; sent_at?: string | null };
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.status !== undefined) {
      sets.push(`status = $${i++}`);
      params.push(body.status);
    }
    if (body.attempt_count !== undefined) {
      sets.push(`attempt_count = $${i++}`);
      params.push(body.attempt_count);
    }
    if (body.last_error !== undefined) {
      sets.push(`last_error = $${i++}`);
      params.push(body.last_error);
    }
    if (body.next_retry_at !== undefined) {
      sets.push(`next_retry_at = $${i++}`);
      params.push(body.next_retry_at);
    }
    if (body.sent_at !== undefined) {
      sets.push(`sent_at = $${i++}`);
      params.push(body.sent_at);
    }
    sets.push("updated_at = now()");
    params.push(id);
    const r = await pool.query(
      `UPDATE webhook_outbox SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
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
          await withTransaction((client) => compilePlan(client, initId, { force: true }));
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
    const compiled = await withTransaction((client) => compilePlan(client, initiativeId, { force: true }));
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

/** GET /v1/analytics — run activity heatmap, cost tree, artifact breakdown (real data) */
app.get("/v1/analytics", async (req, res) => {
  try {
    const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const HOURS = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];

    const [heatmapRows, byJobType, byModel, artifactRows] = await Promise.all([
      pool.query(
        `SELECT extract(dow from started_at)::int AS dow, extract(hour from started_at)::int AS hour, count(*)::int AS c
         FROM runs WHERE started_at IS NOT NULL AND started_at BETWEEN $1 AND $2
         GROUP BY 1, 2 ORDER BY 1, 2`,
        [from, to]
      ).then(r => r.rows as { dow: number; hour: number; c: number }[]),
      pool.query(`
        SELECT pn.job_type, lc.model_tier,
               count(*)::int AS calls,
               (coalesce(sum(lc.tokens_in), 0) + coalesce(sum(lc.tokens_out), 0))::bigint AS tokens
        FROM llm_calls lc
        JOIN job_runs jr ON jr.id = lc.job_run_id
        JOIN plan_nodes pn ON pn.id = jr.plan_node_id
        WHERE lc.created_at BETWEEN $1 AND $2
        GROUP BY pn.job_type, lc.model_tier ORDER BY calls DESC
      `, [from, to]).then(r => r.rows as { job_type: string; model_tier: string; calls: number; tokens: number }[]),
      pool.query(`
        SELECT model_tier, model_id, count(*)::int AS calls,
               (coalesce(sum(tokens_in), 0) + coalesce(sum(tokens_out), 0))::bigint AS tokens
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
        GROUP BY model_tier, model_id ORDER BY calls DESC
      `, [from, to]).then(r => r.rows as { model_tier: string; model_id: string; calls: number; tokens: number }[]),
      pool.query(
        `SELECT artifact_type, count(*)::int AS c FROM artifacts WHERE created_at BETWEEN $1 AND $2 GROUP BY artifact_type ORDER BY c DESC`,
        [from, to]
      ).then(r => r.rows as { artifact_type: string; c: number }[]),
    ]);

    const heatmapByKey: Record<string, Record<number, number>> = {};
    DAYS.forEach(d => { heatmapByKey[d] = {}; for (let h = 0; h < 24; h += 2) heatmapByKey[d][h] = 0; });
    for (const row of heatmapRows) {
      const day = DAYS[row.dow];
      const hourBucket = row.hour - (row.hour % 2);
      if (day != null && hourBucket >= 0 && hourBucket < 24) (heatmapByKey[day] ??= {})[hourBucket] = (heatmapByKey[day][hourBucket] ?? 0) + row.c;
    }
    const run_activity_heatmap = DAYS.map(day => ({
      id: day,
      data: HOURS.map((h, i) => ({ x: h, y: heatmapByKey[day]?.[i * 2] ?? 0 })),
    }));

    const tierToJob: Record<string, Record<string, number>> = {};
    for (const row of byJobType) {
      const tier = row.model_tier || "default";
      if (!tierToJob[tier]) tierToJob[tier] = {};
      tierToJob[tier][row.job_type] = (tierToJob[tier][row.job_type] || 0) + Number(row.tokens);
    }
    const cost_treemap = {
      name: "Costs",
      children: Object.entries(tierToJob).map(([tier, jobs]) => ({
        name: tier,
        children: Object.entries(jobs).map(([job, value]) => ({ name: job, value: Math.max(1, Number(value)) })),
      })).filter(t => t.children.length > 0),
    };
    if (cost_treemap.children.length === 0) {
      cost_treemap.children = [{ name: "No LLM usage", children: [{ name: "—", value: 1 }] }];
    }

    const artifact_breakdown = {
      name: "Artifacts",
      children: artifactRows.length
        ? artifactRows.map(row => ({ name: row.artifact_type || "unknown", value: row.c }))
        : [{ name: "No artifacts", value: 1 }],
    };

    res.json({ run_activity_heatmap, cost_treemap, artifact_breakdown, from, to });
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

/** POST /v1/brand_profiles/prefill_from_url — fetch live site and extract tokens (colors, fonts, logo, sitemap). Logo URL is copied to our CDN so the brand record can store a stable URL. */
app.post("/v1/brand_profiles/prefill_from_url", async (req, res) => {
  try {
    const body = req.body as { url?: string };
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return res.status(400).json({ error: "url is required" });
    const result = await tokenizeBrandFromUrl(url);
    if (result.logo_url && !/supabase\.co\/storage\/v1\/object\/public\/upload\//.test(result.logo_url)) {
      try {
        const { copyImageToCdn } = await import("./campaign-images-storage.js");
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
});

/** POST /v1/brand_profiles */
app.post("/v1/brand_profiles", async (req, res) => {
  try {
    const body = req.body as {
      name: string; slug?: string; identity?: unknown; tone?: unknown; visual_style?: unknown; copy_style?: unknown;
      design_tokens?: unknown; deck_theme?: unknown; report_theme?: unknown;
    };
    if (!body.name) return res.status(400).json({ error: "name required" });
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
    const updated = r.rows[0] as { design_tokens?: unknown };
    if (body.design_tokens !== undefined && updated.design_tokens) {
      await syncDesignTokensFlat(id, updated.design_tokens);
    }
    res.json(updated);
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
    if (isBrandAssetsMissing(e)) {
      res.status(200).json({ items: [] });
      return;
    }
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
    if (isBrandAssetsMissing(e)) {
      res.status(503).json({ error: "brand_assets table does not exist. Run migration 20250303000007_brand_engine.sql." });
      return;
    }
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
    if (isBrandAssetsMissing(e)) {
      res.status(503).json({ error: "brand_assets table does not exist. Run migration 20250303000007_brand_engine.sql." });
      return;
    }
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

// =====================================================================
// Pexels proxy & campaign images CDN (Email Marketing wizard)
// =====================================================================

/** GET /v1/pexels/search — proxy to Pexels API (keeps API key server-side). Query: q, per_page, page. */
app.get("/v1/pexels/search", async (req, res) => {
  try {
    const key = process.env.PEXELS_API_KEY;
    if (!key) return res.status(503).json({ error: "Pexels API not configured (PEXELS_API_KEY)" });
    const q = (req.query.q as string)?.trim() || "nature";
    const per_page = Math.min(Math.max(Number(req.query.per_page) || 20, 1), 80);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${per_page}&page=${page}`;
    const resp = await fetch(url, { headers: { Authorization: key } });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: text || "Pexels API error" });
    }
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/campaign-images/copy — fetch image from URL and upload to our CDN (Supabase). Body: { url }. Returns { cdn_url }. */
app.post("/v1/campaign-images/copy", async (req, res) => {
  try {
    const url = (req.body?.url as string)?.trim();
    if (!url || !url.startsWith("http")) return res.status(400).json({ error: "Body must include url (http(s))" });
    const { copyImageToCdn } = await import("./campaign-images-storage.js");
    const result = await copyImageToCdn(url);
    if (!result) return res.status(502).json({ error: "Failed to copy image to CDN (check SUPABASE_* env and URL)" });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

// =====================================================================
// Email Templates CRUD (Email Marketing Factory)
// =====================================================================

function isTemplateImageContractsMissing(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation\s+["']?template_image_contracts["']?\s+does not exist/i.test(msg);
}

function isBrandAssetsMissing(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation\s+["']?brand_assets["']?\s+does not exist/i.test(msg);
}

/** GET /v1/email_templates — list with image_slots, product_slots, layout_style for picker. */
app.get("/v1/email_templates", async (req, res) => {
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
});

/** Build a placeholder map from a brand profile row for substituting [key] in MJML. Keys match BRAND_EMAIL_FIELD_MAPPING. */
function brandPlaceholderMap(brandRow: Record<string, unknown>): Record<string, string> {
  const name = typeof brandRow.name === "string" ? brandRow.name : "Brand";
  const identity = (brandRow.identity as Record<string, unknown>) ?? {};
  const design_tokens = (brandRow.design_tokens as Record<string, unknown>) ?? {};
  const website = typeof identity.website === "string" ? identity.website : "https://example.com";
  const contactEmail = typeof identity.contact_email === "string" ? identity.contact_email : "";
  let logo = "";
  if (design_tokens.logo && typeof (design_tokens.logo as Record<string, unknown>).url === "string") {
    logo = (design_tokens.logo as Record<string, unknown>).url as string;
  } else if (typeof design_tokens.logo_url === "string") {
    logo = design_tokens.logo_url;
  }
  let brandColor = "#16a34a";
  const colors = (design_tokens.colors as Record<string, unknown>) ?? (design_tokens.color as Record<string, unknown>);
  const brand = colors?.brand as Record<string, unknown> | undefined;
  if (brand && typeof brand["500"] === "string") brandColor = brand["500"] as string;
  const ctaText = typeof design_tokens.cta_text === "string" ? design_tokens.cta_text : "Learn more";
  const ctaLink = typeof design_tokens.cta_link === "string" ? design_tokens.cta_link : website;
  const contactInfo = typeof design_tokens.contact_info === "string" ? design_tokens.contact_info : contactEmail;
  const year = new Date().getFullYear();
  return {
    logo: logo || "https://via.placeholder.com/120x40?text=Logo",
    siteUrl: website,
    site_url: website,
    brandName: name,
    brand_name: name,
    headline: "Premium quality you can trust",
    body: "Discover our bestsellers and limited drops. Free shipping on orders over $70.",
    cta_text: ctaText,
    cta_url: ctaLink,
    brandColor,
    brand_color: brandColor,
    footerRights: `© ${year} ${name}. All rights reserved.`,
    contactInfo: contactInfo || contactEmail || "Contact us",
    "social media link": website,
    "social media icon": "https://via.placeholder.com/24",
    "image_url": "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&h=400&fit=crop",
    "product A src": "https://via.placeholder.com/280x280?text=Product+A",
    "product A title": "Featured product",
    "product A productUrl": website,
    "product B src": "https://via.placeholder.com/280x280?text=Product+B",
    "product B title": "Best seller",
    "product B productUrl": website,
  };
}

/** Substitute [placeholder] in mjml with values from map; leave unknown placeholders as-is. */
function substitutePlaceholders(mjml: string, map: Record<string, string>): string {
  return mjml.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    const k = key.trim();
    return k in map ? map[k] : `[${key}]`;
  });
}

/** GET /v1/email_templates/:id/preview — render template MJML to HTML. When component_sequence is set and mjml is null, assemble from email_component_library. When template has brand_profile_id, substitute placeholders from brand so preview maps to brand tokens. */
app.get("/v1/email_templates/:id/preview", async (req, res) => {
  try {
    const id = req.params.id;
    const r = await pool.query("SELECT mjml, component_sequence, brand_profile_id FROM email_templates WHERE id = $1", [id]);
    if (r.rows.length === 0) return res.status(404).send("Not found");
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
      return res.status(422).send("Template has no MJML content");
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
});

/** Letter to product slot index (A=1, B=2, ..., K=11). */
function productLetterToSlot(letter: string): number {
  const code = letter.toUpperCase().charCodeAt(0);
  if (code >= 65 && code <= 75) return code - 64; // A=1 .. K=11
  return 0;
}

/** Compute product slot count from MJML (product_N_image/title/url or [product A/B/... src/title/productUrl/description]). */
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

/** Compute content image slot count from MJML ([image 1], [image 2], {{image_1}}, {{content_image_2}}, etc.). */
function contentSlotsFromMjml(mjml: string | null): number {
  if (!mjml || typeof mjml !== "string") return 0;
  let max = 0;
  // Bracket: [image 1], [image 2]
  for (const m of mjml.matchAll(/\[image\s+(\d+)\]/gi)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  // Handlebars: {{image_1}}, {{image_2}}, {{content_image_1}}
  for (const m of mjml.matchAll(/\{\{(?:content_)?image_(\d+)\}\}/gi)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  // Hero counts as one slot when present; so if we only have hero, treat as 1. We already count [image N] and image_N above.
  // If max is still 0 but template has hero placeholder, treat as 1 (hero-only). Else return max.
  if (max === 0 && /\{\{hero_image|imageUrl|image_url\}\}|\[hero\]|\[banner\]|\[image_url\]|\[hero_image_url\]/i.test(mjml)) {
    return 1;
  }
  return max;
}

/** Normalize template type to a short label so layout_style is never a long sentence (e.g. from DB). */
function normalizeTemplateType(type: string | null | undefined): string {
  const t = (type ?? "").trim().toLowerCase();
  if (t === "newsletter" || t === "product" || t === "promo" || t === "email") return t;
  if (t.includes("product")) return "product";
  if (t.includes("newsletter")) return "newsletter";
  if (t.includes("promo")) return "promo";
  return "email";
}

/** Add image_slots, product_slots, layout_style to a template row (from contract or MJML). */
function enrichTemplateRow(row: Record<string, unknown>, contract: { max_content_slots?: number; max_product_slots?: number } | null): void {
  const mjml = row.mjml as string | null;
  const typeLabel = normalizeTemplateType(row.type as string);
  const name = String(row.name ?? "").trim();
  const id = row.id as string | undefined;

  // Known templates: apply slots first so contract 0/0 doesn't override (list + detail must show correct counts)
  let imageSlots: number;
  let productSlots: number;
  if (typeLabel === "product" && /emma/i.test(name)) {
    imageSlots = 1;
    productSlots = 5;
  } else if (id === "281f9f46-aca7-43ed-bb5f-85114234f210") {
    imageSlots = 6;
    productSlots = 3;
  } else if (typeLabel === "newsletter" && /^newsletter\s*1$/i.test(name)) {
    // Newsletter 1 (e.g. United Sodas / 12 reasons): 2 images, 0 products
    imageSlots = 2;
    productSlots = 0;
  } else if (row.component_sequence && Array.isArray(row.component_sequence) && row.component_sequence.length > 0 && !mjml) {
    // Composed template: content image slots only (hero/banner); product slots are separate (each product has its own image).
    imageSlots = typeof row.img_count === "number" ? row.img_count : 0;
    productSlots = 2; // typical for product_block_2; do not mix with content image count
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

/** GET /v1/email_templates/:id — includes image_slots, product_slots, layout_style for wizard validation. When component_sequence is set, mjml is assembled from email_component_library fragments. */
app.get("/v1/email_templates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let row: Record<string, unknown>;
    try {
      const r = await pool.query(
        "SELECT t.*, c.max_content_slots AS contract_max_content_slots, c.max_product_slots AS contract_max_product_slots FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1",
        [id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
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
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
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
});

/**
 * Run template lint gate for proof-run: returns ok false if any error-severity issues.
 * Used by POST /v1/plans/:id/start and POST /v1/runs/:id/rerun to block starting a run when the template fails lint.
 */
async function runTemplateLintGate(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  templateId: string,
): Promise<{ ok: boolean; errors: Array<{ code: string; message: string }> }> {
  let q: { rows: Record<string, unknown>[] };
  try {
    q = await db.query(
      "SELECT t.id, t.mjml, c.hero_required, c.logo_safe_hero, c.product_hero_allowed, c.mixed_content_and_product_pool, c.collapses_empty_modules, c.max_content_slots, c.max_product_slots, c.supports_content_images, c.supports_product_images, c.optional_modules FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1",
      [templateId],
    );
  } catch (err) {
    if (isTemplateImageContractsMissing(err)) return { ok: true, errors: [] };
    throw err;
  }
  if (q.rows.length === 0) return { ok: true, errors: [] };
  const row = q.rows[0];
  const contract = row.hero_required != null ? row : null;
  if (!contract) {
    return { ok: true, errors: [] };
  }
  const mjml = (row.mjml as string) ?? "";
  const { lintTemplateMjml } = await import("./template-image-linter.js");
  const results = lintTemplateMjml(mjml, contract, templateId);
  const errors = results.filter((r: { severity: string }) => r.severity === "error").map((r: { code: string; message: string }) => ({ code: r.code, message: r.message }));
  return { ok: errors.length === 0, errors };
}

/** GET /v1/email_templates/:id/lint — L001–L010 template image lint. Requires template_image_contracts row (v1). */
app.get("/v1/email_templates/:id/lint", async (req, res) => {
  try {
    const id = req.params.id;
    let q: { rows: Record<string, unknown>[] };
    try {
      q = await pool.query(
        "SELECT t.id, t.name, t.mjml, c.hero_required, c.logo_safe_hero, c.product_hero_allowed, c.mixed_content_and_product_pool, c.collapses_empty_modules, c.max_content_slots, c.max_product_slots, c.supports_content_images, c.supports_product_images, c.optional_modules FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1",
        [id]
      );
    } catch (err) {
      if (isTemplateImageContractsMissing(err)) {
        return res.status(503).json({ error: "template_image_contracts table not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to enable lint." });
      }
      throw err;
    }
    if (q.rows.length === 0) return res.status(404).json({ error: "Template not found" });
    const row = q.rows[0];
    const contract = row.hero_required != null ? row : null;
    if (!contract) {
      return res.status(400).json({ contract_missing: true, error: "Template has no template_image_contracts row (version v1); lint failed." });
    }
    const mjml = (row.mjml as string) ?? "";
    const { lintTemplateMjml } = await import("./template-image-linter.js");
    const results = lintTemplateMjml(mjml, contract, id);
    res.json({ template_id: id, contract_present: true, results });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/email_templates */
app.post("/v1/email_templates", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
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
});

/** PATCH /v1/email_templates/:id — optional lint_on_save: when true, run L001–L010 after update; fail with 400 if any error-severity issues. */
app.patch("/v1/email_templates/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const id = req.params.id;
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
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = now()");
    params.push(id);
    const r = await pool.query(
      `UPDATE email_templates SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
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
          return res.status(503).json({ error: "template_image_contracts table not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to use lint_on_save." });
        }
        throw err;
      }
      const contract = cq.rows.length > 0 ? cq.rows[0] : null;
      if (!contract) {
        return res.status(400).json({ error: "lint_on_save requires a template_image_contracts row (version v1) for this template.", lint_errors: [{ code: "L004", severity: "error", message: "Missing template image contract." }] });
      }
      const mjml = (row.mjml as string) ?? "";
      const { lintTemplateMjml } = await import("./template-image-linter.js");
      const lintResults = lintTemplateMjml(mjml, contract, id);
      const errors = lintResults.filter((x: { severity: string }) => x.severity === "error");
      if (errors.length > 0) {
        return res.status(400).json({ error: "Template lint failed. Fix errors before saving.", lint_errors: errors, lint_results: lintResults });
      }
      (row as Record<string, unknown>).lint_results = lintResults;
    }
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/email_templates/:id */
app.delete("/v1/email_templates/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const id = req.params.id;
    const r = await pool.query("DELETE FROM email_templates WHERE id = $1 RETURNING id", [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.status(200).json({ deleted: true, id });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

// ---------- Email component library (reusable MJML fragments for composing templates) ----------

/** GET /v1/email_component_library/assembled?ids=uuid1,uuid2,...&format=html&brand_profile_id=uuid — wrap fragments, optional brand substitution, return MJML or HTML. */
app.get("/v1/email_component_library/assembled", async (req, res) => {
  try {
    const idsParam = (req.query.ids as string) ?? "";
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ error: "ids query required (comma-separated UUIDs)" });
    for (const id of ids) {
      if (!isValidUuid(id)) return res.status(400).json({ error: `Invalid UUID: ${id}` });
    }
    const r = await pool.query(
      `SELECT id, mjml_fragment, position FROM email_component_library WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)`,
      [ids]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "No components found" });
    const fragments = (r.rows as { mjml_fragment: string }[]).map((row) => row.mjml_fragment ?? "").filter(Boolean);
    let mjml = `<mjml>\n<mj-body>\n${fragments.join("\n")}\n</mj-body>\n</mjml>`;
    const brandProfileId = req.query.brand_profile_id as string | undefined;
    if (brandProfileId && isValidUuid(brandProfileId)) {
      const brandR = await pool.query("SELECT name, identity, design_tokens FROM brand_profiles WHERE id = $1", [brandProfileId]);
      if (brandR.rows.length > 0) {
        const map = brandPlaceholderMap(brandR.rows[0] as Record<string, unknown>);
        mjml = substitutePlaceholders(mjml, map);
      }
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
});

/** GET /v1/email_component_library — list all, ordered by position. */
app.get("/v1/email_component_library", async (req, res) => {
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
});

/** GET /v1/email_component_library/:id */
app.get("/v1/email_component_library/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query("SELECT * FROM email_component_library WHERE id = $1", [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/email_component_library */
app.post("/v1/email_component_library", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as {
      component_type?: string;
      name?: string;
      description?: string;
      mjml_fragment?: string;
      placeholder_docs?: unknown;
      position?: number;
      use_context?: string;
    };
    if (!body.component_type?.trim() || !body.name?.trim() || body.mjml_fragment == null)
      return res.status(400).json({ error: "component_type, name, and mjml_fragment required" });
    const useContext = typeof body.use_context === "string" && body.use_context.trim() ? body.use_context.trim().toLowerCase() : "email";
    const r = await pool.query(
      `INSERT INTO email_component_library (component_type, name, description, mjml_fragment, placeholder_docs, position, use_context, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now()) RETURNING *`,
      [
        body.component_type.trim(),
        body.name.trim(),
        body.description?.trim() ?? null,
        body.mjml_fragment,
        body.placeholder_docs != null ? JSON.stringify(body.placeholder_docs) : "[]",
        typeof body.position === "number" ? body.position : 0,
        useContext,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PATCH /v1/email_component_library/:id */
app.patch("/v1/email_component_library/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const body = req.body as Record<string, unknown>;
    const allowed = ["component_type", "name", "description", "mjml_fragment", "placeholder_docs", "position", "use_context"];
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
        } else if (typeof body[field] === "string") {
          sets.push(`${field} = $${i++}`);
          params.push(body[field]);
        }
      }
    }
    if (params.length === 0) return res.status(400).json({ error: "No updatable fields" });
    params.push(id);
    const r = await pool.query(
      `UPDATE email_component_library SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/email_component_library/:id */
app.delete("/v1/email_component_library/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const r = await pool.query("DELETE FROM email_component_library WHERE id = $1 RETURNING id", [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.status(200).json({ deleted: true, id });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

export function startApi(port: number = Number(process.env.PORT) || 3001): void {
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.setupExpressErrorHandler(app);
  }
  app.listen(port, () => console.log(`[api] Listening on port ${port}`));
}
