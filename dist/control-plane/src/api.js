import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import * as Sentry from "@sentry/node";
import { v4 as uuid } from "uuid";
import mjml2html from "mjml";
import { pool, withTransaction } from "./db.js";
import { createRun, completeApprovalAndAdvance } from "./scheduler.js";
import { executeRollback, routeRun } from "./release-manager.js";
import { triggerNoArtifactsRemediationForRun, triggerBadArtifactsRemediationForRun } from "./no-artifacts-self-heal.js";
import { fetchSitemapProducts } from "./sitemap-products.js";
import { productsFromUrl } from "./products-from-url.js";
import { tokenizeBrandFromUrl } from "./brand-tokenize-from-url.js";
import { getGoogleAuthUrl, handleOAuthCallback, getAccessTokenForInitiative, hasGoogleCredentials, deleteGoogleCredentials, hasGoogleCredentialsForBrand, deleteGoogleCredentialsForBrand, } from "./seo-google-oauth.js";
import { lookupBySignature as incidentLookup, recordResolution as incidentRecord } from "./incident-memory.js";
import { createDeployEventFromPayload } from "./deploy-events.js";
import { registerVercelProjectForSelfHeal, scanAndRemediateVercelDeployFailure } from "./vercel-redeploy-self-heal.js";
import { scanAndRemediateDeployFailure } from "./deploy-failure-self-heal.js";
import { registerGraphRoutes } from "./graphs/graph-endpoints.js";
const CONTROL_PLANE_BASE = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SEO_GOOGLE_CALLBACK_PATH = "/v1/seo/google/callback";
const app = express();
// CORS: allow comma-separated origins (e.g. multiple Vercel URLs) or "*"
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
const allowedOrigins = corsOrigin === "*" ? "*" : corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
// Rate limiting: stricter for auth/OAuth endpoints, general for rest (audit recommendation).
const isAuthPath = (path) => /\/v1\/seo\/google|google_access_token|google_connected|google_credentials/.test(path);
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: "Too many authentication requests; try again later." },
    standardHeaders: true,
});
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_PER_MIN) || 300,
    message: { error: "Too many requests; try again later." },
    standardHeaders: true,
});
app.use((req, res, next) => (isAuthPath(req.path) ? authLimiter(req, res, next) : generalLimiter(req, res, next)));
registerGraphRoutes(app);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** $ per 1M tokens [input, output]. Order: more specific model names first. */
const LLM_PRICING = [
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
function llmProvider(modelId) {
    const id = (modelId || "").toLowerCase();
    if (id.startsWith("gpt-") || id.startsWith("o1-") || id.startsWith("o1"))
        return "OpenAI";
    if (id.startsWith("claude"))
        return "Anthropic";
    return "Other";
}
function llmCostUsd(modelId, tokensIn, tokensOut) {
    const inM = (tokensIn || 0) / 1_000_000;
    const outM = (tokensOut || 0) / 1_000_000;
    const id = (modelId || "").toLowerCase();
    for (const p of LLM_PRICING) {
        if (id.startsWith(p.prefix))
            return inM * p.input + outM * p.output;
    }
    return inM * 1 + outM * 2; // default $1 / $2 per 1M
}
/** DB enum risk_level is 'low' | 'med' | 'high'. Normalize 'medium' -> 'med' so old clients never break. */
function normalizeRiskLevel(s) {
    if (s === "medium")
        return "med";
    if (s === "low" || s === "med" || s === "high")
        return s;
    return "med";
}
/** RBAC stub: resolve role from header or JWT. In production use Supabase Auth + custom claim. Default operator so Console can compile/start without auth. */
function getRole(_req) {
    const role = _req.headers["x-role"];
    if (role === "admin" || role === "approver" || role === "operator" || role === "viewer")
        return role;
    return "operator";
}
/** Keys that must not be written into email_design_generator_metadata.metadata_json; use columns or child table. See docs/SCHEMA_JSON_GUARDRAILS.md. */
const EMAIL_DESIGN_METADATA_JSON_BLOCKLIST = ["scheduled_at", "segment_id", "proof_status"];
function checkEmailDesignMetadataJsonBlocklist(meta) {
    for (const key of EMAIL_DESIGN_METADATA_JSON_BLOCKLIST) {
        if (Object.prototype.hasOwnProperty.call(meta, key))
            return key;
    }
    return null;
}
/** Documented allowed top-level keys for artifacts.metadata_json. See docs/SCHEMA_JSON_GUARDRAILS.md. */
const ARTIFACT_METADATA_JSON_ALLOWLIST = new Set(["content", "mjml", "error_signature", "type"]);
/** design_tokens keys that are campaign/asset refs and should live in initiative or email metadata. See docs/SCHEMA_JSON_GUARDRAILS.md. */
const DESIGN_TOKENS_NON_TOKEN_KEYS = ["products", "selected_images"];
/** Flatten design_tokens for brand_design_tokens_flat. Returns { path, value_text, value_json, type, group }[] */
function flattenDesignTokens(obj, prefix = "") {
    const out = [];
    if (obj == null)
        return out;
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
async function syncDesignTokensFlat(brandId, designTokens) {
    const flat = flattenDesignTokens(designTokens);
    if (flat.length === 0)
        return;
    try {
        await pool.query("DELETE FROM brand_design_tokens_flat WHERE brand_id = $1", [brandId]);
        for (const row of flat) {
            await pool.query(`INSERT INTO brand_design_tokens_flat (brand_id, path, value, value_json, type, "group", updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, now())
         ON CONFLICT (brand_id, path) DO UPDATE SET value = $3, value_json = $4::jsonb, type = $5, "group" = $6, updated_at = now()`, [
                brandId,
                row.path,
                row.value_text,
                row.value_json != null ? JSON.stringify(row.value_json) : null,
                row.type,
                row.group || "root",
            ]);
        }
    }
    catch (e) {
        if (e.code !== "42P01")
            throw e;
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
        let database_hint;
        if (url && typeof url === "string") {
            try {
                const u = new URL(url.replace(/^postgres:\/\//, "postgresql://"));
                database_hint = { host: u.hostname || undefined, port: u.port || undefined };
            }
            catch {
                database_hint = { host: "(parse error)" };
            }
        }
        res.json({ status: "ok", db: "connected", database_hint });
    }
    catch (e) {
        res.status(503).json({ status: "error", db: String(e.message) });
    }
});
/** GET /health/migrations — migration status (applied on Control Plane startup via run-migrate.mjs; no registry table). */
app.get("/health/migrations", (_req, res) => {
    res.json({
        status: "ok",
        message: "Migrations run on Control Plane startup via run-migrate.mjs",
        note: "No migration registry table; check startup logs for apply status.",
    });
});
/** GET /health/schema — schema drift status (use GET /v1/schema_drift for details). */
app.get("/health/schema", async (_req, res) => {
    try {
        await pool.query("SELECT 1");
        res.json({ status: "ok", schema_drift_endpoint: "/v1/schema_drift" });
    }
    catch (e) {
        res.status(503).json({ status: "error", schema: String(e.message) });
    }
});
/** GET /v1/dashboard — stub: stale_leases, queue_depth, workers count */
app.get("/v1/dashboard", async (req, res) => {
    try {
        const env = req.query.environment ?? "sandbox";
        const [staleLeases, queueDepth, workers] = await Promise.all([
            pool.query(`SELECT count(*)::int AS c FROM job_claims WHERE released_at IS NULL AND heartbeat_at < now() - interval '2 minutes'`).then(r => r.rows[0]?.c ?? 0),
            pool.query(`SELECT count(*)::int AS c FROM job_runs jr JOIN runs r ON r.id = jr.run_id WHERE r.environment = $1 AND r.started_at > now() - interval '1 hour' AND jr.status IN ('queued','running')`, [env]).then(r => r.rows[0]?.c ?? 0),
            pool.query(`SELECT count(*)::int AS c FROM worker_registry WHERE last_heartbeat_at > now() - interval '5 minutes'`).then(r => r.rows[0]?.c ?? 0),
        ]);
        res.json({ stale_leases: staleLeases, queue_depth: queueDepth, workers_alive: workers });
    }
    catch (e) {
        if (handleDbMissingTable(e, res))
            return;
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/initiatives — list with filters and pagination */
app.get("/v1/initiatives", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const intent_type = req.query.intent_type;
        const risk_level = req.query.risk_level;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (intent_type) {
            conditions.push(`intent_type = $${i++}`);
            params.push(intent_type);
        }
        if (risk_level) {
            const normalized = normalizeRiskLevel(risk_level);
            // #region agent log
            fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H3", location: "api.ts:GET initiatives", message: "risk_level filter", data: { raw: risk_level, normalized }, timestamp: Date.now() }) }).catch(() => { });
            // #endregion
            conditions.push(`risk_level = $${i++}`);
            params.push(normalized);
        }
        params.push(limit, offset);
        const q = `SELECT * FROM initiatives WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/initiatives/:id */
app.get("/v1/initiatives/:id", async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM initiatives WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/email_designs — list initiatives with intent_type = email_design_generator + metadata. Optional campaign_kind=landing_page to list only landing-page campaigns. */
app.get("/v1/email_designs", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const campaign_kind = req.query.campaign_kind;
        const conditions = ["i.intent_type = 'email_design_generator'"];
        const params = [limit, offset];
        if (campaign_kind === "landing_page") {
            conditions.push("(m.metadata_json->>'campaign_kind') = 'landing_page'");
        }
        const whereClause = conditions.join(" AND ");
        const r = await pool.query(`SELECT i.id, i.title, i.intent_type, i.risk_level, i.created_at,
              m.subject_line, m.from_name, m.from_email, m.template_artifact_id, m.audience_segment_ref, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_design_generator_metadata m ON m.initiative_id = i.id
       WHERE ${whereClause}
       ORDER BY i.created_at DESC LIMIT $1 OFFSET $2`, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/email_designs/:id — single email design (initiative + metadata) */
app.get("/v1/email_designs/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const fullSelect = `SELECT i.id, i.title, i.created_at, i.brand_profile_id, i.template_id, m.subject_line, m.from_name, m.from_email, m.reply_to, m.template_artifact_id, m.audience_segment_ref, m.metadata_json, m.created_at AS metadata_created_at, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_design_generator_metadata m ON m.initiative_id = i.id
       WHERE i.id = $1 AND i.intent_type = 'email_design_generator'`;
        const minimalSelect = `SELECT i.id, i.title, i.created_at, i.template_id, m.subject_line, m.from_name, m.from_email, m.reply_to, m.template_artifact_id, m.audience_segment_ref, m.metadata_json, m.created_at AS metadata_created_at, m.updated_at AS metadata_updated_at
       FROM initiatives i
       LEFT JOIN email_design_generator_metadata m ON m.initiative_id = i.id
       WHERE i.id = $1 AND i.intent_type = 'email_design_generator'`;
        let r;
        try {
            r = await pool.query(fullSelect, [id]);
        }
        catch (e) {
            if (e.code === "42703" || String(e.message).includes("brand_profile_id")) {
                r = await pool.query(minimalSelect, [id]);
                if (r.rows.length > 0) {
                    const row = r.rows[0];
                    row.brand_profile_id = null;
                    if (!("template_id" in row))
                        row.template_id = null;
                }
            }
            else
                throw e;
        }
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const row = r.rows[0];
        if (row.template_id == null && row.metadata_json != null && typeof row.metadata_json === "object" && row.metadata_json.template_id != null) {
            row.template_id = row.metadata_json.template_id;
        }
        res.json(row);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/email_designs — create initiative (email_design_generator) + optional metadata */
app.post("/v1/email_designs", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        const id = uuid();
        // #region agent log
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H1", location: "api.ts:POST email_designs", message: "body.risk_level and resolved riskLevel", data: { body_risk_level: body.risk_level, has_risk_level: "risk_level" in body }, timestamp: Date.now() }) }).catch(() => { });
        // #endregion
        const riskLevel = normalizeRiskLevel(body.risk_level) ?? "med"; // always normalize so "medium" -> "med" if client sends it
        // #region agent log
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H5", location: "api.ts:INSERT initiatives", message: "riskLevel passed to DB", data: { riskLevel, paramOrder: "id,title,brand_profile_id,template_id,riskLevel" }, timestamp: Date.now() }) }).catch(() => { });
        // #endregion
        const err = (e) => e.code === "42703" || String(e.message).includes("brand_profile_id");
        try {
            await pool.query(`INSERT INTO initiatives (id, intent_type, title, risk_level, brand_profile_id, template_id) VALUES ($1, 'email_design_generator', $2, $5, $3, $4)`, [id, body.title ?? "New email campaign", body.brand_profile_id ?? null, body.template_id ?? null, riskLevel]);
        }
        catch (e) {
            // #region agent log
            fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H2", location: "api.ts:POST email_designs catch", message: "INSERT initiatives fallback", data: { error: String(e.message).slice(0, 80), has_template_id: !!body.template_id }, timestamp: Date.now() }) }).catch(() => { });
            // #endregion
            if (err(e)) {
                try {
                    await pool.query(`INSERT INTO initiatives (id, intent_type, title, risk_level, template_id) VALUES ($1, 'email_design_generator', $2, $3, $4)`, [id, body.title ?? "New email campaign", riskLevel, body.template_id ?? null]);
                }
                catch (e2) {
                    if (e2.code === "42703") {
                        await pool.query(`INSERT INTO initiatives (id, intent_type, title, risk_level) VALUES ($1, 'email_design_generator', $2, $3)`, [id, body.title ?? "New email campaign", riskLevel]);
                    }
                    else
                        throw e2;
                }
            }
            else
                throw e;
        }
        const metadataForDb = body.metadata_json != null && typeof body.metadata_json === "object"
            ? { ...body.metadata_json, template_id: body.template_id ?? body.metadata_json.template_id }
            : (body.template_id ? { template_id: body.template_id } : null);
        if (metadataForDb != null && typeof metadataForDb === "object") {
            const blocked = checkEmailDesignMetadataJsonBlocklist(metadataForDb);
            if (blocked) {
                return res.status(400).json({
                    error: `metadata_json must not contain "${blocked}". Use columns or a child table. See docs/SCHEMA_JSON_GUARDRAILS.md.`,
                });
            }
        }
        await pool.query(`INSERT INTO email_design_generator_metadata (initiative_id, subject_line, from_name, from_email, template_artifact_id, metadata_json) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [
            id,
            body.subject_line ?? null,
            body.from_name ?? null,
            body.from_email ?? null,
            body.template_artifact_id ?? null,
            metadataForDb != null ? JSON.stringify(metadataForDb) : null,
        ]);
        const r = await pool.query(`SELECT i.id, i.title, i.created_at, m.subject_line, m.from_name, m.from_email, m.template_artifact_id, m.metadata_json
       FROM initiatives i LEFT JOIN email_design_generator_metadata m ON m.initiative_id = i.id WHERE i.id = $1`, [id]);
        const row = r.rows[0];
        res.status(201).json({ ...row, brand_profile_id: body.brand_profile_id ?? null, template_id: body.template_id ?? null });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/email_designs/:id — update email design metadata (upsert) */
app.patch("/v1/email_designs/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const id = req.params.id;
        const exists = await pool.query("SELECT id FROM initiatives WHERE id = $1 AND intent_type = 'email_design_generator'", [id]);
        if (exists.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const body = req.body;
        if (body.metadata_json != null && typeof body.metadata_json === "object") {
            const blocked = checkEmailDesignMetadataJsonBlocklist(body.metadata_json);
            if (blocked) {
                return res.status(400).json({
                    error: `metadata_json must not contain "${blocked}". Use columns or a child table. See docs/SCHEMA_JSON_GUARDRAILS.md.`,
                });
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
        const updates = [];
        const params = [id];
        let i = 2;
        for (const field of allowed) {
            if (body[field] !== undefined) {
                if (field === "metadata_json") {
                    updates.push(`metadata_json = $${i++}::jsonb`);
                }
                else {
                    updates.push(`${field} = $${i++}`);
                }
                params.push(field === "metadata_json" && body[field] != null ? JSON.stringify(body[field]) : body[field]);
            }
        }
        updates.push("updated_at = now()");
        const r = await pool.query(`INSERT INTO email_design_generator_metadata (initiative_id, subject_line, from_name, from_email)
       VALUES ($1, null, null, null)
       ON CONFLICT (initiative_id) DO UPDATE SET ${updates.join(", ")}
       RETURNING *`, params);
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/sitemap/products — fetch products from sitemap URL (port from email-marketing-factory campaigns route) */
app.post("/v1/sitemap/products", async (req, res) => {
    try {
        const body = req.body;
        const sitemap_url = body.sitemap_url;
        const sitemap_type = body.sitemap_type;
        if (!sitemap_url || !sitemap_type) {
            return res.status(400).json({ error: "sitemap_url and sitemap_type are required" });
        }
        const allowedTypes = ["drupal", "ecommerce", "bigcommerce", "shopify"];
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/products/from_url — fetch products from XML sitemap or JSON URL (e.g. Shopify collection). Same response shape as sitemap/products. */
app.post("/v1/products/from_url", async (req, res) => {
    try {
        const body = req.body;
        const url = body.url;
        const type = body.type;
        if (!url || !type) {
            return res.status(400).json({ error: "url and type are required" });
        }
        const allowed = ["shopify_json", "sitemap_xml"];
        if (!allowed.includes(type)) {
            return res.status(400).json({
                error: "type must be one of: shopify_json, sitemap_xml",
            });
        }
        if (type === "sitemap_xml") {
            const st = body.sitemap_type;
            const allowedSt = ["drupal", "ecommerce", "bigcommerce", "shopify"];
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
            sitemap_type: type === "sitemap_xml" ? body.sitemap_type : undefined,
            limit,
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/seo/gsc_report — fetch GSC Search Analytics (top pages + queries). Requires GOOGLE_APPLICATION_CREDENTIALS and site in Search Console. */
app.post("/v1/seo/gsc_report", async (req, res) => {
    try {
        const body = req.body;
        const site_url = body.site_url ?? "";
        if (!site_url)
            return res.status(400).json({ error: "site_url is required" });
        const { fetchGscReport } = await import("./seo-gsc-ga-client.js");
        const report = await fetchGscReport(site_url, {
            dateRange: body.date_range ?? "last28days",
            rowLimit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
        });
        res.json(report);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/seo/ga4_report — fetch GA4 top pages (sessions, page views). Requires GOOGLE_APPLICATION_CREDENTIALS and GA4 property access. */
app.post("/v1/seo/ga4_report", async (req, res) => {
    try {
        const body = req.body;
        const property_id = body.property_id ?? "";
        if (!property_id)
            return res.status(400).json({ error: "property_id is required" });
        const { fetchGa4Report } = await import("./seo-gsc-ga-client.js");
        const report = await fetchGa4Report(property_id, {
            rowLimit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
        });
        res.json(report);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/seo/google/auth — return Google OAuth URL or redirect. Pass brand_id (preferred) or initiative_id (legacy), and redirect_uri. If redirect=1, respond with 302 to Google (avoids browser blocking async redirects). */
app.get("/v1/seo/google/auth", async (req, res) => {
    try {
        const brand_id = req.query.brand_id;
        const initiative_id = req.query.initiative_id;
        const redirect_uri = req.query.redirect_uri;
        const doRedirect = req.query.redirect === "1" || req.query.redirect === "true";
        if (!redirect_uri)
            return res.status(400).json({ error: "redirect_uri is required (e.g. brand or initiative page URL)" });
        if (!brand_id && !initiative_id)
            return res.status(400).json({ error: "brand_id or initiative_id is required" });
        const callbackUrl = `${CONTROL_PLANE_BASE}${SEO_GOOGLE_CALLBACK_PATH}`;
        const url = await getGoogleAuthUrl(callbackUrl, redirect_uri, { brand_id, initiative_id });
        if (doRedirect)
            return res.redirect(302, url);
        res.json({ url });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/seo/google/callback — OAuth callback: exchange code, store refresh_token, redirect to redirect_uri from state. State is validated (decodeState) for CSRF protection before exchanging the code. */
app.get("/v1/seo/google/callback", async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const callbackRedirectUri = `${CONTROL_PLANE_BASE}${SEO_GOOGLE_CALLBACK_PATH}`;
    if (!code || !state) {
        return res.redirect(callbackRedirectUri + "?error=missing_code_or_state");
    }
    try {
        const result = await withTransaction((client) => handleOAuthCallback(client, code, state, callbackRedirectUri));
        const target = result.redirect_uri || "/";
        const err = result.error ? `&error=${encodeURIComponent(result.error)}` : "&google_connected=1";
        return res.redirect(target.includes("?") ? `${target}${err}` : `${target}?${err.slice(1)}`);
    }
    catch (e) {
        const msg = encodeURIComponent(String(e.message));
        return res.redirect(`${callbackRedirectUri}?error=${msg}`);
    }
});
/** GET /v1/initiatives/:id/google_access_token — for runner: return short-lived access_token (uses stored refresh_token). */
app.get("/v1/initiatives/:id/google_access_token", async (req, res) => {
    try {
        const initiativeId = req.params.id;
        const token = await withTransaction((client) => getAccessTokenForInitiative(client, initiativeId));
        if (!token)
            return res.status(404).json({ error: "Google not connected for this initiative" });
        res.json(token);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/initiatives/:id/google_connected — for console: whether initiative has Google credentials. */
app.get("/v1/initiatives/:id/google_connected", async (req, res) => {
    try {
        const connected = await withTransaction((client) => hasGoogleCredentials(client, req.params.id));
        res.json({ connected: !!connected });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/initiatives/:id/google_credentials — disconnect Google for this initiative (legacy per-initiative credentials only). */
app.delete("/v1/initiatives/:id/google_credentials", async (req, res) => {
    try {
        await withTransaction((client) => deleteGoogleCredentials(client, req.params.id));
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/brand_profiles/:id/google_connected — whether brand has Google credentials (for brand page "Connect Google"). */
app.get("/v1/brand_profiles/:id/google_connected", async (req, res) => {
    try {
        const connected = await withTransaction((client) => hasGoogleCredentialsForBrand(client, req.params.id));
        res.json({ connected: !!connected });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/brand_profiles/:id/google_credentials — disconnect Google for this brand. */
app.delete("/v1/brand_profiles/:id/google_credentials", async (req, res) => {
    try {
        await withTransaction((client) => deleteGoogleCredentialsForBrand(client, req.params.id));
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/initiatives/:id — update initiative (Operator+) */
app.patch("/v1/initiatives/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        const allowed = ["intent_type", "title", "risk_level", "goal_state", "goal_metadata", "source_ref", "template_id", "priority", "brand_profile_id"];
        const sets = [];
        const params = [];
        let i = 1;
        for (const field of allowed) {
            if (body[field] !== undefined) {
                if (field === "risk_level") {
                    sets.push(`${field} = $${i++}::risk_level`);
                    params.push(normalizeRiskLevel(body[field]));
                }
                else {
                    sets.push(`${field} = $${i++}`);
                    params.push(body[field]);
                }
            }
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "No fields to update" });
        params.push(req.params.id);
        const r = await pool.query(`UPDATE initiatives SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/initiatives — create (Operator+ in prod); accepts goal_state, source_ref, template_id */
app.post("/v1/initiatives", async (req, res) => {
    try {
        const body = req.body;
        const { intent_type, title, risk_level, created_by, goal_state, goal_metadata, source_ref, template_id, priority, brand_profile_id } = body;
        if (!intent_type || !risk_level)
            return res.status(400).json({ error: "intent_type and risk_level required" });
        const rl = normalizeRiskLevel(risk_level);
        const r = await pool.query(`INSERT INTO initiatives (intent_type, title, risk_level, created_by, goal_state, goal_metadata, source_ref, template_id, priority, brand_profile_id)
       VALUES ($1,$2,$3::risk_level,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`, [
            intent_type, title ?? null, rl, created_by ?? null,
            goal_state ?? null, goal_metadata ? JSON.stringify(goal_metadata) : null, source_ref ?? null, template_id ?? null, priority ?? 0, brand_profile_id ?? null,
        ]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        const err = e;
        if (err.code === "42703") {
            return pool.query(`INSERT INTO initiatives (intent_type, title, risk_level, created_by) VALUES ($1,$2,$3::risk_level,$4) RETURNING *`, [req.body.intent_type, req.body.title ?? null, normalizeRiskLevel(req.body.risk_level), req.body.created_by ?? null]).then(r => res.status(201).json(r.rows[0])).catch(e2 => res.status(500).json({ error: String(e2.message) }));
        }
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/plans — list with pagination (optional initiative_id filter) */
app.get("/v1/plans", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const initiative_id = req.query.initiative_id;
        let q = "SELECT p.*, i.title AS initiative_title, i.intent_type FROM plans p JOIN initiatives i ON i.id = p.initiative_id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2";
        const params = [limit, offset];
        if (initiative_id) {
            q = "SELECT p.*, i.title AS initiative_title, i.intent_type FROM plans p JOIN initiatives i ON i.id = p.initiative_id WHERE p.initiative_id = $1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3";
            params.unshift(initiative_id);
        }
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
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
        if (!plan)
            return res.status(404).json({ error: "Plan not found" });
        res.json({ plan, nodes, edges });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** Return 503 with migration hint when DB is missing tables (42P01). */
function handleDbMissingTable(e, res, tableHint = "job_runs") {
    const code = e.code;
    if (code === "42P01") {
        res.status(503).json({
            error: `Database schema not applied: relation "${tableHint}" does not exist. Migrations run automatically on every Control Plane start; redeploy the service or check that it uses the default CMD and DATABASE_URL (see docs/runbooks/console-db-relation-does-not-exist.md).`,
        });
        return true;
    }
    return false;
}
/** GET /v1/runs — list with filters and pagination */
app.get("/v1/runs", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const environment = req.query.environment;
        const status = req.query.status;
        const cohort = req.query.cohort;
        const conditions = ["1=1"];
        const params = [];
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
        const intent_type = req.query.intent_type;
        if (intent_type) {
            conditions.push(`i.intent_type = $${i++}`);
            params.push(intent_type);
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
    }
    catch (e) {
        if (handleDbMissingTable(e, res))
            return;
        res.status(500).json({ error: String(e.message) });
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
        if (!run)
            return res.status(404).json({ error: "Run not found" });
        const initiative_id = planRow?.initiative_id ?? null;
        res.json({ run: { ...run, initiative_id }, initiative_id, plan_nodes: planNodes, plan_edges: planEdges, node_progress: nodeProgress, job_runs: jobRuns, artifacts: runArtifacts, run_events: runEvents });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/runs/:id/artifacts — list artifacts for a run (optional producer_plan_node_id in response) */
app.get("/v1/runs/:id/artifacts", async (req, res) => {
    try {
        const runId = req.params.id;
        const exists = await pool.query("SELECT id FROM runs WHERE id = $1", [runId]);
        if (exists.rows.length === 0)
            return res.status(404).json({ error: "Run not found" });
        const r = await pool.query("SELECT * FROM artifacts WHERE run_id = $1 ORDER BY created_at", [runId]);
        if (r.rows.length === 0)
            setImmediate(() => triggerNoArtifactsRemediationForRun(runId));
        else
            setImmediate(() => triggerBadArtifactsRemediationForRun(runId));
        res.json({ items: r.rows });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/runs/:id/status — for CI polling: run status (queued, running, succeeded, failed) */
app.get("/v1/runs/:id/status", async (req, res) => {
    try {
        const r = await pool.query("SELECT id, status FROM runs WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Run not found" });
        res.json({ id: r.rows[0].id, status: r.rows[0].status });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/runs/:id/log_entries — list log entries for a run (paginated). Query: limit, offset, source, order=asc|desc. */
app.get("/v1/runs/:id/log_entries", async (req, res) => {
    try {
        const runId = req.params.id;
        const exists = await pool.query("SELECT id FROM runs WHERE id = $1", [runId]);
        if (exists.rows.length === 0)
            return res.status(404).json({ error: "Run not found" });
        const limit = Math.min(parseInt(String(req.query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Math.max(0, parseInt(String(req.query.offset || 0), 10) || 0);
        const source = typeof req.query.source === "string" && req.query.source.trim() ? req.query.source.trim() : null;
        const order = String(req.query.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
        const countResult = await pool.query("SELECT COUNT(*)::int AS total FROM run_log_entries WHERE run_id = $1" + (source ? " AND source = $2" : ""), source ? [runId, source] : [runId]);
        const total = countResult.rows[0].total;
        const q = source
            ? "SELECT id, run_id, job_run_id, source, level, message, logged_at FROM run_log_entries WHERE run_id = $1 AND source = $2 ORDER BY logged_at " + order + " LIMIT $3 OFFSET $4"
            : "SELECT id, run_id, job_run_id, source, level, message, logged_at FROM run_log_entries WHERE run_id = $1 ORDER BY logged_at " + order + " LIMIT $2 OFFSET $3";
        const params = source ? [runId, source, limit, offset] : [runId, limit, offset];
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset, total });
    }
    catch (e) {
        const err = e;
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
        if (runRow.rows.length === 0)
            return res.status(404).json({ error: "Run not found" });
        const { ingestRunLogsOneOff } = await import("./render-log-ingest.js");
        const result = await ingestRunLogsOneOff(runId, runRow.rows[0]);
        res.status(200).json({ ok: true, ingested: result.ingested, message: result.message });
    }
    catch (e) {
        const err = e;
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
        const body = req.body;
        if (!body || typeof body !== "object")
            return res.status(400).json({ error: "Body must be ImageAssignment JSON object" });
        const r = await pool.query("UPDATE runs SET image_assignment_json = $2::jsonb WHERE id = $1 RETURNING id", [runId, JSON.stringify(body)]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Run not found" });
        res.status(200).json({ ok: true, run_id: runId });
    }
    catch (e) {
        const err = e;
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
        let runRow;
        try {
            runRow = await pool.query("SELECT image_assignment_json FROM runs WHERE id = $1", [runId]);
        }
        catch (e) {
            const err = e;
            if (err.code === "42703" || (typeof err.message === "string" && err.message.includes("image_assignment_json"))) {
                return res.status(503).json({
                    error: "runs.image_assignment_json column not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to enable.",
                });
            }
            throw e;
        }
        if (runRow.rows.length === 0)
            return res.status(404).json({ error: "Run not found" });
        const assignment = runRow.rows[0].image_assignment_json;
        if (!assignment || typeof assignment !== "object")
            return res.status(400).json({ error: "Run has no image_assignment_json" });
        const templateId = assignment.template_id;
        if (!templateId)
            return res.status(400).json({ error: "image_assignment_json missing template_id" });
        let contract = null;
        try {
            const contractRow = await pool.query("SELECT hero_required, logo_safe_hero, product_hero_allowed, max_content_slots, max_product_slots, collapses_empty_modules FROM template_image_contracts WHERE template_id = $1 AND version = 'v1'", [templateId]);
            contract = contractRow.rows.length > 0 ? contractRow.rows[0] : null;
        }
        catch (err) {
            if (!isTemplateImageContractsMissing(err))
                throw err;
        }
        const { evaluateImageAssignmentValidations } = await import("./template-image-validators.js");
        const results = evaluateImageAssignmentValidations(assignment, contract);
        for (const v of results) {
            await pool.query("INSERT INTO validations (id, run_id, validator_type, status, created_at) VALUES (gen_random_uuid(), $1, $2, $3, now())", [runId, `image_assignment:${v.code}`, v.status]);
        }
        const failed = results.filter((r) => r.status === "fail");
        res.status(200).json({ ok: true, run_id: runId, evaluated: results.length, failed: failed.length, results });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/runs/:id/cancel — set run cancelled (cancelled_at + status or metadata) */
app.post("/v1/runs/:id/cancel", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const runId = req.params.id;
        const reason = req.body?.reason ?? null;
        const r = await pool.query("UPDATE runs SET cancelled_at = now(), cancelled_reason = $2, status = 'failed' WHERE id = $1 RETURNING id, status, cancelled_at", [runId, reason]).catch(() => pool.query("UPDATE runs SET status = 'failed' WHERE id = $1 RETURNING id, status", [runId]));
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Run not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/runs — create run (requires plan_id, release_id, environment, root_idempotency_key) — stub; real impl uses scheduler.createRun */
app.post("/v1/runs", async (req, res) => {
    res.status(501).json({ error: "Use scheduler.createRun via internal API; not yet exposed with validation" });
});
/** POST /v1/runs/by-artifact-type — resolve operator from capability graph, create single-node plan + run. Body: { produces, consumes?: [], initiative_id, environment? }. */
app.post("/v1/runs/by-artifact-type", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        const produces = body?.produces?.trim();
        const initiativeId = body?.initiative_id?.trim();
        if (!produces)
            return res.status(400).json({ error: "Body must include produces (artifact type key)" });
        if (!initiativeId)
            return res.status(400).json({ error: "Body must include initiative_id" });
        const consumes = Array.isArray(body?.consumes) ? body.consumes.filter((c) => typeof c === "string") : [];
        const environment = (body?.environment && ["sandbox", "staging", "prod"].includes(body.environment)) ? body.environment : "sandbox";
        const runId = await withTransaction(async (client) => {
            const { resolveOperators } = await import("./capability-resolver.js");
            const { createHash } = await import("crypto");
            const result = await resolveOperators(client, { produces, consumes });
            if (!result.operators.length) {
                throw new Error(`No operator produces artifact type "${produces}"${consumes.length ? ` and consumes [${consumes.join(", ")}]` : ""}. Check capability graph.`);
            }
            const jobType = result.operators[0];
            const planHash = createHash("sha256").update(`by_artifact_type:${produces}:${consumes.join(",")}`).digest("hex");
            let planId;
            const existing = await client.query("SELECT id FROM plans WHERE initiative_id = $1 AND plan_hash = $2", [initiativeId, planHash]);
            if (existing.rows.length > 0) {
                planId = existing.rows[0].id;
            }
            else {
                const initCheck = await client.query("SELECT id FROM initiatives WHERE id = $1", [initiativeId]);
                if (initCheck.rows.length === 0)
                    throw new Error("Initiative not found");
                planId = uuid();
                const versionRow = await client.query("SELECT coalesce(max(version), 0) + 1 AS v FROM plans WHERE initiative_id = $1", [initiativeId]);
                const version = versionRow.rows[0]?.v ?? 1;
                await client.query("INSERT INTO plans (id, initiative_id, plan_hash, name, version) VALUES ($1, $2, $3, $4, $5)", [planId, initiativeId, planHash, `Produce ${produces}`, version]);
                const nodeId = uuid();
                await client.query("INSERT INTO plan_nodes (id, plan_id, node_key, job_type, node_type) VALUES ($1, $2, $3, $4, 'job')", [nodeId, planId, "produce", jobType]);
            }
            let releaseId;
            try {
                const route = await routeRun(pool, environment);
                releaseId = route.releaseId;
            }
            catch (routeErr) {
                const msg = routeErr.message;
                if (!msg.includes("No promoted release"))
                    throw routeErr;
                const ins = await pool.query("INSERT INTO releases (id, status, percent_rollout, policy_version) VALUES ($1, 'promoted', 100, 'latest') RETURNING id", [uuid()]);
                releaseId = ins.rows[0].id;
            }
            return createRun(client, {
                planId,
                releaseId,
                policyVersion: "latest",
                environment: environment,
                cohort: "control",
                rootIdempotencyKey: `by-artifact-type:${produces}:${Date.now()}`,
                llmSource: "gateway",
            });
        });
        res.status(201).json({
            id: runId,
            produces,
            consumes,
            message: "Resolved operator from capability graph; single-node plan and run created. Runner will produce the artifact when connected.",
        });
    }
    catch (e) {
        const msg = e.message;
        if (msg === "Initiative not found")
            return res.status(404).json({ error: msg });
        if (msg.includes("No operator produces"))
            return res.status(400).json({ error: msg });
        res.status(500).json({ error: msg });
    }
});
/** POST /v1/initiatives/:id/plan — create a plan via plan compiler (idempotent by plan_hash) */
app.post("/v1/initiatives/:id/plan", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const initiativeId = req.params.id;
        const body = req.body ?? {};
        const { compilePlan } = await import("./plan-compiler.js");
        const compiled = await withTransaction((client) => compilePlan(client, initiativeId, { seed: body.seed, force: body.force }));
        const nodeCount = compiled.nodeIds.size;
        res.status(201).json({ id: compiled.planId, initiative_id: initiativeId, status: "draft", nodes: nodeCount, plan_hash: compiled.planHash });
    }
    catch (e) {
        const msg = e.message;
        if (msg === "Initiative not found")
            return res.status(404).json({ error: msg });
        res.status(500).json({ error: msg });
    }
});
/** POST /v1/plans/:id/start — create a run for this plan (get or create release, then createRun). Body: { environment?: "sandbox"|"staging"|"prod", llm_source?: "gateway"|"openai_direct" }. */
app.post("/v1/plans/:id/start", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const planId = req.params.id;
        const body = req.body;
        const environment = body?.environment ?? "sandbox";
        const llmSource = body?.llm_source === "openai_direct" ? "openai_direct" : "gateway";
        if (!["sandbox", "staging", "prod"].includes(environment)) {
            return res.status(400).json({ error: "environment must be sandbox, staging, or prod" });
        }
        const planRow = await pool.query("SELECT id, initiative_id FROM plans WHERE id = $1", [planId]);
        if (planRow.rows.length === 0)
            return res.status(404).json({ error: "Plan not found" });
        const initiativeId = planRow.rows[0].initiative_id;
        const initRow = await pool.query("SELECT template_id, intent_type FROM initiatives WHERE id = $1", [initiativeId]);
        if (initRow.rows.length > 0) {
            const { template_id: templateId, intent_type: intentType } = initRow.rows[0];
            if (intentType === "email_design_generator" && templateId) {
                const gate = await runTemplateLintGate(pool, templateId);
                if (!gate.ok) {
                    const message = "Template lint failed: " + gate.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
                    return res.status(400).json({ error: message, lint_errors: gate.errors });
                }
            }
        }
        let releaseId;
        try {
            const route = await routeRun(pool, environment);
            releaseId = route.releaseId;
        }
        catch (routeErr) {
            const msg = routeErr.message;
            if (!msg.includes("No promoted release"))
                throw routeErr;
            const ins = await pool.query(`INSERT INTO releases (id, status, percent_rollout, policy_version) VALUES ($1, 'promoted', 100, 'latest') RETURNING id`, [uuid()]);
            releaseId = ins.rows[0].id;
        }
        const runId = await withTransaction(async (client) => {
            return createRun(client, {
                planId,
                releaseId,
                policyVersion: "latest",
                environment: environment,
                cohort: "control",
                rootIdempotencyKey: `console:${planId}:${Date.now()}`,
                llmSource,
            });
        });
        res.status(201).json({ id: runId });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/runs/:id/rerun — create a new run with the same plan (Operator+) */
app.post("/v1/runs/:id/rerun", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const runId = req.params.id;
        let r = await pool.query("SELECT plan_id, release_id, policy_version, environment, cohort, llm_source FROM runs WHERE id = $1", [runId]).catch(() => null);
        if (!r || r.rows.length === 0) {
            r = await pool.query("SELECT plan_id, release_id, policy_version, environment, cohort FROM runs WHERE id = $1", [runId]);
            if (r.rows.length === 0)
                return res.status(404).json({ error: "Run not found" });
        }
        const row = r.rows[0];
        const llmSource = row.llm_source === "openai_direct" ? "openai_direct" : "gateway";
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/runs/:id/rollback — trigger rollback for this run's release in this environment */
app.post("/v1/runs/:id/rollback", async (req, res) => {
    try {
        const role = getRole(req);
        if (role !== "admin" && role !== "operator")
            return res.status(403).json({ error: "Forbidden" });
        const runId = req.params.id;
        const r = await pool.query("SELECT release_id, environment FROM runs WHERE id = $1", [runId]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Run not found" });
        const { release_id, environment } = r.rows[0];
        await executeRollback(pool, release_id, environment);
        res.json({ ok: true, release_id, environment });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/releases/:id/rollout — set percent_rollout (0–100) for the release (Admin/Operator) */
app.post("/v1/releases/:id/rollout", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const releaseId = req.params.id;
        const percent = Number(req.body.percent);
        if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
            return res.status(400).json({ error: "Body must include percent (0–100)" });
        }
        await pool.query("UPDATE releases SET percent_rollout = $1, status = 'promoted' WHERE id = $2", [percent, releaseId]);
        const up = await pool.query("SELECT id, percent_rollout FROM releases WHERE id = $1", [releaseId]);
        if (up.rows.length === 0)
            return res.status(404).json({ error: "Release not found" });
        res.json(up.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/releases/:id/canary — set canary percent in release_routes for an environment */
app.post("/v1/releases/:id/canary", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const releaseId = req.params.id;
        const { environment = "prod", percent = 0 } = req.body;
        const pct = Math.max(0, Math.min(100, Number(percent)));
        const ruleId = `canary-${releaseId.slice(0, 8)}-${environment}`;
        await pool.query(`INSERT INTO release_routes (rule_id, release_id, environment, cohort, percent, active_from, active_to)
       VALUES ($1, $2, $3::environment_type, 'canary', $4, now(), NULL)`, [ruleId, releaseId, environment, pct]);
        const policies = await pool.query("SELECT * FROM release_routes WHERE release_id = $1 AND environment = $2", [releaseId, environment]);
        res.json({ release_id: releaseId, environment, canary_percent: pct, routes: policies.rows });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/approvals/pending — list runs/nodes waiting for human approval (from approval_requests) */
app.get("/v1/approvals/pending", async (_req, res) => {
    try {
        const r = await pool.query(`SELECT ar.id, ar.run_id, ar.plan_node_id, ar.requested_at, ar.requested_reason, ar.context_ref,
              pn.node_key, pn.job_type
       FROM approval_requests ar
       JOIN plan_nodes pn ON pn.id = ar.plan_node_id
       ORDER BY ar.requested_at ASC`).catch(() => ({ rows: [] }));
        res.json({ items: r.rows ?? [] });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/approvals — record an approval decision; accepts plan_node_id; clears approval_requests row */
app.post("/v1/approvals", async (req, res) => {
    try {
        const role = getRole(req);
        if (role !== "approver" && role !== "admin")
            return res.status(403).json({ error: "Approver or Admin required" });
        const body = req.body;
        const { run_id, job_run_id, plan_node_id, action, comment } = body;
        if (!run_id || !action)
            return res.status(400).json({ error: "run_id and action (approve|reject) required" });
        if (action !== "approve" && action !== "reject")
            return res.status(400).json({ error: "action must be approve or reject" });
        const approver = req.headers["x-user-id"] ?? "api";
        const actionVal = action === "approve" ? "approved" : "rejected";
        let r;
        try {
            r = await pool.query(`INSERT INTO approvals (run_id, job_run_id, plan_node_id, approver, action, comment)
         VALUES ($1, $2, $3, $4, $5::approval_action, $6) RETURNING *`, [run_id, job_run_id ?? null, plan_node_id ?? null, approver, actionVal, comment ?? null]);
        }
        catch (e) {
            if (e.code === "42703") {
                r = await pool.query(`INSERT INTO approvals (run_id, job_run_id, approver, action) VALUES ($1, $2, $3, $4::approval_action) RETURNING *`, [run_id, job_run_id ?? null, approver, actionVal]);
            }
            else
                throw e;
        }
        if (plan_node_id) {
            await pool.query("DELETE FROM approval_requests WHERE run_id = $1 AND plan_node_id = $2", [run_id, plan_node_id]).catch(() => { });
            if (actionVal === "approved") {
                const client = await pool.connect();
                let committed = false;
                try {
                    await client.query("BEGIN");
                    await completeApprovalAndAdvance(client, run_id, plan_node_id);
                    await client.query("COMMIT");
                    committed = true;
                }
                catch (e) {
                    await client.query("ROLLBACK").catch(() => { });
                    throw e;
                }
                finally {
                    if (!committed)
                        await client.query("ROLLBACK").catch(() => { });
                    client.release();
                }
            }
        }
        res.status(201).json(r.rows[0] ?? { run_id, action: actionVal });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/job_runs/:id/retry — requeue a failed job_run (new attempt, status queued) */
app.post("/v1/job_runs/:id/retry", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const jobRunId = req.params.id;
        const jr = await pool.query("SELECT id, run_id, plan_node_id, attempt FROM job_runs WHERE id = $1", [jobRunId]);
        if (jr.rows.length === 0)
            return res.status(404).json({ error: "Job run not found" });
        const row = jr.rows[0];
        const newAttempt = (row.attempt ?? 1) + 1;
        const newJobRunId = uuid();
        await pool.query(`INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key)
       VALUES ($1, $2, $3, $4, 'queued', $5)`, [newJobRunId, row.run_id, row.plan_node_id, newAttempt, `retry:${jobRunId}:${newAttempt}`]);
        res.status(201).json({ id: newJobRunId, run_id: row.run_id, attempt: newAttempt });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/job_runs — list with filters and pagination */
app.get("/v1/job_runs", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const environment = req.query.environment;
        const status = req.query.status;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (environment) {
            conditions.push(`r.environment = $${i++}`);
            params.push(environment);
        }
        if (status) {
            conditions.push(`jr.status::text = $${i++}`);
            params.push(status);
        }
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/releases — list with optional status filter */
app.get("/v1/releases", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const status = req.query.status;
        let q = "SELECT * FROM releases ORDER BY created_at DESC LIMIT $1 OFFSET $2";
        const params = [limit, offset];
        if (status) {
            q = "SELECT * FROM releases WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
            params.unshift(status);
        }
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/releases/:id */
app.get("/v1/releases/:id", async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM releases WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/tool_calls — list with pagination and filters (run_id = tool_calls for that run via job_runs) */
app.get("/v1/tool_calls", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const run_id = req.query.run_id;
        const job_run_id = req.query.job_run_id;
        const status = req.query.status;
        const adapter_id = req.query.adapter_id;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (run_id) {
            conditions.push(`tc.job_run_id IN (SELECT id FROM job_runs WHERE run_id = $${i++})`);
            params.push(run_id);
        }
        if (job_run_id) {
            conditions.push(`tc.job_run_id = $${i++}`);
            params.push(job_run_id);
        }
        if (status) {
            conditions.push(`tc.status = $${i++}`);
            params.push(status);
        }
        if (adapter_id) {
            conditions.push(`tc.adapter_id = $${i++}`);
            params.push(adapter_id);
        }
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
        const paramList = [run_id, job_run_id, status, adapter_id].filter(Boolean);
        paramList.push(limit, offset);
        const finalQ = run_id
            ? `SELECT tc.* FROM tool_calls tc JOIN job_runs jr ON jr.id = tc.job_run_id WHERE jr.run_id = $1 ORDER BY tc.started_at DESC NULLS LAST LIMIT $2 OFFSET $3`
            : `SELECT * FROM tool_calls WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC NULLS LAST LIMIT $${i} OFFSET $${i + 1}`;
        const finalParams = run_id ? [run_id, limit, offset] : params;
        const r = await pool.query(run_id ? finalQ : `SELECT * FROM tool_calls WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC NULLS LAST LIMIT $${i} OFFSET $${i + 1}`, finalParams);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/artifacts/:id — single artifact with optional download URL */
app.get("/v1/artifacts/:id", async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM artifacts WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Artifact not found" });
        const artifact = r.rows[0];
        if (artifact.uri?.startsWith("supabase-storage://")) {
            try {
                const { getArtifactSignedUrl } = await import("./artifact-storage.js");
                const downloadUrl = await getArtifactSignedUrl(artifact.uri);
                if (downloadUrl)
                    artifact.download_url = downloadUrl;
            }
            catch { /* storage not configured */ }
        }
        res.json(artifact);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/artifacts/:id/content — artifact body for preview (e.g. landing page HTML). Use as view URL. */
app.get("/v1/artifacts/:id/content", async (req, res) => {
    try {
        const r = await pool.query("SELECT id, artifact_type, metadata_json, uri FROM artifacts WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).send("Artifact not found");
        const row = r.rows[0];
        let content = row.metadata_json?.content ?? null;
        if (content == null && row.uri?.startsWith("supabase-storage://")) {
            try {
                const { downloadArtifact } = await import("./artifact-storage.js");
                content = await downloadArtifact(row.uri);
            }
            catch { /* storage not configured */ }
        }
        if (content == null)
            return res.status(404).send("Artifact content not available");
        const isHtml = row.artifact_type === "landing_page" || row.artifact_type === "email_template";
        res.setHeader("Content-Type", isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=60");
        res.send(content);
    }
    catch (e) {
        res.status(500).send(String(e.message));
    }
});
/** GET /v1/artifacts/:id/analyze — analyze rendered email artifact for load failures (unreplaced placeholders, bad image src). For self-heal and template proof. */
app.get("/v1/artifacts/:id/analyze", async (req, res) => {
    try {
        const r = await pool.query("SELECT id, artifact_type, metadata_json, uri FROM artifacts WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Artifact not found" });
        const row = r.rows[0];
        let content = row.metadata_json?.content ?? null;
        if (content == null && row.uri?.startsWith("supabase-storage://")) {
            try {
                const { downloadArtifact } = await import("./artifact-storage.js");
                content = await downloadArtifact(row.uri);
            }
            catch { /* storage not configured */ }
        }
        if (content == null)
            return res.status(404).json({ error: "Artifact content not available" });
        const { analyzeArtifactContent } = await import("./artifact-content-analyzer.js");
        const result = analyzeArtifactContent(content);
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/artifacts/:id — update artifact metadata_json (content and/or metadata). Primary use: email_template edit (Phase 5). Operator+ only. */
const MAX_ARTIFACT_CONTENT_BYTES = 2 * 1024 * 1024; // 2MB
app.patch("/v1/artifacts/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : {};
        }
        catch {
            return res.status(400).json({ error: "Invalid JSON body" });
        }
        if (body.content !== undefined && typeof body.content !== "string")
            return res.status(400).json({ error: "content must be a string" });
        if (body.content !== undefined && Buffer.byteLength(body.content, "utf8") > MAX_ARTIFACT_CONTENT_BYTES)
            return res.status(400).json({ error: "content too large" });
        if (body.metadata !== undefined) {
            if (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata))
                return res.status(400).json({ error: "metadata must be a plain object" });
            if (Object.getPrototypeOf(body.metadata) !== Object.prototype)
                return res.status(400).json({ error: "metadata must be a plain object" });
            for (const key of Object.keys(body.metadata)) {
                if (!ARTIFACT_METADATA_JSON_ALLOWLIST.has(key)) {
                    console.warn(`[PATCH artifact] metadata key "${key}" is not in the documented allowlist (content, mjml, error_signature, type). See docs/SCHEMA_JSON_GUARDRAILS.md.`, { artifact_id: req.params.id });
                }
            }
        }
        const id = req.params.id;
        const r = await pool.query("SELECT id, metadata_json FROM artifacts WHERE id = $1", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Artifact not found" });
        const row = r.rows[0];
        let nextMeta = (row.metadata_json && typeof row.metadata_json === "object" ? { ...row.metadata_json } : {});
        if (body.content !== undefined)
            nextMeta = { ...nextMeta, content: body.content };
        if (body.metadata !== undefined)
            nextMeta = { ...nextMeta, ...body.metadata };
        await pool.query("UPDATE artifacts SET metadata_json = $1::jsonb WHERE id = $2", [JSON.stringify(nextMeta), id]);
        const updated = await pool.query("SELECT * FROM artifacts WHERE id = $1", [id]);
        const updatedRow = updated.rows[0];
        if (process.env.NODE_ENV !== "test")
            console.info("[PATCH artifact]", { artifact_id: id, run_id: updatedRow?.run_id });
        res.json(updated.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/artifacts/:id/knowledge — set Artifact/Knowledge graph fields: derived_from_artifact_id, scope_type, scope_id. */
app.patch("/v1/artifacts/:id/knowledge", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const id = req.params.id;
        const body = req.body ?? {};
        const check = await pool.query("SELECT id FROM artifacts WHERE id = $1", [id]);
        if (check.rows.length === 0)
            return res.status(404).json({ error: "Artifact not found" });
        const updates = [];
        const params = [];
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
        if (updates.length === 0)
            return res.status(400).json({ error: "Body must include at least one of derived_from_artifact_id, scope_type, scope_id" });
        params.push(id);
        await pool.query(`UPDATE artifacts SET ${updates.join(", ")} WHERE id = $${i}`, params);
        const updated = await pool.query("SELECT id, derived_from_artifact_id, scope_type, scope_id FROM artifacts WHERE id = $1", [id]);
        res.json(updated.rows[0] ?? { id });
    }
    catch (e) {
        const err = e;
        if (err.code === "42703")
            return res.status(503).json({ error: "Artifact knowledge columns not present. Run migration 20250331000012_artifact_knowledge_graph.sql." });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/artifacts/:id/referenced_by — add a page reference (Artifact/Knowledge graph: referenced_by). */
app.post("/v1/artifacts/:id/referenced_by", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const id = req.params.id;
        const body = req.body;
        const pageRef = body?.page_ref?.trim();
        if (!pageRef)
            return res.status(400).json({ error: "Body must include page_ref (URL or page identifier)" });
        const refType = body?.ref_type?.trim() || "page";
        const check = await pool.query("SELECT id FROM artifacts WHERE id = $1", [id]);
        if (check.rows.length === 0)
            return res.status(404).json({ error: "Artifact not found" });
        await pool.query("INSERT INTO artifact_page_references (artifact_id, page_ref, ref_type) VALUES ($1, $2, $3) ON CONFLICT (artifact_id, page_ref) DO NOTHING", [id, pageRef, refType]);
        const refs = await pool.query("SELECT id, page_ref, ref_type FROM artifact_page_references WHERE artifact_id = $1", [id]);
        res.status(201).json({ artifact_id: id, referenced_by: refs.rows });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(503).json({ error: "artifact_page_references table not present. Run migration 20250331000012_artifact_knowledge_graph.sql." });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/artifacts — list with pagination and filters */
app.get("/v1/artifacts", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const run_id = req.query.run_id;
        const artifact_class = req.query.artifact_class;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (run_id) {
            conditions.push(`run_id = $${i++}`);
            params.push(run_id);
        }
        if (artifact_class) {
            conditions.push(`artifact_class = $${i++}`);
            params.push(artifact_class);
        }
        params.push(limit, offset);
        const q = `SELECT * FROM artifacts WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/llm_calls — list with pagination, filters, and time range */
app.get("/v1/llm_calls", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const run_id = req.query.run_id;
        const job_run_id = req.query.job_run_id;
        const model_tier = req.query.model_tier;
        const from = req.query.from;
        const to = req.query.to;
        const format = req.query.format;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (run_id) {
            conditions.push(`run_id = $${i++}`);
            params.push(run_id);
        }
        if (job_run_id) {
            conditions.push(`job_run_id = $${i++}`);
            params.push(job_run_id);
        }
        if (model_tier) {
            conditions.push(`model_tier = $${i++}`);
            params.push(model_tier);
        }
        if (from) {
            conditions.push(`created_at >= $${i++}`);
            params.push(from);
        }
        if (to) {
            conditions.push(`created_at <= $${i++}`);
            params.push(to);
        }
        params.push(limit, offset);
        const q = `SELECT id, run_id, job_run_id, model_tier, model_id, tokens_in, tokens_out, latency_ms, created_at FROM llm_calls WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const r = await pool.query(q, params);
        if (format === "csv") {
            const header = "id,run_id,job_run_id,model_tier,model_id,tokens_in,tokens_out,latency_ms,created_at";
            const rows = r.rows.map((row) => `${row.id},${row.run_id},${row.job_run_id},${row.model_tier},${row.model_id},${row.tokens_in ?? ""},${row.tokens_out ?? ""},${row.latency_ms ?? ""},${row.created_at}`);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", "attachment; filename=llm_calls.csv");
            return res.send([header, ...rows].join("\n"));
        }
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/usage — aggregate LLM usage with percentiles, error rates, provider breakdown, and estimated cost */
app.get("/v1/usage", async (req, res) => {
    try {
        const from = req.query.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
        const to = req.query.to ?? new Date().toISOString();
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
      `, [from, to]).then(r => r.rows),
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
        const byProviderMap = {};
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/policies — list with pagination */
app.get("/v1/policies", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const r = await pool.query("SELECT version, created_at, rules_json FROM policies ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/adapters — list with pagination and filters */
app.get("/v1/adapters", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const name = req.query.name;
        let q = "SELECT * FROM adapters ORDER BY created_at DESC LIMIT $1 OFFSET $2";
        const params = [limit, offset];
        if (name) {
            q = "SELECT * FROM adapters WHERE name = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
            params.unshift(name);
        }
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/capability_grants — list with pagination and filters */
app.get("/v1/capability_grants", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const environment = req.query.environment;
        const adapter_id = req.query.adapter_id;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (environment) {
            conditions.push(`environment = $${i++}`);
            params.push(environment);
        }
        if (adapter_id) {
            conditions.push(`adapter_id = $${i++}`);
            params.push(adapter_id);
        }
        params.push(limit, offset);
        const q = `SELECT * FROM capability_grants WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/secret_refs — list refs only (no values), pagination and filters */
app.get("/v1/secret_refs", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const scope = req.query.scope;
        let q = "SELECT id, name, vault_path, scope, capabilities_allowed, rotated_at FROM secret_refs ORDER BY name LIMIT $1 OFFSET $2";
        const params = [limit, offset];
        if (scope) {
            q = "SELECT id, name, vault_path, scope, capabilities_allowed, rotated_at FROM secret_refs WHERE scope = $1 ORDER BY name LIMIT $2 OFFSET $3";
            params.unshift(scope);
        }
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/audit — unified ledger (run_events + job_events) with pagination and filters */
app.get("/v1/audit", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const run_id = req.query.run_id;
        const job_run_id = req.query.job_run_id;
        let items;
        if (run_id) {
            const [re, je] = await Promise.all([
                pool.query("SELECT 'run_event' AS source, id::text, run_id, NULL::uuid AS job_run_id, event_type::text, created_at, NULL::jsonb AS payload_json FROM run_events WHERE run_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [run_id, limit, offset]),
                pool.query("SELECT 'job_event' AS source, je.id::text, jr.run_id, je.job_run_id, je.event_type::text, je.created_at, je.payload_json FROM job_events je JOIN job_runs jr ON jr.id = je.job_run_id WHERE jr.run_id = $1 ORDER BY je.created_at DESC LIMIT $2 OFFSET $3", [run_id, limit, offset]),
            ]);
            items = [...re.rows, ...je.rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
        }
        else if (job_run_id) {
            const r = await pool.query("SELECT 'job_event' AS source, id::text, (SELECT run_id FROM job_runs WHERE id = $1) AS run_id, job_run_id, event_type::text, created_at, payload_json FROM job_events WHERE job_run_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [job_run_id, limit, offset]);
            items = r.rows;
        }
        else {
            const r = await pool.query(`(SELECT 'run_event' AS source, id::text, run_id, NULL::uuid AS job_run_id, event_type::text, created_at, NULL::jsonb AS payload_json FROM run_events)
         UNION ALL (SELECT 'job_event', je.id::text, jr.run_id, je.job_run_id, je.event_type::text, je.created_at, je.payload_json FROM job_events je JOIN job_runs jr ON jr.id = je.job_run_id)
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
            items = r.rows;
        }
        res.json({ items, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/incidents — cluster by error_signature (from failed job_runs) */
app.get("/v1/incidents", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const environment = req.query.environment;
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/incidents/:signature — sample runs for this error signature */
app.get("/v1/incidents/:signature", async (req, res) => {
    try {
        const signature = decodeURIComponent(req.params.signature);
        const limit = Math.min(Number(req.query.limit) || 50, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const r = await pool.query(`SELECT jr.id, jr.run_id, jr.started_at, jr.ended_at, jr.error_message, r.environment
       FROM job_runs jr JOIN runs r ON r.id = jr.run_id
       WHERE jr.error_signature = $1 ORDER BY jr.started_at DESC LIMIT $2 OFFSET $3`, [signature, limit, offset]);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
// ---------- Graph & self-heal ----------
/** GET /v1/decision_loop/observe — anomalies + baselines. Requires kpi_baselines/kpi_observations tables (future). */
app.get("/v1/decision_loop/observe", async (_req, res) => {
    try {
        res.json({
            anomalies: [],
            baselines: [],
            message: "KPI storage not configured; add kpi_baselines and kpi_observations tables to enable.",
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/decision_loop/tick — run one tick. Body: auto_act?, compute_baselines?. */
app.post("/v1/decision_loop/tick", async (req, res) => {
    try {
        const body = req.body;
        res.json({
            observed: { anomalies: [] },
            baselines_computed: body?.compute_baselines ? 0 : undefined,
            message: "KPI storage not configured; tick is a no-op until baselines/observations are wired.",
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/incident_memory — list incident memory. */
app.get("/v1/incident_memory", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const failureClass = req.query.failure_class || null;
        let q = "SELECT memory_id, failure_signature, failure_class, resolution, confidence, times_seen, last_seen_at, created_at FROM incident_memory WHERE 1=1";
        const params = [];
        let i = 1;
        if (failureClass) {
            q += ` AND failure_class = $${i++}`;
            params.push(failureClass);
        }
        q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
        params.push(limit);
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01") {
            return res.json({ items: [], limit: 50 });
        }
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/incident_memory — record a resolution. */
app.post("/v1/incident_memory", async (req, res) => {
    try {
        const body = req.body;
        if (!body?.failure_signature || !body?.failure_class || !body?.resolution) {
            return res.status(400).json({ error: "failure_signature, failure_class, and resolution required" });
        }
        await incidentRecord(pool, body.failure_signature, body.failure_class, body.resolution, typeof body.confidence === "number" ? body.confidence : 0.8);
        res.status(201).json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/memory/lookup — similar incidents by signature. */
app.get("/v1/memory/lookup", async (req, res) => {
    try {
        const signature = req.query.signature || req.query.failure_signature || "";
        const scopeKey = req.query.scope_key || null;
        const limit = Math.min(Number(req.query.limit) || 10, 50);
        const incidents = await incidentLookup(pool, signature, null, limit);
        let entries = [];
        try {
            let q = "SELECT memory_id, memory_type, scope_type, scope_key, title, summary, signature_json, resolution_json, confidence, times_seen, last_seen_at FROM memory_entries WHERE memory_type IN ('incident', 'repair_recipe', 'failure_pattern')";
            const params = [];
            let i = 1;
            if (scopeKey) {
                q += ` AND (scope_key = $${i++} OR scope_key IS NULL)`;
                params.push(scopeKey);
            }
            q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
            params.push(limit);
            const r = await pool.query(q, params);
            entries = r.rows;
        }
        catch {
            // table may not exist
        }
        res.json({ similar_incidents: incidents, memory_entries: entries });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01") {
            return res.json({ similar_incidents: [], memory_entries: [] });
        }
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/memory_entries — list memory_entries. */
app.get("/v1/memory_entries", async (req, res) => {
    try {
        const memoryType = req.query.memory_type || null;
        const scopeType = req.query.scope_type || null;
        const scopeKey = req.query.scope_key || null;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        let q = "SELECT memory_id, memory_type, scope_type, scope_key, title, summary, signature_json, evidence_json, resolution_json, confidence, times_seen, last_seen_at, created_at FROM memory_entries WHERE 1=1";
        const params = [];
        let i = 1;
        if (memoryType) {
            q += ` AND memory_type = $${i++}`;
            params.push(memoryType);
        }
        if (scopeType) {
            q += ` AND scope_type = $${i++}`;
            params.push(scopeType);
        }
        if (scopeKey) {
            q += ` AND scope_key = $${i++}`;
            params.push(scopeKey);
        }
        q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
        params.push(limit);
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.json({ items: [], limit: 50 });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/deploy_events — record a build/deploy outcome. */
app.post("/v1/deploy_events", async (req, res) => {
    try {
        const body = req.body;
        if (!body?.status)
            return res.status(400).json({ error: "status required" });
        const result = await createDeployEventFromPayload(pool, body);
        res.status(201).json(result);
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(503).json({ error: "deploy_events table not present. Run migration 20250315000000_graph_self_heal_tables.sql." });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/deploy_events/:id/repair_plan — deploy details and suggested actions. */
app.get("/v1/deploy_events/:id/repair_plan", async (req, res) => {
    try {
        const deployId = req.params.id;
        const deployRow = await pool.query("SELECT deploy_id, service_id, commit_sha, status, failure_class, error_signature, change_event_id FROM deploy_events WHERE deploy_id = $1", [deployId]);
        if (deployRow.rows.length === 0)
            return res.status(404).json({ error: "deploy event not found" });
        const deploy = deployRow.rows[0];
        let suggested_actions = [];
        try {
            const ar = await pool.query("SELECT action_id, action_key, label, description, risk_level, requires_approval FROM build_repair_actions ORDER BY action_key");
            suggested_actions = ar.rows;
        }
        catch {
            // table may not exist
        }
        let similar_incidents = [];
        if (deploy.error_signature || deploy.failure_class) {
            similar_incidents = await incidentLookup(pool, deploy.error_signature ?? "", deploy.failure_class, 10);
        }
        res.json({
            deploy_id: deploy.deploy_id,
            service_id: deploy.service_id,
            commit_sha: deploy.commit_sha,
            status: deploy.status,
            failure_class: deploy.failure_class,
            error_signature: deploy.error_signature,
            change_event_id: deploy.change_event_id,
            suggested_actions,
            similar_incidents,
            build_config_snapshot: null,
            suggested_file_actions: { suggested_files: [], unresolved_path: null },
        });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(404).json({ error: "deploy_events not available" });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/deploy_events — list deploy events. */
app.get("/v1/deploy_events", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const serviceId = req.query.service_id || null;
        const status = req.query.status || null;
        let q = "SELECT deploy_id, change_event_id, service_id, commit_sha, status, failure_class, error_signature, external_deploy_id, created_at FROM deploy_events WHERE 1=1";
        const params = [];
        let i = 1;
        if (serviceId) {
            q += ` AND service_id = $${i++}`;
            params.push(serviceId);
        }
        if (status) {
            q += ` AND status = $${i++}`;
            params.push(status);
        }
        q += ` ORDER BY created_at DESC LIMIT $${i}`;
        params.push(limit);
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.json({ items: [], limit: 50 });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/deploy_events/sync — sync from Render API into deploy_events (by external_deploy_id). */
app.post("/v1/deploy_events/sync", async (_req, res) => {
    try {
        const apiKey = process.env.RENDER_API_KEY?.trim();
        if (!apiKey) {
            return res.json({ synced: 0, message: "Configure RENDER_API_KEY and RENDER_STAGING_SERVICE_IDS (or RENDER_WORKER_SERVICE_ID) to enable sync." });
        }
        const { getStagingServiceIds, listRenderDeploys } = await import("./render-worker-remediate.js");
        const serviceIds = await getStagingServiceIds();
        if (serviceIds.length === 0) {
            return res.json({ synced: 0, message: "No Render service IDs configured (RENDER_STAGING_SERVICE_IDS or RENDER_WORKER_SERVICE_ID)." });
        }
        let synced = 0;
        for (const serviceId of serviceIds) {
            let deploys;
            try {
                deploys = await listRenderDeploys(apiKey, serviceId, 20);
            }
            catch (err) {
                continue;
            }
            for (const d of deploys) {
                const existing = await pool.query("SELECT 1 FROM deploy_events WHERE external_deploy_id = $1 LIMIT 1", [d.id]);
                if (existing.rows.length > 0)
                    continue;
                await createDeployEventFromPayload(pool, {
                    status: d.status,
                    service_id: serviceId,
                    commit_sha: d.commit ?? undefined,
                    external_deploy_id: d.id,
                });
                synced++;
            }
        }
        res.json({ synced, message: synced ? `Synced ${synced} deploy(s) from Render.` : "No new deploys to sync." });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/deploy_events/sync_github — sync from GitHub Actions workflow runs (optional). */
app.post("/v1/deploy_events/sync_github", async (_req, res) => {
    try {
        const token = process.env.GITHUB_TOKEN?.trim();
        const repos = process.env.GITHUB_REPOS?.trim()?.split(",").map((s) => s.trim()).filter(Boolean);
        if (!token || !repos?.length) {
            return res.json({ synced: 0, message: "Configure GITHUB_TOKEN and GITHUB_REPOS (owner/repo, comma-separated) to enable sync." });
        }
        let synced = 0;
        for (const repo of repos) {
            const [owner, repoName] = repo.split("/");
            if (!owner || !repoName)
                continue;
            const resGh = await fetch(`https://api.github.com/repos/${owner}/${repoName}/actions/runs?per_page=20&status=completed`, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` } });
            if (!resGh.ok)
                continue;
            const data = (await resGh.json());
            const runs = data.workflow_runs ?? [];
            for (const run of runs) {
                const externalId = `github:${owner}/${repoName}:${run.id}`;
                const existing = await pool.query("SELECT 1 FROM deploy_events WHERE external_deploy_id = $1 LIMIT 1", [externalId]);
                if (existing.rows.length > 0)
                    continue;
                const status = run.conclusion === "success" ? "success" : run.conclusion === "failure" ? "failed" : run.status;
                await createDeployEventFromPayload(pool, {
                    status,
                    service_id: `github:${repo}`,
                    commit_sha: run.head_sha ?? undefined,
                    external_deploy_id: externalId,
                });
                synced++;
            }
        }
        res.json({ synced, message: synced ? `Synced ${synced} workflow run(s) from GitHub.` : "No new runs to sync." });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/vercel/register — register a Vercel project for self-heal (webhook + redeploy scan). Body: { projectId: string, teamId?: string }. */
app.post("/v1/vercel/register", async (req, res) => {
    try {
        const body = req.body;
        const projectId = body?.projectId?.trim();
        if (!projectId)
            return res.status(400).json({ error: "projectId required" });
        const result = await registerVercelProjectForSelfHeal(projectId, body?.teamId?.trim());
        res.status(201).json({ projectId, ...result });
    }
    catch (e) {
        const err = e;
        if (err.message?.includes("vercel_self_heal_projects table not present"))
            return res.status(503).json({ error: err.message });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/checkpoints — list graph checkpoints. */
app.get("/v1/checkpoints", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const scopeType = req.query.scope_type || null;
        const scopeId = req.query.scope_id || null;
        let q = "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE 1=1";
        const params = [];
        let i = 1;
        if (scopeType) {
            q += ` AND scope_type = $${i++}`;
            params.push(scopeType);
        }
        if (scopeId) {
            q += ` AND scope_id = $${i++}`;
            params.push(scopeId);
        }
        q += ` ORDER BY created_at DESC LIMIT $${i}`;
        params.push(limit);
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.json({ items: [], limit: 50 });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/checkpoints — create a checkpoint. */
app.post("/v1/checkpoints", async (req, res) => {
    try {
        const body = req.body;
        if (!body?.scope_type || !body?.scope_id)
            return res.status(400).json({ error: "scope_type and scope_id required" });
        const r = await pool.query("INSERT INTO graph_checkpoints (scope_type, scope_id, run_id) VALUES ($1, $2, $3) RETURNING checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at", [body.scope_type, body.scope_id, body.run_id ?? null]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/checkpoints/:id — single checkpoint. */
app.get("/v1/checkpoints/:id", async (req, res) => {
    try {
        const r = await pool.query("SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE checkpoint_id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Checkpoint not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/checkpoints/:id/diff — checkpoint vs current schema; snapshot_diff requires postMigrationAudit (optional). */
app.get("/v1/checkpoints/:id/diff", async (req, res) => {
    try {
        const cp = await pool.query("SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE checkpoint_id = $1", [req.params.id]);
        if (cp.rows.length === 0)
            return res.status(404).json({ error: "Checkpoint not found" });
        const checkpoint = cp.rows[0];
        res.json({
            checkpoint_id: checkpoint.checkpoint_id,
            scope_type: checkpoint.scope_type,
            scope_id: checkpoint.scope_id,
            created_at: checkpoint.created_at,
            current_schema: { tables: 0, columns: 0 },
            current_tables: [],
            current_columns: [],
            snapshot_artifact_id: checkpoint.schema_snapshot_artifact_id,
            snapshot_diff: null,
            message: "Post-migration audit not run; set up artifact content for schema snapshot to compute diff.",
        });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(404).json({ error: "Checkpoint not found" });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/known_good — latest checkpoint for scope. */
app.get("/v1/known_good", async (req, res) => {
    try {
        const scopeType = req.query.scope_type || null;
        const scopeId = req.query.scope_id || null;
        if (!scopeType || !scopeId)
            return res.status(400).json({ error: "scope_type and scope_id required" });
        const r = await pool.query("SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE scope_type = $1 AND scope_id = $2 ORDER BY created_at DESC LIMIT 1", [scopeType, scopeId]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "No checkpoint found for this scope" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/failure_clusters — failure_class counts from incident_memory. */
app.get("/v1/failure_clusters", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const r = await pool.query("SELECT failure_class, COUNT(*) AS count, MAX(last_seen_at) AS last_seen FROM incident_memory GROUP BY failure_class ORDER BY count DESC, last_seen DESC LIMIT $1", [limit]);
        res.json({ clusters: r.rows });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.json({ clusters: [] });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/change_events — list change events. */
app.get("/v1/change_events", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const offset = Number(req.query.offset) || 0;
        const r = await pool.query("SELECT change_event_id, source_type, source_ref, change_class, summary, diff_artifact_id, created_at FROM change_events ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.json({ items: [], limit: 50, offset: 0 });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/change_events — create a change event. */
app.post("/v1/change_events", async (req, res) => {
    try {
        const body = req.body;
        if (!body?.source_type || !body?.change_class)
            return res.status(400).json({ error: "source_type and change_class required" });
        const r = await pool.query("INSERT INTO change_events (source_type, source_ref, change_class, summary, diff_artifact_id) VALUES ($1, $2, $3, $4, $5) RETURNING change_event_id", [body.source_type, body.source_ref ?? null, body.change_class, body.summary ?? null, body.diff_artifact_id ?? null]);
        res.status(201).json({ change_event_id: r.rows[0].change_event_id });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/change_events/:id — single change event. */
app.get("/v1/change_events/:id", async (req, res) => {
    try {
        const r = await pool.query("SELECT change_event_id, source_type, source_ref, change_class, summary, diff_artifact_id, created_at FROM change_events WHERE change_event_id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Change event not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/change_events/:id/impacts — list graph_impacts. */
app.get("/v1/change_events/:id/impacts", async (req, res) => {
    try {
        const r = await pool.query("SELECT impact_id, change_event_id, run_id, plan_id, plan_node_id, artifact_id, impact_type, reason, created_at FROM graph_impacts WHERE change_event_id = $1 ORDER BY impact_type, plan_node_id", [req.params.id]);
        res.json({ items: r.rows });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.json({ items: [] });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/change_events/:id/impact — stub (compute impacts not implemented). */
app.post("/v1/change_events/:id/impact", async (req, res) => {
    try {
        res.json({ change_event_id: req.params.id, impacts: [] });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/change_events/:id/backfill_plan — suggested backfill steps. */
app.get("/v1/change_events/:id/backfill_plan", async (req, res) => {
    try {
        const id = req.params.id;
        const ev = await pool.query("SELECT change_event_id, source_type, change_class, summary FROM change_events WHERE change_event_id = $1", [id]);
        if (ev.rows.length === 0)
            return res.status(404).json({ error: "Change event not found" });
        const event = ev.rows[0];
        const steps = [];
        if (event.source_type === "migration" || event.change_class === "schema") {
            steps.push({ action: "review_schema", detail: "Run GET /v1/migration_audit and compare to pre-migration snapshot." });
            steps.push({ action: "backfill_if_not_null", detail: "If migration added NOT NULL columns without default, backfill existing rows before deploy." });
        }
        let impacts = { rows: [] };
        try {
            impacts = await pool.query("SELECT plan_id, plan_node_id, impact_type, reason FROM graph_impacts WHERE change_event_id = $1 LIMIT 50", [id]);
        }
        catch {
            // ignore
        }
        if (impacts.rows.length > 0) {
            steps.push({
                action: "revalidate_affected",
                detail: `Re-run or validate ${impacts.rows.length} affected plan node(s) after backfill.`,
            });
        }
        res.json({ change_event_id: id, steps, summary: event.summary });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(404).json({ error: "Change event not found" });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/import_graph — latest import graph snapshot for a service. */
app.get("/v1/import_graph", async (req, res) => {
    try {
        const serviceId = req.query.service_id;
        if (!serviceId)
            return res.status(400).json({ error: "service_id required" });
        const r = await pool.query("SELECT snapshot_id, service_id, snapshot_json, created_at FROM import_graph_snapshots WHERE service_id = $1 ORDER BY created_at DESC LIMIT 1", [serviceId]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "No import graph for this service" });
        res.json(r.rows[0]);
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(404).json({ error: "Import graph not available" });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/import_graph — store import graph snapshot. */
app.post("/v1/import_graph", async (req, res) => {
    try {
        const body = req.body;
        if (!body?.service_id || body?.snapshot_json === undefined)
            return res.status(400).json({ error: "service_id and snapshot_json required" });
        const r = await pool.query("INSERT INTO import_graph_snapshots (service_id, snapshot_json) VALUES ($1, $2) RETURNING snapshot_id, service_id, created_at", [body.service_id, JSON.stringify(body.snapshot_json)]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(501).json({ error: "Run migration 20250315000000_graph_self_heal_tables.sql first" });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/schema_drift — current schema vs stored snapshot; returns diff if any. */
app.get("/v1/schema_drift", async (_req, res) => {
    try {
        const { computeSchemaDrift } = await import("./schema-drift.js");
        const result = await computeSchemaDrift(pool);
        res.json(result);
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.json({ current_schema: null, stored_snapshot: null, stored_id: null, diff: null, has_drift: false, message: "schema_snapshots table not found; run migration 20250331000013_schema_snapshots.sql." });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/schema_drift/capture — store current schema as new snapshot (label optional). */
app.post("/v1/schema_drift/capture", async (req, res) => {
    try {
        const { captureSchemaSnapshot } = await import("./schema-drift.js");
        const label = req.body?.label ?? "manual";
        const { id } = await captureSchemaSnapshot(pool, label);
        res.status(201).json({ id, message: "Schema snapshot captured." });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(501).json({ error: "Run migration 20250331000013_schema_snapshots.sql first." });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/contract_breakage_scan — plan nodes with schema refs (contracts at risk). */
app.get("/v1/contract_breakage_scan", async (req, res) => {
    try {
        const scopeKey = req.query.scope_key || null;
        let q = `SELECT pn.id AS plan_node_id, pn.plan_id, pn.node_key, pn.job_type, pn.input_schema_ref, pn.output_schema_ref
       FROM plan_nodes pn WHERE (pn.input_schema_ref IS NOT NULL OR pn.output_schema_ref IS NOT NULL)`;
        const params = [];
        if (scopeKey) {
            q += " AND pn.plan_id IN (SELECT id FROM plans WHERE initiative_id IN (SELECT id FROM initiatives WHERE intent_type = $1))";
            params.push(scopeKey);
        }
        q += " ORDER BY pn.plan_id, pn.node_key";
        const r = await pool.query(q, params);
        res.json({ scope_key: scopeKey, contracts: r.rows, message: "Plan nodes with schema refs; review after schema changes." });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.json({ scope_key: null, contracts: [], message: "Plan nodes table not present." });
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/schema_contracts — capability graph artifact types and operators (for Schema & contracts page). */
app.get("/v1/schema_contracts", async (_req, res) => {
    try {
        let artifact_types = [];
        let operators = [];
        try {
            const at = await pool.query("SELECT key FROM artifact_types ORDER BY key");
            artifact_types = at.rows;
            const op = await pool.query("SELECT key, priority FROM operators ORDER BY priority NULLS LAST, key");
            operators = op.rows;
        }
        catch {
            // capability graph tables may not exist
        }
        res.json({
            artifact_types: artifact_types.map((r) => r.key),
            operators: operators.map((r) => ({ key: r.key, priority: r.priority })),
            message: artifact_types.length || operators.length ? "From capability graph (artifact_types, operators)." : "Capability graph not seeded; run migration 20250331000011_capability_graph.sql.",
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/graph/topology/:planId — plan node graph for Graph Explorer. */
app.get("/v1/graph/topology/:planId", async (req, res) => {
    try {
        const planId = req.params.planId;
        const [nodesRows, edgesRows] = await Promise.all([
            pool.query("SELECT id, node_key, job_type, node_type FROM plan_nodes WHERE plan_id = $1 ORDER BY node_key", [planId]),
            pool.query("SELECT from_node_id, to_node_id, condition FROM plan_edges WHERE plan_id = $1", [planId]),
        ]);
        const nodes = nodesRows.rows.map((n) => ({
            id: n.id,
            node_key: n.node_key,
            job_type: n.job_type,
            node_type: n.node_type,
        }));
        const edges = edgesRows.rows.map((e) => ({
            from_node_id: e.from_node_id,
            to_node_id: e.to_node_id,
            condition: e.condition,
        }));
        res.json({ plan_id: planId, nodes, edges });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/graph/frontier/:runId — run frontier (completed vs pending nodes) for Graph Explorer. */
app.get("/v1/graph/frontier/:runId", async (req, res) => {
    try {
        const runId = req.params.runId;
        const run = await pool.query("SELECT plan_id FROM runs WHERE id = $1", [runId]).then((r) => r.rows[0]);
        if (!run)
            return res.status(404).json({ error: "Run not found", run_id: runId, completed_node_ids: [], pending_node_ids: [] });
        const planId = run.plan_id;
        const nodeProgress = await pool.query("SELECT plan_node_id, status FROM node_progress WHERE run_id = $1", [runId]);
        const completed_node_ids = [];
        const pending_node_ids = [];
        for (const row of nodeProgress.rows) {
            if (row.status === "succeeded" || row.status === "failed" || row.status === "skipped") {
                completed_node_ids.push(row.plan_node_id);
            }
            else {
                pending_node_ids.push(row.plan_node_id);
            }
        }
        if (completed_node_ids.length === 0 && pending_node_ids.length === 0) {
            const allNodes = await pool.query("SELECT id FROM plan_nodes WHERE plan_id = $1", [planId]);
            pending_node_ids.push(...allNodes.rows.map((n) => n.id));
        }
        res.json({ run_id: runId, plan_id: planId, completed_node_ids, pending_node_ids });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/graph/repair_plan/:runId/:nodeId — repair plan for a failed node (suggested actions from incident_memory). */
app.get("/v1/graph/repair_plan/:runId/:nodeId", async (req, res) => {
    try {
        const runId = req.params.runId;
        const nodeId = req.params.nodeId;
        const jobRun = await pool.query("SELECT id, error_signature, status FROM job_runs WHERE run_id = $1 AND plan_node_id = $2 ORDER BY attempt DESC LIMIT 1", [runId, nodeId]).then((r) => r.rows[0]);
        let suggested_actions = [];
        const subgraph_replay_scope = [];
        if (jobRun?.error_signature) {
            const similar = await incidentLookup(pool, jobRun.error_signature ?? "", null, 5);
            suggested_actions = similar.map((s, i) => ({
                action_id: `incident_${i}`,
                label: s.resolution ? s.resolution.slice(0, 200) : "Apply resolution from incident memory",
                description: s.failure_signature ?? null,
            }));
        }
        res.json({
            run_id: runId,
            node_id: nodeId,
            suggested_actions,
            subgraph_replay_scope,
            error_signature: jobRun?.error_signature ?? null,
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/graph/subgraph_replay — create a new run from the same plan (replay). Reuses same logic as rerun; node_ids reserved for future partial replay. */
app.post("/v1/graph/subgraph_replay", async (req, res) => {
    try {
        const body = req.body;
        const runId = body?.run_id;
        if (!runId)
            return res.status(400).json({ error: "run_id required" });
        let r = await pool.query("SELECT plan_id, release_id, policy_version, environment, cohort, llm_source FROM runs WHERE id = $1", [runId]).catch(() => null);
        if (!r || r.rows.length === 0) {
            r = await pool.query("SELECT plan_id, release_id, policy_version, environment, cohort FROM runs WHERE id = $1", [runId]);
            if (r.rows.length === 0)
                return res.status(404).json({ error: "Run not found" });
        }
        const row = r.rows[0];
        const llmSource = row.llm_source === "openai_direct" ? "openai_direct" : "gateway";
        const newRunId = await withTransaction(async (client) => {
            return createRun(client, {
                planId: row.plan_id,
                releaseId: row.release_id,
                policyVersion: row.policy_version ?? "latest",
                environment: row.environment,
                cohort: row.cohort,
                rootIdempotencyKey: `subgraph_replay:${runId}:${Date.now()}`,
                llmSource,
            });
        });
        res.json({ run_id: newRunId, replayed: 1, message: "New run created from same plan (full replay)." });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/migration_guard — analyze migration SQL (tables touched, simple risks). */
app.post("/v1/migration_guard", async (req, res) => {
    try {
        const body = req.body;
        const sql = (body?.sql ?? body?.migration_ref ?? "");
        const tablesTouched = [];
        const risks = [];
        const createMatch = sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w.]+\.")?(\w+)(?:"\s*)?\s*\(/gi);
        for (const m of createMatch)
            tablesTouched.push(m[1]);
        const alterMatch = sql.matchAll(/ALTER\s+TABLE\s+(?:[\w.]+\.")?(\w+)(?:"\s*)?\s+/gi);
        for (const m of alterMatch)
            tablesTouched.push(m[1]);
        const dropMatch = sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:[\w.]+\.")?(\w+)/gi);
        for (const m of dropMatch) {
            tablesTouched.push(m[1]);
            risks.push({ kind: "drop_table", detail: `DROP TABLE ${m[1]}` });
        }
        if (/DROP\s+TABLE\s+(?!IF\s+EXISTS)/i.test(sql))
            risks.push({ kind: "drop_without_if_exists", detail: "DROP TABLE without IF EXISTS" });
        const uniqueTables = [...new Set(tablesTouched)];
        res.json({
            tables_touched: uniqueTables,
            columns: [],
            risks,
            checkpoint_suggestion: uniqueTables.length > 0 ? "Create a checkpoint before applying." : null,
            raw: sql.slice(0, 2000),
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/graph/audit/:runId — graph audit for a run (run + job status summary, failed nodes as issues). */
app.get("/v1/graph/audit/:runId", async (req, res) => {
    try {
        const runId = req.params.runId;
        const run = await pool.query("SELECT id, status, plan_id FROM runs WHERE id = $1", [runId]).then((r) => r.rows[0]);
        if (!run)
            return res.status(404).json({ error: "Run not found", run_id: runId, issues: [], summary: null });
        const jobRuns = await pool.query("SELECT jr.id, jr.plan_node_id, jr.status, jr.error_signature, pn.node_key FROM job_runs jr JOIN plan_nodes pn ON pn.id = jr.plan_node_id WHERE jr.run_id = $1 ORDER BY jr.attempt DESC", [runId]);
        const byNode = new Map();
        for (const j of jobRuns.rows) {
            if (!byNode.has(j.plan_node_id))
                byNode.set(j.plan_node_id, { status: j.status, error_signature: j.error_signature, node_key: j.node_key });
        }
        const issues = Array.from(byNode.entries())
            .filter(([, v]) => v.status === "failed")
            .map(([plan_node_id, v]) => ({ plan_node_id, node_key: v.node_key, error_signature: v.error_signature }));
        const summary = {
            run_id: runId,
            run_status: run.status,
            total_nodes: byNode.size,
            failed: issues.length,
            succeeded: Array.from(byNode.values()).filter((v) => v.status === "succeeded").length,
        };
        res.json({ run_id: runId, issues, summary });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/graph/missing_capabilities/:planId — plan node job_types not in capability graph operators (if table exists). */
app.get("/v1/graph/missing_capabilities/:planId", async (req, res) => {
    try {
        const planId = req.params.planId;
        const nodeRows = await pool.query("SELECT DISTINCT job_type FROM plan_nodes WHERE plan_id = $1", [planId]);
        const jobTypes = nodeRows.rows.map((r) => r.job_type);
        let missing = [];
        try {
            const opRows = await pool.query("SELECT DISTINCT key FROM operators");
            const known = new Set(opRows.rows.map((r) => r.key));
            missing = jobTypes.filter((jt) => !known.has(jt));
        }
        catch {
            missing = jobTypes;
        }
        res.json({ plan_id: planId, job_types: jobTypes, missing });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/graph/lineage/:artifactId — Artifact/Knowledge graph: producer, consumers, derived_from, scope, referenced_by. */
app.get("/v1/graph/lineage/:artifactId", async (req, res) => {
    try {
        const artifactId = req.params.artifactId;
        let artifactRow;
        try {
            artifactRow = await pool.query("SELECT id, run_id, producer_plan_node_id, artifact_type, derived_from_artifact_id, scope_type, scope_id FROM artifacts WHERE id = $1", [artifactId]).then((r) => r.rows[0]);
        }
        catch (colErr) {
            if (colErr.code === "42703") {
                artifactRow = await pool.query("SELECT id, run_id, producer_plan_node_id, artifact_type FROM artifacts WHERE id = $1", [artifactId]).then((r) => r.rows[0]);
            }
            else
                throw colErr;
        }
        if (!artifactRow) {
            return res.status(404).json({ error: "Artifact not found", artifact_id: artifactId, producers: [], consumers: [] });
        }
        const producers = [];
        if (artifactRow.producer_plan_node_id) {
            const producerNode = await pool.query("SELECT pn.id AS plan_node_id, pn.node_key, pn.job_type, p.run_id FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id WHERE pn.id = $1", [artifactRow.producer_plan_node_id]).then((r) => r.rows[0]);
            if (producerNode) {
                producers.push({
                    plan_node_id: producerNode.plan_node_id,
                    run_id: producerNode.run_id,
                    node_key: producerNode.node_key,
                    artifact_type: artifactRow.artifact_type,
                    role: "producer",
                });
            }
        }
        let consumers = [];
        try {
            const consumerRows = await pool.query(`SELECT ac.job_run_id, ac.plan_node_id, ac.run_id, pn.node_key
         FROM artifact_consumption ac
         JOIN plan_nodes pn ON pn.id = ac.plan_node_id
         WHERE ac.artifact_id = $1`, [artifactId]);
            consumers = consumerRows.rows.map((r) => ({
                job_run_id: r.job_run_id,
                plan_node_id: r.plan_node_id,
                run_id: r.run_id,
                node_key: r.node_key,
                role: "consumer",
            }));
        }
        catch {
            // artifact_consumption table may not exist
        }
        let derived_from = null;
        if (artifactRow.derived_from_artifact_id) {
            derived_from = { artifact_id: artifactRow.derived_from_artifact_id };
        }
        const scope = (artifactRow.scope_type && artifactRow.scope_id)
            ? { scope_type: artifactRow.scope_type, scope_id: artifactRow.scope_id }
            : null;
        const part_of_project = scope?.scope_type === "project" ? { project_id: scope.scope_id } : null;
        let referenced_by = [];
        try {
            const refRows = await pool.query("SELECT page_ref, ref_type FROM artifact_page_references WHERE artifact_id = $1", [artifactId]);
            referenced_by = refRows.rows.map((r) => ({ page_ref: r.page_ref, ref_type: r.ref_type }));
        }
        catch {
            // artifact_page_references may not exist
        }
        res.json({
            artifact_id: artifactId,
            producers,
            consumers,
            declared_producer: producers[0] ?? null,
            observed_consumers: consumers,
            derived_from,
            scope,
            part_of_project: part_of_project ?? null,
            referenced_by,
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/validations — list by run_id or job_run_id (for Run detail Validations tab) */
app.get("/v1/validations", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const run_id = req.query.run_id;
        const job_run_id = req.query.job_run_id;
        let q = "SELECT * FROM validations WHERE 1=1";
        const params = [];
        let i = 1;
        if (run_id) {
            q += ` AND run_id = $${i++}`;
            params.push(run_id);
        }
        if (job_run_id) {
            q += ` AND job_run_id = $${i++}`;
            params.push(job_run_id);
        }
        q += ` ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        params.push(limit, offset);
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/template_proof/start — start a template proof batch (Sticky Green + all templates). Body: brand_profile_id, duration_minutes, optional template_ids. Returns 202 with batch_id. */
app.post("/v1/template_proof/start", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        const brandProfileId = body?.brand_profile_id;
        const durationMinutes = Math.min(Math.max(Number(body?.duration_minutes) || 30, 1), 120);
        if (!brandProfileId)
            return res.status(400).json({ error: "brand_profile_id is required" });
        const r = await pool.query(`INSERT INTO template_proof_batches (brand_profile_id, status, end_at) VALUES ($1, 'running', now() + ($2 || ' minutes')::interval) RETURNING id, status, started_at, end_at`, [brandProfileId, durationMinutes]);
        const batch = r.rows[0];
        setImmediate(async () => {
            try {
                const { runProofLoop } = await import("./template-proof-job.js");
                await runProofLoop({
                    batchId: batch.id,
                    brandProfileId,
                    durationMinutes,
                    templateIds: body?.template_ids,
                });
            }
            catch (e) {
                console.error("[template-proof] Loop error:", e);
                await pool.query("UPDATE template_proof_batches SET status = 'failed', completed_at = now() WHERE id = $1", [batch.id]);
            }
        });
        res.status(202).json({ batch_id: batch.id, status: batch.status, started_at: batch.started_at, end_at: batch.end_at });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01" || (typeof err.message === "string" && err.message.includes("template_proof"))) {
            return res.status(503).json({ error: "template_proof_batches table not present. Run migration 20250312000001_template_proof.sql." });
        }
        res.status(500).json({ error: String(err.message ?? e) });
    }
});
/** GET /v1/template_proof — list proof runs (latest per template or by batch_id). Query: batch_id, template_id, limit, latest_per_template=1. */
app.get("/v1/template_proof", async (req, res) => {
    try {
        const batchId = req.query.batch_id;
        const templateId = req.query.template_id;
        const latestPerTemplate = req.query.latest_per_template === "1" || req.query.latest_per_template === "true";
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        if (batchId) {
            const r = await pool.query("SELECT * FROM template_proof_runs WHERE batch_id = $1 ORDER BY created_at", [batchId]);
            return res.json({ items: r.rows, batch_id: batchId });
        }
        const r = latestPerTemplate
            ? await pool.query("SELECT DISTINCT ON (template_id) * FROM template_proof_runs ORDER BY template_id, created_at DESC")
            : templateId
                ? await pool.query("SELECT * FROM template_proof_runs WHERE template_id = $1 ORDER BY created_at DESC LIMIT $2", [templateId, limit])
                : await pool.query("SELECT * FROM template_proof_runs ORDER BY created_at DESC LIMIT $1", [limit]);
        res.json({ items: r.rows });
    }
    catch (e) {
        const err = e;
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
        if (batchRow.rows.length === 0)
            return res.status(404).json({ error: "Batch not found" });
        const runs = await pool.query("SELECT * FROM template_proof_runs WHERE batch_id = $1 ORDER BY created_at", [batchId]);
        const items = runs.rows;
        const passed = items.filter((i) => i.status === "succeeded").length;
        const failed = items.filter((i) => i.status === "failed" || i.status === "timed_out").length;
        res.json({
            batch: batchRow.rows[0],
            summary: { total_templates: items.length, passed, failed, remaining: items.length - passed - failed },
            items: runs.rows,
        });
    }
    catch (e) {
        const err = e;
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
        const run_id = req.query.run_id;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (run_id) {
            conditions.push(`run_id = $${i++}`);
            params.push(run_id);
        }
        params.push(limit, offset);
        const q = `SELECT * FROM approvals WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/errors — client error reporting (stub: accept payload, return 202 for future processing/logging). */
app.post("/v1/errors", (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "JSON body required (e.g. { message, code, context })" });
    }
    res.status(202).json({ accepted: true, message: "Error report accepted for processing." });
});
/** POST /v1/self_heal/deploy_failure_scan — run deploy-failure scan once (Render + Vercel). For testing without waiting 5 min. */
app.post("/v1/self_heal/deploy_failure_scan", async (_req, res) => {
    try {
        await scanAndRemediateDeployFailure();
        await scanAndRemediateVercelDeployFailure();
        res.json({ ok: true, message: "Deploy-failure scan completed. Check Control Plane logs and Render/Vercel deploy history." });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/webhook_outbox — list outbox rows (status, limit, offset) */
app.get("/v1/webhook_outbox", async (req, res) => {
    try {
        const status = req.query.status;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const offset = Number(req.query.offset) || 0;
        const conditions = status ? ["status = $1"] : ["1=1"];
        const params = status ? [status, limit, offset] : [limit, offset];
        const limitIdx = params.length - 1;
        const offsetIdx = params.length;
        const r = await pool.query(`SELECT * FROM webhook_outbox WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/webhook_outbox/:id — update status after send attempt */
app.patch("/v1/webhook_outbox/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const body = req.body;
        const sets = [];
        const params = [];
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
        const r = await pool.query(`UPDATE webhook_outbox SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/webhooks/github — create initiative from GitHub events; self-healing on fix-me label */
app.post("/v1/webhooks/github", async (req, res) => {
    try {
        const payload = req.body;
        const event = req.headers["x-github-event"];
        if (event === "ping")
            return res.status(200).json({ ok: true });
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
            let ir;
            try {
                ir = await pool.query(`INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state, template_id)
           VALUES ('issue_fix', $1, 'med', $2, 'draft', 'issue_fix') RETURNING id`, [title, sourceUrl]);
            }
            catch {
                ir = await pool.query(`INSERT INTO initiatives (intent_type, title, risk_level) VALUES ('issue_fix', $1, 'med') RETURNING id`, [title]);
            }
            const initId = ir.rows[0]?.id;
            if (initId) {
                try {
                    const { compilePlan } = await import("./plan-compiler.js");
                    await withTransaction((client) => compilePlan(client, initId, { force: true }));
                }
                catch { /* plan compilation is best-effort on webhook */ }
            }
            return res.status(201).json({ initiative_id: initId, self_heal: true, repo, source_ref: sourceUrl });
        }
        // Standard: create initiative from issue/PR events
        if (!issue?.html_url)
            return res.status(200).json({ received: true });
        const intent_type = issue.labels?.some((l) => l.name === "bug") ? "issue_fix" : "software";
        const title = issue.title ?? `Issue #${issue.number}`;
        let r;
        try {
            r = await pool.query(`INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state)
         VALUES ($1, $2, 'low', $3, 'draft') RETURNING id`, [intent_type, title, issue.html_url]);
        }
        catch (e) {
            if (e.code === "42703") {
                r = await pool.query(`INSERT INTO initiatives (intent_type, title, risk_level) VALUES ($1, $2, 'low') RETURNING id`, [intent_type, title]);
            }
            else
                throw e;
        }
        const initiativeId = r.rows[0]?.id;
        if (!initiativeId)
            return res.status(500).json({ error: "Failed to create initiative" });
        res.status(201).json({ initiative_id: initiativeId, repo, source_ref: issue.html_url });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/webhooks/vercel — Vercel deployment events → deploy_events (and optional self-heal on failure). */
app.post("/v1/webhooks/vercel", async (req, res) => {
    try {
        const body = req.body;
        const eventType = body.type ?? "";
        const deployment = body.payload?.deployment;
        const project = body.payload?.project;
        if (!deployment?.id) {
            return res.status(200).json({ received: true, skipped: true, reason: "no deployment id" });
        }
        const statusMap = {
            READY: "ready",
            ERROR: "failed",
            CANCELED: "canceled",
            BUILDING: "building",
            INITIALIZING: "building",
        };
        const status = statusMap[deployment.state ?? ""] ?? (eventType === "deployment.error" ? "failed" : eventType === "deployment.ready" ? "ready" : "unknown");
        const serviceId = project?.name ?? project?.id ?? "vercel";
        const commitSha = deployment.meta?.githubCommitSha ?? null;
        const result = await createDeployEventFromPayload(pool, {
            status,
            service_id: serviceId,
            commit_sha: commitSha ?? undefined,
            external_deploy_id: deployment.id,
        });
        res.status(201).json({ received: true, deploy_id: result.deploy_id, status: result.status });
    }
    catch (e) {
        const err = e;
        if (err.code === "42P01")
            return res.status(503).json({ error: "deploy_events table not present. Run migration 20250315000000_graph_self_heal_tables.sql." });
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/initiatives/:id/replan — alias for POST .../plan with force=true */
app.post("/v1/initiatives/:id/replan", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const initiativeId = req.params.id;
        const { compilePlan } = await import("./plan-compiler.js");
        const compiled = await withTransaction((client) => compilePlan(client, initiativeId, { force: true }));
        res.status(201).json({ id: compiled.planId, initiative_id: initiativeId, status: "draft", nodes: compiled.nodeIds.size, plan_hash: compiled.planHash });
    }
    catch (e) {
        const msg = e.message;
        if (msg === "Initiative not found")
            return res.status(404).json({ error: msg });
        res.status(500).json({ error: msg });
    }
});
// =====================================================================
// Phase 3+5: Enhanced telemetry with time range, group-by, export
// =====================================================================
/** GET /v1/usage/by_job_type — cost/token breakdown by job_type */
app.get("/v1/usage/by_job_type", async (req, res) => {
    try {
        const from = req.query.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
        const to = req.query.to ?? new Date().toISOString();
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/usage/by_model — breakdown by model_id */
app.get("/v1/usage/by_model", async (req, res) => {
    try {
        const from = req.query.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
        const to = req.query.to ?? new Date().toISOString();
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/analytics — run activity heatmap, cost tree, artifact breakdown (real data) */
app.get("/v1/analytics", async (req, res) => {
    try {
        const from = req.query.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
        const to = req.query.to ?? new Date().toISOString();
        const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const HOURS = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];
        const [heatmapRows, byJobType, byModel, artifactRows] = await Promise.all([
            pool.query(`SELECT extract(dow from started_at)::int AS dow, extract(hour from started_at)::int AS hour, count(*)::int AS c
         FROM runs WHERE started_at IS NOT NULL AND started_at BETWEEN $1 AND $2
         GROUP BY 1, 2 ORDER BY 1, 2`, [from, to]).then(r => r.rows),
            pool.query(`
        SELECT pn.job_type, lc.model_tier,
               count(*)::int AS calls,
               (coalesce(sum(lc.tokens_in), 0) + coalesce(sum(lc.tokens_out), 0))::bigint AS tokens
        FROM llm_calls lc
        JOIN job_runs jr ON jr.id = lc.job_run_id
        JOIN plan_nodes pn ON pn.id = jr.plan_node_id
        WHERE lc.created_at BETWEEN $1 AND $2
        GROUP BY pn.job_type, lc.model_tier ORDER BY calls DESC
      `, [from, to]).then(r => r.rows),
            pool.query(`
        SELECT model_tier, model_id, count(*)::int AS calls,
               (coalesce(sum(tokens_in), 0) + coalesce(sum(tokens_out), 0))::bigint AS tokens
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
        GROUP BY model_tier, model_id ORDER BY calls DESC
      `, [from, to]).then(r => r.rows),
            pool.query(`SELECT artifact_type, count(*)::int AS c FROM artifacts WHERE created_at BETWEEN $1 AND $2 GROUP BY artifact_type ORDER BY c DESC`, [from, to]).then(r => r.rows),
        ]);
        const heatmapByKey = {};
        DAYS.forEach(d => { heatmapByKey[d] = {}; for (let h = 0; h < 24; h += 2)
            heatmapByKey[d][h] = 0; });
        for (const row of heatmapRows) {
            const day = DAYS[row.dow];
            const hourBucket = row.hour - (row.hour % 2);
            if (day != null && hourBucket >= 0 && hourBucket < 24)
                (heatmapByKey[day] ??= {})[hourBucket] = (heatmapByKey[day][hourBucket] ?? 0) + row.c;
        }
        const run_activity_heatmap = DAYS.map(day => ({
            id: day,
            data: HOURS.map((h, i) => ({ x: h, y: heatmapByKey[day]?.[i * 2] ?? 0 })),
        }));
        const tierToJob = {};
        for (const row of byJobType) {
            const tier = row.model_tier || "default";
            if (!tierToJob[tier])
                tierToJob[tier] = {};
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/job_runs/:id/llm_calls — per-node LLM usage for run replay */
app.get("/v1/job_runs/:id/llm_calls", async (req, res) => {
    try {
        const jobRunId = req.params.id;
        const r = await pool.query(`SELECT id, model_tier, model_id, tokens_in, tokens_out, latency_ms, created_at
       FROM llm_calls WHERE job_run_id = $1 ORDER BY created_at`, [jobRunId]);
        const summary = await pool.query(`SELECT count(*)::int AS calls,
              coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
              coalesce(sum(tokens_out), 0)::bigint AS tokens_out,
              coalesce(avg(latency_ms), 0)::int AS avg_latency_ms
       FROM llm_calls WHERE job_run_id = $1`, [jobRunId]);
        res.json({ items: r.rows, summary: summary.rows[0] });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
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
        const initiative_id = req.query.initiative_id;
        const run_id = req.query.run_id;
        const scope = req.query.scope;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (initiative_id) {
            conditions.push(`initiative_id = $${i++}`);
            params.push(initiative_id);
        }
        if (run_id) {
            conditions.push(`run_id = $${i++}`);
            params.push(run_id);
        }
        if (scope) {
            conditions.push(`scope = $${i++}`);
            params.push(scope);
        }
        params.push(limit, offset);
        const q = `SELECT * FROM agent_memory WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/agent_memory/:id */
app.get("/v1/agent_memory/:id", async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM agent_memory WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/agent_memory — create (admin/testing) */
app.post("/v1/agent_memory", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        if (!body.scope || !body.key)
            return res.status(400).json({ error: "scope and key required" });
        const r = await pool.query(`INSERT INTO agent_memory (initiative_id, run_id, scope, key, value)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [body.initiative_id ?? null, body.run_id ?? null, body.scope, body.key, body.value ?? ""]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/agent_memory/:id — update value */
app.patch("/v1/agent_memory/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        const sets = [];
        const params = [];
        let i = 1;
        if (body.value !== undefined) {
            sets.push(`value = $${i++}`);
            params.push(body.value);
        }
        if (body.scope !== undefined) {
            sets.push(`scope = $${i++}`);
            params.push(body.scope);
        }
        if (body.key !== undefined) {
            sets.push(`key = $${i++}`);
            params.push(body.key);
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "No fields to update" });
        params.push(req.params.id);
        const r = await pool.query(`UPDATE agent_memory SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
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
        const r = await pool.query("SELECT * FROM mcp_server_config ORDER BY name LIMIT $1 OFFSET $2", [limit, offset]);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/mcp_servers/:id */
app.get("/v1/mcp_servers/:id", async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM mcp_server_config WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/mcp_servers — create */
app.post("/v1/mcp_servers", async (req, res) => {
    try {
        const role = getRole(req);
        if (role !== "admin" && role !== "operator")
            return res.status(403).json({ error: "Admin or Operator required" });
        const body = req.body;
        if (!body.name || !body.server_type || !body.url_or_cmd)
            return res.status(400).json({ error: "name, server_type, url_or_cmd required" });
        const r = await pool.query(`INSERT INTO mcp_server_config (name, server_type, url_or_cmd, args_json, env_json, auth_header, capabilities)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [body.name, body.server_type, body.url_or_cmd, body.args_json ? JSON.stringify(body.args_json) : null, body.env_json ? JSON.stringify(body.env_json) : null, body.auth_header ?? null, body.capabilities ?? null]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/mcp_servers/:id — update */
app.patch("/v1/mcp_servers/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role !== "admin" && role !== "operator")
            return res.status(403).json({ error: "Admin or Operator required" });
        const body = req.body;
        const allowedFields = ["name", "server_type", "url_or_cmd", "args_json", "env_json", "auth_header", "capabilities", "active"];
        const sets = [];
        const params = [];
        let i = 1;
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                const val = (field === "args_json" || field === "env_json") ? JSON.stringify(body[field]) : body[field];
                sets.push(`${field} = $${i++}`);
                params.push(val);
            }
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "No fields to update" });
        sets.push(`updated_at = now()`);
        params.push(req.params.id);
        const r = await pool.query(`UPDATE mcp_server_config SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/mcp_servers/:id */
app.delete("/v1/mcp_servers/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role !== "admin")
            return res.status(403).json({ error: "Admin required" });
        const r = await pool.query("DELETE FROM mcp_server_config WHERE id = $1 RETURNING id", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json({ deleted: true, id: req.params.id });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/mcp_servers/:id/test — ping / test connection */
app.post("/v1/mcp_servers/:id/test", async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM mcp_server_config WHERE id = $1", [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const server = r.rows[0];
        if (server.server_type === "http") {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const result = await fetch(server.url_or_cmd, { method: "GET", signal: controller.signal }).then(r => ({ ok: r.ok, status: r.status })).catch(e => ({ ok: false, status: 0, error: String(e) }));
                clearTimeout(timeout);
                res.json({ reachable: result.ok || result.status > 0, status: result.status });
            }
            catch (e) {
                res.json({ reachable: false, error: String(e.message) });
            }
        }
        else {
            res.json({ server_type: "stdio", message: "Stdio servers cannot be tested remotely; they are spawned by the Runner." });
        }
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/routing_policies — create or update (upsert by job_type) */
app.post("/v1/routing_policies", async (req, res) => {
    try {
        const role = getRole(req);
        if (role !== "admin" && role !== "operator")
            return res.status(403).json({ error: "Admin or Operator required" });
        const body = req.body;
        if (!body.job_type)
            return res.status(400).json({ error: "job_type required" });
        const r = await pool.query(`INSERT INTO routing_policies (job_type, model_tier, config_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_type) DO UPDATE SET model_tier = $2, config_json = $3, updated_at = now()
       RETURNING *`, [body.job_type, body.model_tier ?? "auto/chat", body.config_json ? JSON.stringify(body.config_json) : null]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/llm_budgets */
app.get("/v1/llm_budgets", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const r = await pool.query("SELECT * FROM llm_budgets WHERE active = true ORDER BY scope_type, scope_value LIMIT $1 OFFSET $2", [limit, offset]);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/llm_budgets — create or update (upsert by scope) */
app.post("/v1/llm_budgets", async (req, res) => {
    try {
        const role = getRole(req);
        if (role !== "admin" && role !== "operator")
            return res.status(403).json({ error: "Admin or Operator required" });
        const body = req.body;
        if (!body.scope_type || !body.scope_value)
            return res.status(400).json({ error: "scope_type and scope_value required" });
        const r = await pool.query(`INSERT INTO llm_budgets (scope_type, scope_value, budget_tokens, budget_dollars, period)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scope_type, scope_value) DO UPDATE SET budget_tokens = $3, budget_dollars = $4, period = $5, updated_at = now()
       RETURNING *`, [body.scope_type, body.scope_value, body.budget_tokens ?? null, body.budget_dollars ?? null, body.period ?? "monthly"]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
// =====================================================================
// Brand Profiles CRUD
// =====================================================================
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s) {
    return UUID_REGEX.test(s);
}
/** GET /v1/brand_profiles — list with filters and pagination */
app.get("/v1/brand_profiles", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const status = req.query.status;
        const search = req.query.search;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (status) {
            conditions.push(`status = $${i++}`);
            params.push(status);
        }
        if (search) {
            conditions.push(`(name ILIKE $${i} OR slug ILIKE $${i})`);
            params.push(`%${search}%`);
            i++;
        }
        params.push(limit, offset);
        const q = `SELECT * FROM brand_profiles WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const [itemsResult, totalResult] = await Promise.all([
            pool.query(q, params),
            pool.query(`SELECT count(*)::int AS total FROM brand_profiles WHERE ${conditions.join(" AND ")}`, params.slice(0, -2)),
        ]);
        res.json({ items: itemsResult.rows, total: totalResult.rows[0]?.total ?? 0 });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/brand_profiles/:id */
app.get("/v1/brand_profiles/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const r = await pool.query("SELECT * FROM brand_profiles WHERE id = $1", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const profile = r.rows[0];
        if (profile.brand_theme_id) {
            const themeR = await pool.query("SELECT token_overrides FROM brand_themes WHERE id = $1", [profile.brand_theme_id]);
            if (themeR.rows.length > 0 && themeR.rows[0].token_overrides) {
                profile.token_overrides = themeR.rows[0].token_overrides;
            }
        }
        res.json(profile);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/brand_profiles/:id/usage — telemetry for "where these tokens are used" (Phase 4). */
app.get("/v1/brand_profiles/:id/usage", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const [initCount, runsResult, docTplCount, emailTplCount] = await Promise.all([
            pool.query("SELECT count(*)::int AS c FROM initiatives WHERE brand_profile_id = $1", [id]),
            pool.query(`SELECT count(*)::int AS runs_count, max(r.started_at) AS last_run_at
         FROM runs r JOIN plans p ON p.id = r.plan_id JOIN initiatives i ON i.id = p.initiative_id
         WHERE i.brand_profile_id = $1`, [id]),
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/brand_profiles/prefill_from_url — fetch live site and extract tokens (colors, fonts, logo, sitemap). Logo URL is copied to our CDN so the brand record can store a stable URL. */
app.post("/v1/brand_profiles/prefill_from_url", async (req, res) => {
    try {
        const body = req.body;
        const url = typeof body?.url === "string" ? body.url.trim() : "";
        if (!url)
            return res.status(400).json({ error: "url is required" });
        const result = await tokenizeBrandFromUrl(url);
        if (result.logo_url && !/supabase\.co\/storage\/v1\/object\/public\/upload\//.test(result.logo_url)) {
            try {
                const { copyImageToCdn } = await import("./campaign-images-storage.js");
                const cdn = await copyImageToCdn(result.logo_url);
                if (cdn?.cdn_url)
                    result.logo_url = cdn.cdn_url;
            }
            catch (_e) {
                // keep original logo_url if copy fails
            }
        }
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/brand_profiles */
app.post("/v1/brand_profiles", async (req, res) => {
    try {
        const body = req.body;
        if (!body.name)
            return res.status(400).json({ error: "name required" });
        if (body.design_tokens != null && typeof body.design_tokens === "object" && !Array.isArray(body.design_tokens)) {
            const dt = body.design_tokens;
            for (const key of DESIGN_TOKENS_NON_TOKEN_KEYS) {
                if (Object.prototype.hasOwnProperty.call(dt, key)) {
                    console.warn(`[brand_profiles] design_tokens should not contain "${key}"; use initiative or email_design_generator_metadata. See docs/SCHEMA_JSON_GUARDRAILS.md.`);
                    break;
                }
            }
        }
        const slug = (typeof body.slug === "string" && body.slug.trim())
            ? body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
            : body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const r = await pool.query(`INSERT INTO brand_profiles (name, slug, identity, tone, visual_style, copy_style, design_tokens, deck_theme, report_theme)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb) RETURNING *`, [
            body.name,
            slug,
            JSON.stringify(body.identity ?? {}),
            JSON.stringify(body.tone ?? {}),
            JSON.stringify(body.visual_style ?? {}),
            JSON.stringify(body.copy_style ?? {}),
            JSON.stringify(body.design_tokens ?? {}),
            JSON.stringify(body.deck_theme ?? {}),
            JSON.stringify(body.report_theme ?? {}),
        ]);
        const inserted = r.rows[0];
        if (body.design_tokens && inserted?.id) {
            await syncDesignTokensFlat(inserted.id, body.design_tokens);
        }
        res.status(201).json(inserted);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PUT /v1/brand_profiles/:id */
app.put("/v1/brand_profiles/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const body = req.body;
        if (body.design_tokens != null && typeof body.design_tokens === "object" && !Array.isArray(body.design_tokens)) {
            const dt = body.design_tokens;
            for (const key of DESIGN_TOKENS_NON_TOKEN_KEYS) {
                if (Object.prototype.hasOwnProperty.call(dt, key)) {
                    console.warn(`[brand_profiles] design_tokens should not contain "${key}"; use initiative or email_design_generator_metadata. See docs/SCHEMA_JSON_GUARDRAILS.md.`, { brand_id: id });
                    break;
                }
            }
        }
        const jsonbFields = ["identity", "tone", "visual_style", "copy_style", "design_tokens", "deck_theme", "report_theme"];
        const scalarFields = ["name", "slug", "brand_theme_id", "status"];
        const sets = [];
        const params = [];
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
        if (sets.length === 0)
            return res.status(400).json({ error: "No fields to update" });
        sets.push("updated_at = now()");
        params.push(id);
        const r = await pool.query(`UPDATE brand_profiles bp SET ${sets.join(", ")} WHERE bp.id = $${i} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const updated = r.rows[0];
        if (body.design_tokens !== undefined && updated.design_tokens) {
            await syncDesignTokensFlat(id, updated.design_tokens);
        }
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/brand_profiles/:id — soft delete (default) or permanent delete (?permanent=true) */
app.delete("/v1/brand_profiles/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const permanent = req.query.permanent === "true" || req.query.permanent === "1";
        if (permanent) {
            const r = await pool.query("DELETE FROM brand_profiles WHERE id = $1 RETURNING id", [id]);
            if (r.rows.length === 0)
                return res.status(404).json({ error: "Not found" });
            res.json({ id: r.rows[0].id, deleted: true });
        }
        else {
            const r = await pool.query("UPDATE brand_profiles SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id, status", [id]);
            if (r.rows.length === 0)
                return res.status(404).json({ error: "Not found" });
            res.json(r.rows[0]);
        }
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/organizations — list orgs (scope for taxonomy + multi-brand). */
app.get("/v1/organizations", async (req, res) => {
    try {
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const slug = req.query.slug;
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (slug) {
            conditions.push(`slug = $${i++}`);
            params.push(slug);
        }
        params.push(limit, offset);
        const r = await pool.query(`SELECT id, name, slug, metadata_json, created_at FROM organizations WHERE ${conditions.join(" AND ")} ORDER BY name LIMIT $${i} OFFSET $${i + 1}`, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/taxonomy/websites — list taxonomy websites (optional organization_id). */
app.get("/v1/taxonomy/websites", async (req, res) => {
    try {
        const organization_id = req.query.organization_id;
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        let q = "SELECT id, organization_id, airtable_base_id, airtable_record_id, name, status, url, created_at FROM taxonomy_websites WHERE 1=1";
        const params = [];
        let i = 1;
        if (organization_id) {
            q += ` AND organization_id = $${i++}`;
            params.push(organization_id);
        }
        q += ` ORDER BY name LIMIT $${i} OFFSET $${i + 1}`;
        params.push(limit, offset);
        const r = await pool.query(q, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/taxonomy/websites/:id/vocabularies */
app.get("/v1/taxonomy/websites/:id/vocabularies", async (req, res) => {
    try {
        const { id } = req.params;
        const r = await pool.query("SELECT id, website_id, airtable_record_id, name, visibility, created_at FROM taxonomy_vocabularies WHERE website_id = $1 ORDER BY name", [id]);
        res.json({ items: r.rows });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/taxonomy/vocabularies/:id/terms */
app.get("/v1/taxonomy/vocabularies/:id/terms", async (req, res) => {
    try {
        const { id } = req.params;
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
        const r = await pool.query("SELECT id, vocabulary_id, website_id, airtable_record_id, term_name, published_status, family_type, term_id_external, url_value, created_at FROM taxonomy_terms WHERE vocabulary_id = $1 ORDER BY term_name LIMIT $2", [id, limit]);
        res.json({ items: r.rows });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/catalog/products — list brand catalog products by brand_profile_id (includes metadata_json for WC links etc.). */
app.get("/v1/catalog/products", async (req, res) => {
    try {
        const brand_profile_id = req.query.brand_profile_id;
        if (!brand_profile_id)
            return res.status(400).json({ error: "brand_profile_id is required" });
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const r = await pool.query("SELECT id, brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, metadata_json, created_at FROM brand_catalog_products WHERE brand_profile_id = $1 ORDER BY name LIMIT $2 OFFSET $3", [brand_profile_id, limit, offset]);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/catalog/products — upsert product into brand catalog. */
app.post("/v1/catalog/products", async (req, res) => {
    try {
        const body = req.body;
        const { brand_profile_id, source_system, external_ref } = body;
        if (!brand_profile_id || !source_system || !external_ref) {
            return res.status(400).json({ error: "brand_profile_id, source_system, and external_ref are required" });
        }
        const r = await pool.query(`INSERT INTO brand_catalog_products (brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (brand_profile_id, source_system, external_ref) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, brand_catalog_products.name),
         description = COALESCE(EXCLUDED.description, brand_catalog_products.description),
         image_url = COALESCE(EXCLUDED.image_url, brand_catalog_products.image_url),
         price_cents = COALESCE(EXCLUDED.price_cents, brand_catalog_products.price_cents),
         currency = COALESCE(EXCLUDED.currency, brand_catalog_products.currency),
         metadata_json = COALESCE(EXCLUDED.metadata_json, brand_catalog_products.metadata_json),
         updated_at = now()
       RETURNING id, brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, metadata_json, created_at, updated_at`, [brand_profile_id, source_system, external_ref, body.name ?? null, body.description ?? null, body.image_url ?? null, body.price_cents ?? null, body.currency ?? "USD", body.metadata_json != null ? JSON.stringify(body.metadata_json) : null]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/stores — list commerce stores (WooCommerce, Shopify) with optional scope_key or brand_profile_id. */
app.get("/v1/stores", async (req, res) => {
    try {
        const scope_key = req.query.scope_key;
        const brand_profile_id = req.query.brand_profile_id;
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (scope_key) {
            conditions.push(`scope_key = $${i++}`);
            params.push(scope_key);
        }
        if (brand_profile_id) {
            conditions.push(`brand_profile_id = $${i++}`);
            params.push(brand_profile_id);
        }
        params.push(limit, offset);
        const r = await pool.query(`SELECT id, scope_key, channel, external_ref, name, brand_profile_id, created_at FROM stores WHERE ${conditions.join(" AND ")} ORDER BY name LIMIT $${i} OFFSET $${i + 1}`, params);
        res.json({ items: r.rows, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/brand_profiles/:id/embeddings */
app.get("/v1/brand_profiles/:id/embeddings", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const embedding_type = req.query.embedding_type;
        const conditions = ["brand_profile_id = $1"];
        const params = [id];
        let i = 2;
        if (embedding_type) {
            conditions.push(`embedding_type = $${i++}`);
            params.push(embedding_type);
        }
        params.push(limit, offset);
        const q = `SELECT * FROM brand_embeddings WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const countQ = `SELECT count(*)::int AS total FROM brand_embeddings WHERE ${conditions.join(" AND ")}`;
        const [itemsResult, totalResult] = await Promise.all([
            pool.query(q, params),
            pool.query(countQ, params.slice(0, -2)),
        ]);
        res.json({ items: itemsResult.rows, total: totalResult.rows[0]?.total ?? 0 });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/brand_profiles/:id/embeddings */
app.post("/v1/brand_profiles/:id/embeddings", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const body = req.body;
        if (!body.content || !body.embedding_type)
            return res.status(400).json({ error: "content and embedding_type required" });
        const eid = uuid();
        await pool.query(`INSERT INTO brand_embeddings (id, brand_profile_id, content, embedding_type, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5::jsonb, NULL)`, [eid, id, body.content, body.embedding_type, body.metadata ? JSON.stringify(body.metadata) : null]);
        const r = await pool.query("SELECT * FROM brand_embeddings WHERE id = $1", [eid]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/brand_profiles/:id/embeddings/search — TODO: requires pre-computed embedding for vector search */
app.post("/v1/brand_profiles/:id/embeddings/search", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        // TODO: Implement vector similarity search once embeddings are pre-computed by a separate service.
        res.json({ results: [] });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/brand_profiles/:id/embeddings/:eid */
app.delete("/v1/brand_profiles/:id/embeddings/:eid", async (req, res) => {
    try {
        const id = req.params.id;
        const eid = req.params.eid;
        if (!isValidUuid(id) || !isValidUuid(eid))
            return res.status(400).json({ error: "Invalid UUID" });
        const r = await pool.query("DELETE FROM brand_embeddings WHERE id = $1 AND brand_profile_id = $2 RETURNING id", [eid, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.status(200).json({ deleted: true, id: eid });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/brand_profiles/:id/assets */
app.get("/v1/brand_profiles/:id/assets", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const asset_type = req.query.asset_type;
        let q = "SELECT * FROM brand_assets WHERE brand_profile_id = $1";
        const params = [id];
        if (asset_type) {
            q += " AND asset_type = $2";
            params.push(asset_type);
        }
        q += " ORDER BY created_at";
        const r = await pool.query(q, params);
        res.json({ items: r.rows });
    }
    catch (e) {
        if (isBrandAssetsMissing(e)) {
            res.status(200).json({ items: [] });
            return;
        }
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/brand_profiles/:id/assets */
app.post("/v1/brand_profiles/:id/assets", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const body = req.body;
        if (!body.asset_type || !body.uri)
            return res.status(400).json({ error: "asset_type and uri required" });
        const aid = uuid();
        await pool.query(`INSERT INTO brand_assets (id, brand_profile_id, asset_type, uri, filename, mime_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`, [aid, id, body.asset_type, body.uri, body.filename ?? null, body.mime_type ?? null, body.metadata ? JSON.stringify(body.metadata) : null]);
        const r = await pool.query("SELECT * FROM brand_assets WHERE id = $1", [aid]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        if (isBrandAssetsMissing(e)) {
            res.status(503).json({ error: "brand_assets table does not exist. Run migration 20250303000007_brand_engine.sql." });
            return;
        }
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/brand_profiles/:id/assets/:aid */
app.delete("/v1/brand_profiles/:id/assets/:aid", async (req, res) => {
    try {
        const id = req.params.id;
        const aid = req.params.aid;
        if (!isValidUuid(id) || !isValidUuid(aid))
            return res.status(400).json({ error: "Invalid UUID" });
        const r = await pool.query("DELETE FROM brand_assets WHERE id = $1 AND brand_profile_id = $2 RETURNING id", [aid, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.status(200).json({ deleted: true, id: aid });
    }
    catch (e) {
        if (isBrandAssetsMissing(e)) {
            res.status(503).json({ error: "brand_assets table does not exist. Run migration 20250303000007_brand_engine.sql." });
            return;
        }
        res.status(500).json({ error: String(e.message) });
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
        const brand_profile_id = req.query.brand_profile_id;
        const template_type = req.query.template_type;
        const status = req.query.status;
        const conditions = ["1=1"];
        const params = [];
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/document_templates/:id */
app.get("/v1/document_templates/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const r = await pool.query("SELECT * FROM document_templates WHERE id = $1", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const template = r.rows[0];
        const comps = await pool.query("SELECT * FROM document_components WHERE template_id = $1 ORDER BY position", [id]);
        template.components = comps.rows;
        res.json(template);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/document_templates */
app.post("/v1/document_templates", async (req, res) => {
    try {
        const body = req.body;
        const r = await pool.query(`INSERT INTO document_templates (brand_profile_id, template_type, name, description, template_config, component_sequence, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) RETURNING *`, [
            body.brand_profile_id ?? null, body.template_type ?? null, body.name ?? null, body.description ?? null,
            body.template_config ? JSON.stringify(body.template_config) : null,
            body.component_sequence ? JSON.stringify(body.component_sequence) : null,
            body.status ?? "draft",
        ]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PUT /v1/document_templates/:id */
app.put("/v1/document_templates/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const body = req.body;
        const allowed = ["brand_profile_id", "template_type", "name", "description", "template_config", "component_sequence", "status"];
        const sets = [];
        const params = [];
        let i = 1;
        for (const field of allowed) {
            if (body[field] !== undefined) {
                const val = (field === "template_config" || field === "component_sequence") ? JSON.stringify(body[field]) : body[field];
                sets.push(`${field} = $${i++}`);
                params.push(val);
            }
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "No fields to update" });
        sets.push("updated_at = now()");
        params.push(id);
        const r = await pool.query(`UPDATE document_templates SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/document_templates/:id — soft delete */
app.delete("/v1/document_templates/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const r = await pool.query("UPDATE document_templates SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id, status", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/document_templates/:id/components */
app.post("/v1/document_templates/:id/components", async (req, res) => {
    try {
        const id = req.params.id;
        const body = req.body;
        if (!body.component_type)
            return res.status(400).json({ error: "component_type required" });
        const cid = uuid();
        await pool.query(`INSERT INTO document_components (id, template_id, component_type, config, position)
       VALUES ($1, $2, $3, $4::jsonb, $5)`, [cid, id, body.component_type, body.config ? JSON.stringify(body.config) : "{}", body.position ?? 0]);
        const r = await pool.query("SELECT * FROM document_components WHERE id = $1", [cid]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PUT /v1/document_templates/:id/components/:cid */
app.put("/v1/document_templates/:id/components/:cid", async (req, res) => {
    try {
        const id = req.params.id;
        const cid = req.params.cid;
        const body = req.body;
        const sets = [];
        const params = [];
        let i = 1;
        if (body.config !== undefined) {
            sets.push(`config = $${i++}::jsonb`);
            params.push(JSON.stringify(body.config));
        }
        if (body.position !== undefined) {
            sets.push(`position = $${i++}`);
            params.push(body.position);
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "No fields to update" });
        params.push(cid, id);
        const r = await pool.query(`UPDATE document_components SET ${sets.join(", ")} WHERE id = $${i} AND template_id = $${i + 1} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/document_templates/:id/components/:cid */
app.delete("/v1/document_templates/:id/components/:cid", async (req, res) => {
    try {
        const id = req.params.id;
        const cid = req.params.cid;
        const r = await pool.query("DELETE FROM document_components WHERE id = $1 AND template_id = $2 RETURNING id", [cid, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.status(200).json({ deleted: true, id: cid });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
// =====================================================================
// Pexels proxy & campaign images CDN (Email Marketing wizard)
// =====================================================================
/** GET /v1/pexels/search — proxy to Pexels API (keeps API key server-side). Query: q, per_page, page. */
app.get("/v1/pexels/search", async (req, res) => {
    try {
        const key = process.env.PEXELS_API_KEY;
        if (!key)
            return res.status(503).json({ error: "Pexels API not configured (PEXELS_API_KEY)" });
        const q = req.query.q?.trim() || "nature";
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/campaign-images/copy — fetch image from URL and upload to our CDN (Supabase). Body: { url }. Returns { cdn_url }. */
app.post("/v1/campaign-images/copy", async (req, res) => {
    try {
        const url = req.body?.url?.trim();
        if (!url || !url.startsWith("http"))
            return res.status(400).json({ error: "Body must include url (http(s))" });
        const { copyImageToCdn } = await import("./campaign-images-storage.js");
        const result = await copyImageToCdn(url);
        if (!result)
            return res.status(502).json({ error: "Failed to copy image to CDN (check SUPABASE_* env and URL)" });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
// =====================================================================
// Email Templates CRUD (Email Marketing Factory)
// =====================================================================
function isTemplateImageContractsMissing(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return /relation\s+["']?template_image_contracts["']?\s+does not exist/i.test(msg);
}
function isBrandAssetsMissing(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return /relation\s+["']?brand_assets["']?\s+does not exist/i.test(msg);
}
/** GET /v1/email_templates — list with image_slots, product_slots, layout_style for picker. */
app.get("/v1/email_templates", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const type = req.query.type;
        const brand_profile_id = req.query.brand_profile_id;
        const conditions = ["1=1"];
        const params = [];
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
        let items;
        try {
            const q = `SELECT t.*, c.max_content_slots AS contract_max_content_slots, c.max_product_slots AS contract_max_product_slots
        FROM email_templates t
        LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1'
        WHERE ${conditions.join(" AND ")} ORDER BY t.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
            const [itemsResult, totalResult] = await Promise.all([
                pool.query(q, params),
                pool.query(countQ, params.slice(0, -2)),
            ]);
            items = itemsResult.rows;
            const total = totalResult.rows[0]?.total ?? 0;
            for (const row of items) {
                const maxContent = row.contract_max_content_slots;
                const maxProduct = row.contract_max_product_slots;
                delete row.contract_max_content_slots;
                delete row.contract_max_product_slots;
                const contract = maxContent != null || maxProduct != null
                    ? { max_content_slots: maxContent, max_product_slots: maxProduct }
                    : null;
                enrichTemplateRow(row, contract);
            }
            res.json({ items, total });
            return;
        }
        catch (e) {
            if (!isTemplateImageContractsMissing(e))
                throw e;
        }
        const fallbackQ = `SELECT t.* FROM email_templates t WHERE ${conditions.join(" AND ")} ORDER BY t.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
        const [itemsResult, totalResult] = await Promise.all([
            pool.query(fallbackQ, params),
            pool.query(countQ, params.slice(0, -2)),
        ]);
        items = itemsResult.rows;
        for (const row of items) {
            enrichTemplateRow(row, null);
        }
        res.json({ items, total: totalResult.rows[0]?.total ?? 0 });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** Build a placeholder map from a brand profile row for substituting [key] in MJML and {{key}} in HTML (e.g. landing footer). */
function brandPlaceholderMap(brandRow) {
    const name = typeof brandRow.name === "string" ? brandRow.name : "Brand";
    const identity = brandRow.identity ?? {};
    const design_tokens = brandRow.design_tokens ?? {};
    const website = typeof identity.website === "string" ? identity.website : "https://example.com";
    const baseUrl = website.replace(/\/$/, "");
    const contactEmail = typeof identity.contact_email === "string" ? identity.contact_email : "";
    const tagline = typeof identity.tagline === "string" ? identity.tagline : "";
    let logo = "";
    if (design_tokens.logo && typeof design_tokens.logo.url === "string") {
        logo = design_tokens.logo.url;
    }
    else if (typeof design_tokens.logo_url === "string") {
        logo = design_tokens.logo_url;
    }
    let brandColor = "#16a34a";
    const colors = design_tokens.colors ?? design_tokens.color;
    const brand = colors?.brand;
    if (brand && typeof brand["500"] === "string")
        brandColor = brand["500"];
    const ctaText = typeof design_tokens.cta_text === "string" ? design_tokens.cta_text : "Learn more";
    const ctaLink = typeof design_tokens.cta_link === "string" ? design_tokens.cta_link : website;
    const contactInfo = typeof design_tokens.contact_info === "string" ? design_tokens.contact_info : contactEmail;
    const year = String(new Date().getFullYear());
    const socialMedia = Array.isArray(design_tokens.social_media) ? design_tokens.social_media : [];
    const socialByKey = {};
    for (const s of socialMedia) {
        const n = (s.name ?? "").toLowerCase();
        const u = typeof s.url === "string" ? s.url : "";
        if (n.includes("instagram"))
            socialByKey.instagramUrl = u;
        else if (n.includes("tiktok"))
            socialByKey.tiktokUrl = u;
        else if (n.includes("twitter") || n === "x")
            socialByKey.twitterUrl = u;
        else if (n.includes("facebook"))
            socialByKey.facebookUrl = u;
        else if (n.includes("youtube"))
            socialByKey.youtubeUrl = u;
    }
    if (!socialByKey.instagramUrl)
        socialByKey.instagramUrl = website;
    if (!socialByKey.tiktokUrl)
        socialByKey.tiktokUrl = website;
    if (!socialByKey.twitterUrl)
        socialByKey.twitterUrl = website;
    if (!socialByKey.facebookUrl)
        socialByKey.facebookUrl = website;
    if (!socialByKey.youtubeUrl)
        socialByKey.youtubeUrl = website;
    const disclaimerText = typeof identity.disclaimer_text === "string" ? identity.disclaimer_text : "By signing up you agree to our";
    const footerUrls = design_tokens.footer_urls && typeof design_tokens.footer_urls === "object"
        ? design_tokens.footer_urls
        : {};
    const gradientsList = Array.isArray(design_tokens.gradients) ? design_tokens.gradients : [];
    const gradientCssList = [];
    for (const g of gradientsList) {
        if (g && typeof g === "object" && g.type === "linear" && Array.isArray(g.stops)) {
            const stops = g.stops.filter((s) => typeof s === "string" && s.trim());
            if (stops.length >= 2)
                gradientCssList.push(`linear-gradient(135deg, ${stops.join(", ")})`);
        }
    }
    const typo = design_tokens.typography;
    const fonts = typo?.fonts;
    const fontHeadings = typeof fonts?.heading === "string" ? fonts.heading : (typeof typo?.font_headings === "string" ? typo.font_headings : (typeof design_tokens.font_headings === "string" ? design_tokens.font_headings : ""));
    const fontBody = typeof fonts?.body === "string" ? fonts.body : (typeof typo?.font_body === "string" ? typo.font_body : (typeof design_tokens.font_body === "string" ? design_tokens.font_body : ""));
    const fontFamily = (fontHeadings || fontBody || "system-ui").includes(" ") ? `"${fontHeadings || fontBody || "system-ui"}"` : (fontHeadings || fontBody || "system-ui");
    const logoPharmacyText = typeof design_tokens.logo_pharmacy_text === "string"
        ? design_tokens.logo_pharmacy_text
        : (typeof identity.logo_pharmacy_text === "string" ? identity.logo_pharmacy_text : (name.split(/\s+/)[0] ?? "Brand"));
    const logoTimeText = typeof design_tokens.logo_time_text === "string"
        ? design_tokens.logo_time_text
        : (typeof identity.logo_time_text === "string" ? identity.logo_time_text : (name.split(/\s+/).slice(1).join(" ").trim() || ""));
    const headingHighlightColor = (typeof design_tokens.heading_highlight_color === "string" && design_tokens.heading_highlight_color.trim())
        ? design_tokens.heading_highlight_color.trim()
        : (brand && typeof brand["400"] === "string"
            ? brand["400"]
            : "#c2b6f8");
    const base = {
        logo: logo || "https://via.placeholder.com/120x40?text=Logo",
        siteUrl: website,
        site_url: website,
        brandName: name,
        brand_name: name,
        companyName: name,
        headline: "Premium quality you can trust",
        body: "Discover our bestsellers and limited drops. Free shipping on orders over $70.",
        cta_text: ctaText,
        cta_url: ctaLink,
        brandColor,
        brand_color: brandColor,
        headingHighlightColor,
        heading_highlight_color: headingHighlightColor,
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
        year,
        tagline: tagline || "Quality you can trust.",
        logoUrl: logo || "https://via.placeholder.com/120x40?text=Logo",
        logoPharmacyText,
        logoTimeText,
        disclaimerText,
        privacyUrl: `${baseUrl}/privacy-policy/`,
        termsUrl: `${baseUrl}/terms-conditions/`,
        hipaaUrl: `${baseUrl}/hipaa-privacy-statement/`,
        howItWorksUrl: `${baseUrl}/how-it-works/`,
        faqUrl: `${baseUrl}/faq/`,
        contactUrl: `${baseUrl}/contact-us/`,
        supportUrl: `${baseUrl}/support/`,
        emailPlaceholder: "Enter your email",
        emailSignupAction: `${baseUrl}/newsletter/`,
        legitscriptUrl: "https://legitscript.com",
        popularWeightManagementUrl: `${baseUrl}/product-category/weight-management/`,
        popularHormoneReplacementUrl: `${baseUrl}/product-category/hormone-replacement/`,
        popularIvTherapyUrl: `${baseUrl}/product-category/iv-therapy-supplements/`,
        popularSexualWellnessUrl: `${baseUrl}/product-category/sexual-wellness/`,
        popularThyroidUrl: `${baseUrl}/product-category/thyroid/`,
        popularGlp1Url: `${baseUrl}/product-category/glp-1-treatments/`,
        popularOzempicUrl: `${baseUrl}/product-category/ozempic/`,
        popularWegovyUrl: `${baseUrl}/product-category/wegovy/`,
        popularSermorelinUrl: `${baseUrl}/product-category/sermorelin/`,
        popularNadUrl: `${baseUrl}/product-category/nad-plus/`,
        fontFamily,
        ...socialByKey,
    };
    const result = { ...base };
    for (const [k, v] of Object.entries(footerUrls)) {
        if (typeof v === "string" && v.trim())
            result[k] = v.trim();
    }
    gradientCssList.forEach((css, i) => {
        result[`gradient_${i}`] = css;
        if (i === 0)
            result.gradientContainer1 = css;
        if (i === 1)
            result.gradientContainer2 = css;
    });
    gradientsList.forEach((g, i) => {
        if (gradientCssList[i] && g && typeof g === "object" && typeof g.name === "string") {
            const name = String(g.name).trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "") || `gradient_${i}`;
            if (name)
                result[`gradient_${name}`] = gradientCssList[i];
        }
    });
    return result;
}
/** Substitute [placeholder] in mjml with values from map; leave unknown placeholders as-is. */
function substitutePlaceholders(mjml, map) {
    return mjml.replace(/\[([^\]]+)\]/g, (_, key) => {
        const k = key.trim();
        return k in map ? map[k] : `[${key}]`;
    });
}
/** Substitute {{placeholder}} in HTML (e.g. landing footer) with values from map; leave unknown as-is. */
function substitutePlaceholdersDoubleCurly(html, map) {
    return html.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const k = key.trim();
        return k in map ? map[k] : `{{${key}}}`;
    });
}
/** GET /v1/email_templates/:id/preview — render template MJML to HTML. When component_sequence is set and mjml is null, assemble from email_component_library. When template has brand_profile_id, substitute placeholders from brand so preview maps to brand tokens. */
app.get("/v1/email_templates/:id/preview", async (req, res) => {
    try {
        const id = req.params.id;
        const r = await pool.query("SELECT mjml, component_sequence, brand_profile_id FROM email_templates WHERE id = $1", [id]);
        if (r.rows.length === 0)
            return res.status(404).send("Not found");
        const row = r.rows[0];
        let mjml = row.mjml;
        let seq = row.component_sequence;
        if (typeof seq === "string") {
            try {
                seq = JSON.parse(seq);
            }
            catch {
                seq = null;
            }
        }
        if ((!mjml || typeof mjml !== "string") && Array.isArray(seq) && seq.length > 0) {
            const ids = seq
                .map((x) => (typeof x === "string" ? x : null))
                .filter((s) => s != null && isValidUuid(s));
            if (ids.length > 0) {
                const fragRes = await pool.query("SELECT mjml_fragment FROM email_component_library WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)", [ids]);
                const fragments = fragRes.rows.map((r) => r.mjml_fragment ?? "").filter(Boolean);
                if (fragments.length > 0) {
                    mjml = `<mjml>\n<mj-body>\n${fragments.join("\n")}\n</mj-body>\n</mjml>`;
                }
            }
        }
        if (!mjml || typeof mjml !== "string") {
            return res.status(422).send("Template has no MJML content");
        }
        const brandProfileId = row.brand_profile_id;
        if (brandProfileId && isValidUuid(brandProfileId)) {
            const brandR = await pool.query("SELECT name, identity, design_tokens FROM brand_profiles WHERE id = $1", [brandProfileId]);
            if (brandR.rows.length > 0) {
                const map = brandPlaceholderMap(brandR.rows[0]);
                mjml = substitutePlaceholders(mjml, map);
            }
        }
        const { html } = mjml2html(mjml, { validationLevel: "skip" });
        res.type("text/html").send(html);
    }
    catch (e) {
        res.status(500).send(String(e.message));
    }
});
/** Letter to product slot index (A=1, B=2, ..., K=11). */
function productLetterToSlot(letter) {
    const code = letter.toUpperCase().charCodeAt(0);
    if (code >= 65 && code <= 75)
        return code - 64; // A=1 .. K=11
    return 0;
}
/** Compute product slot count from MJML (product_N_image/title/url or [product A/B/... src/title/productUrl/description]). */
function productSlotsFromMjml(mjml) {
    if (!mjml || typeof mjml !== "string")
        return 0;
    let max = 0;
    const numericMatches = mjml.matchAll(/product_(\d+)_(?:image|title|url)/gi);
    for (const m of numericMatches) {
        const n = parseInt(m[1], 10);
        if (n > max)
            max = n;
    }
    const bracketMatches = mjml.matchAll(/\[product\s+([A-Za-z])\s+(?:src|title|productUrl|description)\]/gi);
    for (const m of bracketMatches) {
        const n = productLetterToSlot(m[1]);
        if (n > max)
            max = n;
    }
    return max;
}
/** Compute content image slot count from MJML ([image 1], [image 2], {{image_1}}, {{content_image_2}}, etc.). */
function contentSlotsFromMjml(mjml) {
    if (!mjml || typeof mjml !== "string")
        return 0;
    let max = 0;
    // Bracket: [image 1], [image 2]
    for (const m of mjml.matchAll(/\[image\s+(\d+)\]/gi)) {
        const n = parseInt(m[1], 10);
        if (n > max)
            max = n;
    }
    // Handlebars: {{image_1}}, {{image_2}}, {{content_image_1}}
    for (const m of mjml.matchAll(/\{\{(?:content_)?image_(\d+)\}\}/gi)) {
        const n = parseInt(m[1], 10);
        if (n > max)
            max = n;
    }
    // Hero counts as one slot when present; so if we only have hero, treat as 1. We already count [image N] and image_N above.
    // If max is still 0 but template has hero placeholder, treat as 1 (hero-only). Else return max.
    if (max === 0 && /\{\{hero_image|imageUrl|image_url\}\}|\[hero\]|\[banner\]|\[image_url\]|\[hero_image_url\]/i.test(mjml)) {
        return 1;
    }
    return max;
}
/** Normalize template type to a short label so layout_style is never a long sentence (e.g. from DB). */
function normalizeTemplateType(type) {
    const t = (type ?? "").trim().toLowerCase();
    if (t === "newsletter" || t === "product" || t === "promo" || t === "email")
        return t;
    if (t.includes("product"))
        return "product";
    if (t.includes("newsletter"))
        return "newsletter";
    if (t.includes("promo"))
        return "promo";
    return "email";
}
/** Add image_slots, product_slots, layout_style to a template row (from contract or MJML). */
function enrichTemplateRow(row, contract) {
    const mjml = row.mjml;
    const typeLabel = normalizeTemplateType(row.type);
    const name = String(row.name ?? "").trim();
    const id = row.id;
    // Known templates: apply slots first so contract 0/0 doesn't override (list + detail must show correct counts)
    let imageSlots;
    let productSlots;
    if (typeLabel === "product" && /emma/i.test(name)) {
        imageSlots = 1;
        productSlots = 5;
    }
    else if (id === "281f9f46-aca7-43ed-bb5f-85114234f210") {
        imageSlots = 6;
        productSlots = 3;
    }
    else if (typeLabel === "newsletter" && /^newsletter\s*1$/i.test(name)) {
        // Newsletter 1 (e.g. United Sodas / 12 reasons): 2 images, 0 products
        imageSlots = 2;
        productSlots = 0;
    }
    else if (row.component_sequence && Array.isArray(row.component_sequence) && row.component_sequence.length > 0 && !mjml) {
        // Composed template: content image slots only (hero/banner); product slots are separate (each product has its own image).
        imageSlots = typeof row.img_count === "number" ? row.img_count : 0;
        productSlots = 2; // typical for product_block_2; do not mix with content image count
    }
    else {
        imageSlots = contract?.max_content_slots ?? (typeof row.img_count === "number" ? row.img_count : null) ?? contentSlotsFromMjml(mjml) ?? 0;
        productSlots = contract?.max_product_slots ?? productSlotsFromMjml(mjml) ?? 0;
        if (typeLabel === "newsletter" && imageSlots === 0 && mjml) {
            const imageLike = mjml.match(/\{\{[^}]*image[^}]*\}\}|\[image\s*\d*\][^\]]*|\[hero\]|\[banner\]/gi);
            const count = imageLike ? Math.min(imageLike.length, 2) : 0;
            if (count >= 2)
                imageSlots = 2;
            else if (count === 1)
                imageSlots = 1;
        }
    }
    row.image_slots = imageSlots;
    row.product_slots = productSlots;
    row.layout_style = `${typeLabel} (email template)`;
}
/** GET /v1/email_templates/:id — includes image_slots, product_slots, layout_style for wizard validation. When component_sequence is set, mjml is assembled from email_component_library fragments. */
app.get("/v1/email_templates/:id", async (req, res) => {
    try {
        const id = req.params.id;
        let row;
        try {
            const r = await pool.query("SELECT t.*, c.max_content_slots AS contract_max_content_slots, c.max_product_slots AS contract_max_product_slots FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1", [id]);
            if (r.rows.length === 0)
                return res.status(404).json({ error: "Not found" });
            row = r.rows[0];
            const maxContent = row.contract_max_content_slots;
            const maxProduct = row.contract_max_product_slots;
            delete row.contract_max_content_slots;
            delete row.contract_max_product_slots;
            const contract = maxContent != null || maxProduct != null
                ? { max_content_slots: maxContent, max_product_slots: maxProduct }
                : null;
            enrichTemplateRow(row, contract);
        }
        catch (e) {
            if (!isTemplateImageContractsMissing(e))
                throw e;
            const r = await pool.query("SELECT * FROM email_templates WHERE id = $1", [id]);
            if (r.rows.length === 0)
                return res.status(404).json({ error: "Not found" });
            row = r.rows[0];
            enrichTemplateRow(row, null);
        }
        const seq = row.component_sequence;
        if (Array.isArray(seq) && seq.length > 0 && seq.every((x) => typeof x === "string")) {
            const ids = seq.filter((s) => isValidUuid(s));
            if (ids.length > 0) {
                const fragRes = await pool.query("SELECT mjml_fragment FROM email_component_library WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)", [ids]);
                const fragments = fragRes.rows.map((r) => r.mjml_fragment ?? "").filter(Boolean);
                if (fragments.length > 0) {
                    row.mjml = `<mjml>\n<mj-body>\n${fragments.join("\n")}\n</mj-body>\n</mjml>`;
                }
            }
        }
        res.json(row);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/**
 * Run template lint gate for proof-run: returns ok false if any error-severity issues.
 * Used by POST /v1/plans/:id/start and POST /v1/runs/:id/rerun to block starting a run when the template fails lint.
 */
async function runTemplateLintGate(db, templateId) {
    let q;
    try {
        q = await db.query("SELECT t.id, t.mjml, c.hero_required, c.logo_safe_hero, c.product_hero_allowed, c.mixed_content_and_product_pool, c.collapses_empty_modules, c.max_content_slots, c.max_product_slots, c.supports_content_images, c.supports_product_images, c.optional_modules FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1", [templateId]);
    }
    catch (err) {
        if (isTemplateImageContractsMissing(err))
            return { ok: true, errors: [] };
        throw err;
    }
    if (q.rows.length === 0)
        return { ok: true, errors: [] };
    const row = q.rows[0];
    const contract = row.hero_required != null ? row : null;
    if (!contract) {
        return { ok: true, errors: [] };
    }
    const mjml = row.mjml ?? "";
    const { lintTemplateMjml } = await import("./template-image-linter.js");
    const results = lintTemplateMjml(mjml, contract, templateId);
    const errors = results.filter((r) => r.severity === "error").map((r) => ({ code: r.code, message: r.message }));
    return { ok: errors.length === 0, errors };
}
/** GET /v1/email_templates/:id/lint — L001–L010 template image lint. Requires template_image_contracts row (v1). */
app.get("/v1/email_templates/:id/lint", async (req, res) => {
    try {
        const id = req.params.id;
        let q;
        try {
            q = await pool.query("SELECT t.id, t.name, t.mjml, c.hero_required, c.logo_safe_hero, c.product_hero_allowed, c.mixed_content_and_product_pool, c.collapses_empty_modules, c.max_content_slots, c.max_product_slots, c.supports_content_images, c.supports_product_images, c.optional_modules FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1", [id]);
        }
        catch (err) {
            if (isTemplateImageContractsMissing(err)) {
                return res.status(503).json({ error: "template_image_contracts table not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to enable lint." });
            }
            throw err;
        }
        if (q.rows.length === 0)
            return res.status(404).json({ error: "Template not found" });
        const row = q.rows[0];
        const contract = row.hero_required != null ? row : null;
        if (!contract) {
            return res.status(400).json({ contract_missing: true, error: "Template has no template_image_contracts row (version v1); lint failed." });
        }
        const mjml = row.mjml ?? "";
        const { lintTemplateMjml } = await import("./template-image-linter.js");
        const results = lintTemplateMjml(mjml, contract, id);
        res.json({ template_id: id, contract_present: true, results });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/email_templates */
app.post("/v1/email_templates", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        const r = await pool.query(`INSERT INTO email_templates (type, name, image_url, mjml, template_json, sections_json, img_count, brand_profile_id, component_sequence)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb) RETURNING *`, [
            body.type ?? "newsletter",
            body.name ?? "Untitled",
            body.image_url ?? null,
            body.mjml ?? null,
            body.template_json ?? null,
            body.sections_json ?? null,
            body.img_count ?? 0,
            body.brand_profile_id ?? null,
            body.component_sequence != null ? JSON.stringify(body.component_sequence) : null,
        ]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/email_templates/:id — optional lint_on_save: when true, run L001–L010 after update; fail with 400 if any error-severity issues. */
app.patch("/v1/email_templates/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const id = req.params.id;
        const body = req.body;
        const lintOnSave = body.lint_on_save === true;
        const allowed = ["type", "name", "image_url", "mjml", "template_json", "sections_json", "img_count", "brand_profile_id", "component_sequence"];
        const sets = [];
        const params = [];
        let i = 1;
        for (const field of allowed) {
            if (body[field] !== undefined) {
                if (field === "template_json" || field === "sections_json" || field === "component_sequence") {
                    sets.push(`${field} = $${i++}::jsonb`);
                    params.push(typeof body[field] === "string" ? body[field] : JSON.stringify(body[field]));
                }
                else {
                    sets.push(`${field} = $${i++}`);
                    params.push(body[field]);
                }
            }
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "No fields to update" });
        sets.push("updated_at = now()");
        params.push(id);
        const r = await pool.query(`UPDATE email_templates SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const row = r.rows[0];
        if (lintOnSave) {
            let cq;
            try {
                cq = await pool.query("SELECT c.hero_required, c.logo_safe_hero, c.product_hero_allowed, c.mixed_content_and_product_pool, c.collapses_empty_modules, c.max_content_slots, c.max_product_slots, c.supports_content_images, c.supports_product_images, c.optional_modules FROM template_image_contracts c WHERE c.template_id = $1 AND c.version = 'v1'", [id]);
            }
            catch (err) {
                if (isTemplateImageContractsMissing(err)) {
                    return res.status(503).json({ error: "template_image_contracts table not present. Run migration 20250307100000_image_assignment_and_template_contracts.sql to use lint_on_save." });
                }
                throw err;
            }
            const contract = cq.rows.length > 0 ? cq.rows[0] : null;
            if (!contract) {
                return res.status(400).json({ error: "lint_on_save requires a template_image_contracts row (version v1) for this template.", lint_errors: [{ code: "L004", severity: "error", message: "Missing template image contract." }] });
            }
            const mjml = row.mjml ?? "";
            const { lintTemplateMjml } = await import("./template-image-linter.js");
            const lintResults = lintTemplateMjml(mjml, contract, id);
            const errors = lintResults.filter((x) => x.severity === "error");
            if (errors.length > 0) {
                return res.status(400).json({ error: "Template lint failed. Fix errors before saving.", lint_errors: errors, lint_results: lintResults });
            }
            row.lint_results = lintResults;
        }
        res.json(row);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/email_templates/:id */
app.delete("/v1/email_templates/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const id = req.params.id;
        const r = await pool.query("DELETE FROM email_templates WHERE id = $1 RETURNING id", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.status(200).json({ deleted: true, id });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
// ---------- Email component library (reusable MJML fragments for composing templates) ----------
/** GET /v1/email_component_library/assembled?ids=uuid1,uuid2,...&format=html&brand_profile_id=uuid — wrap fragments, optional brand substitution, return MJML or HTML. When a single id has html_fragment and use_context=landing_page, returns substituted HTML. */
app.get("/v1/email_component_library/assembled", async (req, res) => {
    try {
        const idsParam = req.query.ids ?? "";
        const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
        if (ids.length === 0)
            return res.status(400).json({ error: "ids query required (comma-separated UUIDs)" });
        for (const id of ids) {
            if (!isValidUuid(id))
                return res.status(400).json({ error: `Invalid UUID: ${id}` });
        }
        const r = await pool.query(`SELECT id, mjml_fragment, html_fragment, use_context, position FROM email_component_library WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)`, [ids]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "No components found" });
        const brandProfileId = req.query.brand_profile_id;
        let brandMap = {};
        if (brandProfileId && isValidUuid(brandProfileId)) {
            const brandR = await pool.query("SELECT name, identity, design_tokens FROM brand_profiles WHERE id = $1", [brandProfileId]);
            if (brandR.rows.length > 0) {
                brandMap = brandPlaceholderMap(brandR.rows[0]);
            }
        }
        if (ids.length === 1 && req.query.format === "html") {
            const row = r.rows[0];
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
        const fragments = r.rows.map((row) => row.mjml_fragment ?? "").filter(Boolean);
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
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/email_component_library — list all, ordered by position. */
app.get("/v1/email_component_library", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Number(req.query.offset) || 0;
        const r = await pool.query("SELECT * FROM email_component_library ORDER BY position ASC, created_at ASC LIMIT $1 OFFSET $2", [limit, offset]);
        const count = await pool.query("SELECT count(*)::int AS total FROM email_component_library");
        const total = count.rows[0]?.total ?? 0;
        res.json({ items: r.rows, total, limit, offset });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/email_component_library/:id */
app.get("/v1/email_component_library/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const r = await pool.query("SELECT * FROM email_component_library WHERE id = $1", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/email_component_library */
app.post("/v1/email_component_library", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        if (!body.component_type?.trim() || !body.name?.trim())
            return res.status(400).json({ error: "component_type and name required" });
        const hasMjml = body.mjml_fragment != null && String(body.mjml_fragment).trim() !== "";
        const hasHtml = body.html_fragment != null && String(body.html_fragment).trim() !== "";
        if (!hasMjml && !hasHtml)
            return res.status(400).json({ error: "At least one of mjml_fragment or html_fragment required (use html_fragment for landing_page e.g. WordPress/PHP footer)" });
        const useContext = typeof body.use_context === "string" && body.use_context.trim() ? body.use_context.trim().toLowerCase() : "email";
        const r = await pool.query(`INSERT INTO email_component_library (component_type, name, description, mjml_fragment, html_fragment, placeholder_docs, position, use_context, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now()) RETURNING *`, [
            body.component_type.trim(),
            body.name.trim(),
            body.description?.trim() ?? null,
            hasMjml ? body.mjml_fragment : null,
            hasHtml ? body.html_fragment : null,
            body.placeholder_docs != null ? JSON.stringify(body.placeholder_docs) : "[]",
            typeof body.position === "number" ? body.position : 0,
            useContext,
        ]);
        res.status(201).json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** PATCH /v1/email_component_library/:id */
app.patch("/v1/email_component_library/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const body = req.body;
        const allowed = ["component_type", "name", "description", "mjml_fragment", "html_fragment", "placeholder_docs", "position", "use_context"];
        const sets = ["updated_at = now()"];
        const params = [];
        let i = 1;
        for (const field of allowed) {
            if (body[field] !== undefined) {
                if (field === "placeholder_docs") {
                    sets.push(`${field} = $${i++}::jsonb`);
                    params.push(JSON.stringify(body[field]));
                }
                else if (field === "position" && typeof body[field] === "number") {
                    sets.push(`${field} = $${i++}`);
                    params.push(body[field]);
                }
                else if (field === "use_context" && typeof body[field] === "string") {
                    sets.push(`${field} = $${i++}`);
                    params.push(body[field].trim().toLowerCase() || "email");
                }
                else if (field === "mjml_fragment" || field === "html_fragment") {
                    sets.push(`${field} = $${i++}`);
                    params.push(typeof body[field] === "string" ? body[field] : null);
                }
                else if (typeof body[field] === "string") {
                    sets.push(`${field} = $${i++}`);
                    params.push(body[field]);
                }
            }
        }
        if (params.length === 0)
            return res.status(400).json({ error: "No updatable fields" });
        params.push(id);
        const r = await pool.query(`UPDATE email_component_library SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** DELETE /v1/email_component_library/:id */
app.delete("/v1/email_component_library/:id", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const r = await pool.query("DELETE FROM email_component_library WHERE id = $1 RETURNING id", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.status(200).json({ deleted: true, id });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
// ——— Launch kernel: build_specs & launches ———
/** GET /v1/build_specs?initiative_id= — list build specs for an initiative */
app.get("/v1/build_specs", async (req, res) => {
    try {
        const initiativeId = req.query.initiative_id;
        if (!initiativeId || !isValidUuid(initiativeId)) {
            return res.status(400).json({ error: "initiative_id (UUID) required" });
        }
        const r = await pool.query("SELECT id, initiative_id, spec_json, created_at, updated_at FROM build_specs WHERE initiative_id = $1 ORDER BY created_at DESC", [initiativeId]);
        res.json({ items: r.rows });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/build_specs/:id */
app.get("/v1/build_specs/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const r = await pool.query("SELECT id, initiative_id, spec_json, created_at, updated_at FROM build_specs WHERE id = $1", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/build_specs — create build spec and a launch for the initiative */
app.post("/v1/build_specs", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        const initiativeId = body?.initiative_id;
        const spec = body?.spec ?? {};
        if (!initiativeId || !isValidUuid(initiativeId)) {
            return res.status(400).json({ error: "initiative_id (UUID) required" });
        }
        const specJson = typeof spec === "object" && spec !== null ? spec : {};
        const bid = uuid();
        const lid = uuid();
        await withTransaction(async (client) => {
            await client.query("INSERT INTO build_specs (id, initiative_id, spec_json, updated_at) VALUES ($1, $2, $3, now())", [bid, initiativeId, JSON.stringify(specJson)]);
            await client.query("INSERT INTO launches (id, initiative_id, status, build_spec_id, updated_at) VALUES ($1, $2, 'draft', $3, now())", [lid, initiativeId, bid]);
        });
        // Auto-register Vercel project for self-heal when spec includes vercel_project_id (AI Factory–launched project)
        const vercelProjectId = specJson.vercel_project_id ?? specJson.projectId;
        if (typeof vercelProjectId === "string" && vercelProjectId.trim()) {
            const teamId = specJson.vercel_team_id ?? specJson.teamId;
            registerVercelProjectForSelfHeal(vercelProjectId.trim(), typeof teamId === "string" ? teamId.trim() : undefined).catch((e) => console.warn("[build_specs] Vercel self-heal register failed:", e.message));
        }
        const launchRow = await pool.query("SELECT id, initiative_id, status, build_spec_id, artifact_id, deploy_url, deploy_id, domain, verification_status, created_at, updated_at FROM launches WHERE id = $1", [lid]);
        res.status(201).json({
            build_spec_id: bid,
            launch_id: lid,
            launch: launchRow.rows[0] ?? { id: lid, initiative_id: initiativeId, status: "draft", build_spec_id: bid, artifact_id: null, deploy_url: null, deploy_id: null, domain: null, verification_status: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/build_specs/from_strategy — create build spec + launch from strategy doc (stub: same as POST /v1/build_specs with spec from doc) */
app.post("/v1/build_specs/from_strategy", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const body = req.body;
        const initiativeId = body?.initiative_id;
        const strategyDoc = body?.strategy_doc ?? "";
        if (!initiativeId || !isValidUuid(initiativeId)) {
            return res.status(400).json({ error: "initiative_id (UUID) required" });
        }
        const spec = { strategy_doc: strategyDoc };
        const bid = uuid();
        const lid = uuid();
        await withTransaction(async (client) => {
            await client.query("INSERT INTO build_specs (id, initiative_id, spec_json, updated_at) VALUES ($1, $2, $3, now())", [bid, initiativeId, JSON.stringify(spec)]);
            await client.query("INSERT INTO launches (id, initiative_id, status, build_spec_id, updated_at) VALUES ($1, $2, 'draft', $3, now())", [lid, initiativeId, bid]);
        });
        const launchRow = await pool.query("SELECT id, initiative_id, status, build_spec_id, artifact_id, deploy_url, deploy_id, domain, verification_status, created_at, updated_at FROM launches WHERE id = $1", [lid]);
        res.status(201).json({
            build_spec_id: bid,
            launch_id: lid,
            launch: launchRow.rows[0] ?? { id: lid, initiative_id: initiativeId, status: "draft", build_spec_id: bid, artifact_id: null, deploy_url: null, deploy_id: null, domain: null, verification_status: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/launches?initiative_id=&limit= — list launches */
app.get("/v1/launches", async (req, res) => {
    try {
        const initiativeId = req.query.initiative_id;
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const conditions = ["1=1"];
        const params = [];
        let i = 1;
        if (initiativeId && isValidUuid(initiativeId)) {
            conditions.push(`initiative_id = $${i++}`);
            params.push(initiativeId);
        }
        params.push(limit);
        const r = await pool.query(`SELECT id, initiative_id, status, build_spec_id, artifact_id, deploy_url, deploy_id, domain, verification_status, created_at, updated_at FROM launches WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i}`, params);
        res.json({ items: r.rows });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/launches/actions/:action — trigger launch action (preview_deploy, domain_attach, etc.); stub returns ok. Auto-registers Vercel project for self-heal when body includes projectId. */
app.post("/v1/launches/actions/:action", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const action = req.params.action;
        const inputs = (req.body ?? {});
        if (!action)
            return res.status(400).json({ error: "action required" });
        // Auto-register Vercel project for self-heal when launch action includes projectId (AI Factory–launched project)
        const projectId = typeof inputs.projectId === "string" ? inputs.projectId.trim() : null;
        if (projectId) {
            const teamId = typeof inputs.teamId === "string" ? inputs.teamId.trim() : undefined;
            registerVercelProjectForSelfHeal(projectId, teamId).catch((e) => console.warn("[launches/actions] Vercel self-heal register failed:", e.message));
        }
        // Stub: no-op; in production this would call launch kernel (e.g. request deploy preview, domain attach).
        res.json({ ok: true, action, inputs });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** GET /v1/launches/:id */
app.get("/v1/launches/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const r = await pool.query("SELECT id, initiative_id, status, build_spec_id, artifact_id, deploy_url, deploy_id, domain, verification_status, created_at, updated_at FROM launches WHERE id = $1", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
/** POST /v1/launches/:id/validate — run validation checks for a launch; stub returns passed */
app.post("/v1/launches/:id/validate", async (req, res) => {
    try {
        const role = getRole(req);
        if (role === "viewer")
            return res.status(403).json({ error: "Forbidden" });
        const id = req.params.id;
        if (!isValidUuid(id))
            return res.status(400).json({ error: "Invalid UUID" });
        const r = await pool.query("SELECT id FROM launches WHERE id = $1", [id]);
        if (r.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        res.json({ passed: true, checks: [] });
    }
    catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});
export function startApi(port = Number(process.env.PORT) || 3001) {
    if (process.env.SENTRY_DSN?.trim()) {
        Sentry.setupExpressErrorHandler(app);
    }
    app.listen(port, () => console.log(`[api] Listening on port ${port}`));
}
//# sourceMappingURL=api.js.map