import express from "express";
import cors from "cors";
import type pg from "pg";
import * as Sentry from "@sentry/node";
import { v4 as uuid } from "uuid";
import mjml2html from "mjml";
import { pool, withTransaction } from "./db.js";
import { createRun, completeApprovalAndAdvance } from "./scheduler.js";
import {
  getExecutableFrontier,
  getUpstreamNodes,
  getDownstreamNodes,
  pathToNode,
} from "./graph/traversal.js";
import {
  createChangeEvent,
  computeGraphImpactsForPlan,
  computeGraphImpactsForRun,
} from "./graph/impact.js";
import { executeSubgraphReplay, subgraphReplayPlan } from "./graph/subgraph-replay.js";
import { lookupBySignature as incidentLookup, recordResolution as incidentRecord, recordBuildIncident } from "./incident-memory.js";
import { classifyFailure } from "./failure-classifier.js";
import { parseMigrationSql, postMigrationAudit } from "./graph/migration-guard.js";
import { getUnknownJobTypes } from "./graph/schema.js";
import { classifyBuildLog, extractBuildErrorSignature } from "./build/build-classifier.js";
import { createDeployEventFromPayload, type DeployEventPayload } from "./deploy-events.js";
import { syncAllRenderDeploys } from "./deploy-sync.js";
import { syncAllGitHubDeploys } from "./github-deploy-sync.js";
import { runDecisionLoopTick } from "./decision-loop.js";
import { computeBaselines } from "./baselines.js";
import { detectAnomalies } from "./anomaly.js";
import { ingestV1SliceEvent, getV1SliceFunnel } from "./v1-slice.js";
import { suggestFilesFromImportGraph } from "./import-graph.js";
import { getSchemaDrift, getCurrentSchemaShape } from "./schema-drift.js";
import { evaluatePolicy } from "./policy-evaluator.js";
import { runValidationPlan, runValidationAfterAction } from "./validation-executor.js";
import { executeAction } from "./action-executor.js";
import { executeRollback, routeRun } from "./release-manager.js";
import { pauseCampaign as metaPauseCampaign, pauseAdSet as metaPauseAdSet, getStatus as metaGetStatus, runMetaIngest, runShopifyIngest, getKlaviyoCredentials, createTemplate, updateTemplate } from "./connectors/index.js";
import { runKlaviyoCampaignPipeline, buildSendReadyEmail } from "./klaviyo-campaign-pipeline.js";
import { runKlaviyoFlowPipeline, setKlaviyoFlowStatus } from "./klaviyo-flow-pipeline.js";
import { runDiagnosis } from "./ads-diagnosis.js";
import { buildDailySummary, postDailySummaryToSlack } from "./slack-ads-operator.js";
import { triggerNoArtifactsRemediationForRun, triggerBadArtifactsRemediationForRun } from "./no-artifacts-self-heal.js";
import { fetchSitemapProducts, type SitemapType } from "./sitemap-products.js";
import { productsFromUrl, type ProductsFromUrlType } from "./products-from-url.js";
import { tokenizeBrandFromUrl } from "./brand-tokenize-from-url.js";
import { fetchGscReport, fetchGa4Report } from "./lib/seo/gsc-ga-api.js";
import {
  getGoogleAuthUrl,
  handleOAuthCallback,
  getAccessTokenForInitiative,
  hasGoogleCredentials,
  deleteGoogleCredentials,
  hasGoogleCredentialsForBrand,
  deleteGoogleCredentialsForBrand,
} from "./seo-google-oauth.js";
import type { Contract } from "./template-image-validators.js";

const CONTROL_PLANE_BASE = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SEO_GOOGLE_CALLBACK_PATH = "/v1/seo/google/callback";
/** Where to send the user on OAuth error (avoid redirect loop). If unset, we return 400 + HTML. */
const _corsFirst = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
const CONSOLE_ORIGIN = process.env.CONSOLE_URL ?? (_corsFirst && _corsFirst !== "*" ? _corsFirst : "");

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

/** Keys that must not be written into email_design_generator_metadata.metadata_json; use columns or child table. See docs/SCHEMA_JSON_GUARDRAILS.md. */
const EMAIL_DESIGN_METADATA_JSON_BLOCKLIST = ["scheduled_at", "segment_id", "proof_status"] as const;

function checkEmailDesignMetadataJsonBlocklist(meta: Record<string, unknown>): string | null {
  for (const key of EMAIL_DESIGN_METADATA_JSON_BLOCKLIST) {
    if (Object.prototype.hasOwnProperty.call(meta, key)) return key;
  }
  return null;
}

/** Documented allowed top-level keys for artifacts.metadata_json. See docs/SCHEMA_JSON_GUARDRAILS.md. */
const ARTIFACT_METADATA_JSON_ALLOWLIST = new Set(["content", "mjml", "error_signature", "type"]);

/** design_tokens keys that are campaign/asset refs and should live in initiative or email metadata. See docs/SCHEMA_JSON_GUARDRAILS.md. */
const DESIGN_TOKENS_NON_TOKEN_KEYS = ["products", "selected_images"] as const;

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

/** GET /v1/email_designs — list initiatives with intent_type = email_design_generator + metadata. Optional campaign_kind=landing_page to list only landing-page campaigns. */
app.get("/v1/email_designs", async (req, res) => {
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

/** POST /v1/email_designs — create initiative (email_design_generator) + optional metadata */
app.post("/v1/email_designs", async (req, res) => {
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
    fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H1", location: "api.ts:POST email_designs", message: "body.risk_level and resolved riskLevel", data: { body_risk_level: body.risk_level, has_risk_level: "risk_level" in body }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    const riskLevel = normalizeRiskLevel(body.risk_level) ?? "med"; // always normalize so "medium" -> "med" if client sends it
    // #region agent log
    fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H5", location: "api.ts:INSERT initiatives", message: "riskLevel passed to DB", data: { riskLevel, paramOrder: "id,title,brand_profile_id,template_id,riskLevel" }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    const err = (e: unknown) => (e as { code?: string; message?: string }).code === "42703" || String((e as Error).message).includes("brand_profile_id");
    try {
      await pool.query(
        `INSERT INTO initiatives (id, intent_type, title, risk_level, brand_profile_id, template_id) VALUES ($1, 'email_design_generator', $2, $5, $3, $4)`,
        [id, body.title ?? "New email campaign", body.brand_profile_id ?? null, body.template_id ?? null, riskLevel]
      );
    } catch (e) {
      // #region agent log
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", hypothesisId: "H2", location: "api.ts:POST email_designs catch", message: "INSERT initiatives fallback", data: { error: String((e as Error).message).slice(0, 80), has_template_id: !!body.template_id }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
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
        return res.status(400).json({
          error: `metadata_json must not contain "${blocked}". Use columns or a child table. See docs/SCHEMA_JSON_GUARDRAILS.md.`,
        });
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
});

/** PATCH /v1/email_designs/:id — update email design metadata (upsert) */
app.patch("/v1/email_designs/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const id = req.params.id;
    const exists = await pool.query("SELECT id FROM initiatives WHERE id = $1 AND intent_type = 'email_design_generator'", [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const body = req.body as Record<string, unknown>;
    if (body.metadata_json != null && typeof body.metadata_json === "object") {
      const blocked = checkEmailDesignMetadataJsonBlocklist(body.metadata_json as Record<string, unknown>);
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

/** GET /v1/taxonomy/websites — list canonical taxonomy websites (optional organization_id query). */
app.get("/v1/taxonomy/websites", async (req, res) => {
  try {
    const organization_id = req.query.organization_id as string | undefined;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    let q = "SELECT id, organization_id, airtable_base_id, airtable_record_id, name, status, url, created_at FROM taxonomy_websites WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (organization_id) {
      q += ` AND organization_id = $${i}`;
      params.push(organization_id);
      i++;
    }
    q += ` ORDER BY name LIMIT $${i} OFFSET $${i + 1}`;
    params.push(limit, offset);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/taxonomy/websites/:id/vocabularies — list vocabularies for a taxonomy website. */
app.get("/v1/taxonomy/websites/:id/vocabularies", async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      "SELECT id, website_id, airtable_record_id, name, visibility, created_at FROM taxonomy_vocabularies WHERE website_id = $1 ORDER BY name",
      [id]
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/taxonomy/vocabularies/:id/terms — list terms for a vocabulary. */
app.get("/v1/taxonomy/vocabularies/:id/terms", async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const r = await pool.query(
      "SELECT id, vocabulary_id, website_id, airtable_record_id, term_name, published_status, family_type, term_id_external, url_value, created_at FROM taxonomy_terms WHERE vocabulary_id = $1 ORDER BY term_name LIMIT $2",
      [id, limit]
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/catalog/products — list brand catalog products by brand_profile_id (products belong to a brand). */
app.get("/v1/catalog/products", async (req, res) => {
  try {
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    if (!brand_profile_id) {
      return res.status(400).json({ error: "brand_profile_id is required" });
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const r = await pool.query(
      "SELECT id, brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, created_at FROM brand_catalog_products WHERE brand_profile_id = $1 ORDER BY name LIMIT $2 OFFSET $3",
      [brand_profile_id, limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/catalog/products — upsert a product into the brand catalog (brand_profile_id required). */
app.post("/v1/catalog/products", async (req, res) => {
  try {
    const body = req.body as {
      brand_profile_id: string;
      source_system: string;
      external_ref: string;
      name?: string;
      description?: string;
      image_url?: string;
      price_cents?: number;
      currency?: string;
      metadata_json?: Record<string, unknown>;
    };
    const { brand_profile_id, source_system, external_ref } = body;
    if (!brand_profile_id || !source_system || !external_ref) {
      return res.status(400).json({ error: "brand_profile_id, source_system, and external_ref are required" });
    }
    const r = await pool.query(
      `INSERT INTO brand_catalog_products (brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (brand_profile_id, source_system, external_ref) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, brand_catalog_products.name),
         description = COALESCE(EXCLUDED.description, brand_catalog_products.description),
         image_url = COALESCE(EXCLUDED.image_url, brand_catalog_products.image_url),
         price_cents = COALESCE(EXCLUDED.price_cents, brand_catalog_products.price_cents),
         currency = COALESCE(EXCLUDED.currency, brand_catalog_products.currency),
         metadata_json = COALESCE(EXCLUDED.metadata_json, brand_catalog_products.metadata_json),
         updated_at = now()
       RETURNING id, brand_profile_id, source_system, external_ref, name, description, image_url, price_cents, currency, created_at, updated_at`,
      [
        brand_profile_id,
        source_system,
        external_ref,
        body.name ?? null,
        body.description ?? null,
        body.image_url ?? null,
        body.price_cents ?? null,
        body.currency ?? "USD",
        body.metadata_json ? JSON.stringify(body.metadata_json) : null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/seo/gsc_report — fetch GSC Search Analytics (top pages + queries). Requires GOOGLE_APPLICATION_CREDENTIALS and site in Search Console. */
app.post("/v1/seo/gsc_report", async (req, res) => {
  try {
    const body = req.body as { site_url?: string; date_range?: string; row_limit?: number };
    const site_url = body.site_url ?? "";
    if (!site_url) return res.status(400).json({ error: "site_url is required" });
    const report = await fetchGscReport(site_url, {
      dateRange: body.date_range ?? "last28days",
      rowLimit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
    });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/seo/ga4_report — fetch GA4 top pages (sessions, page views). Requires GOOGLE_APPLICATION_CREDENTIALS and GA4 property access. */
app.post("/v1/seo/ga4_report", async (req, res) => {
  try {
    const body = req.body as { property_id?: string; row_limit?: number };
    const property_id = body.property_id ?? "";
    if (!property_id) return res.status(400).json({ error: "property_id is required" });
    const report = await fetchGa4Report(property_id, {
      rowLimit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
    });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/seo/google/auth — return Google OAuth URL or redirect. Pass brand_id (preferred) or initiative_id (legacy), and redirect_uri. If redirect=1, respond with 302 to Google (avoids browser blocking async redirects). */
app.get("/v1/seo/google/auth", async (req, res) => {
  try {
    const brand_id = req.query.brand_id as string | undefined;
    const initiative_id = req.query.initiative_id as string | undefined;
    const redirect_uri = req.query.redirect_uri as string;
    const doRedirect = req.query.redirect === "1" || req.query.redirect === "true";
    if (!redirect_uri) return res.status(400).json({ error: "redirect_uri is required (e.g. brand or initiative page URL)" });
    if (!brand_id && !initiative_id) return res.status(400).json({ error: "brand_id or initiative_id is required" });
    const callbackUrl = `${CONTROL_PLANE_BASE}${SEO_GOOGLE_CALLBACK_PATH}`;
    const url = await getGoogleAuthUrl(callbackUrl, redirect_uri, { brand_id, initiative_id });
    if (doRedirect) return res.redirect(302, url);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/seo/google/callback — OAuth callback: exchange code, store refresh_token, redirect to redirect_uri from state. */
app.get("/v1/seo/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const callbackRedirectUri = `${CONTROL_PLANE_BASE}${SEO_GOOGLE_CALLBACK_PATH}`;

  const sendOAuthError = (error: string) => {
    if (CONSOLE_ORIGIN) {
      const safe = encodeURIComponent(error);
      return res.redirect(`${CONSOLE_ORIGIN.replace(/\/$/, "")}/brands?google_oauth_error=${safe}`);
    }
    res.status(400).contentType("text/html").send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Google sign-in</title></head><body><p>OAuth error: ${error.replace(/</g, "&lt;")}</p><p>Close this tab and return to the app to try again.</p></body></html>`
    );
  };

  if (!code || !state) {
    return sendOAuthError("missing_code_or_state");
  }
  try {
    const result = await withTransaction((client) => handleOAuthCallback(client, code, state, callbackRedirectUri));
    const target = result.redirect_uri || (CONSOLE_ORIGIN ? `${CONSOLE_ORIGIN.replace(/\/$/, "")}/brands` : "/");
    const err = result.error ? `&error=${encodeURIComponent(result.error)}` : "&google_connected=1";
    return res.redirect(target.includes("?") ? `${target}${err}` : `${target}?${err.slice(1)}`);
  } catch (e) {
    return sendOAuthError(String((e as Error).message));
  }
});

/** GET /v1/initiatives/:id/google_access_token — for runner: return short-lived access_token (uses stored refresh_token). */
app.get("/v1/initiatives/:id/google_access_token", async (req, res) => {
  try {
    const initiativeId = req.params.id;
    const token = await withTransaction((client) => getAccessTokenForInitiative(client, initiativeId));
    if (!token) return res.status(404).json({ error: "Google not connected for this initiative" });
    res.json(token);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/initiatives/:id/google_connected — for console: whether initiative has Google credentials. */
app.get("/v1/initiatives/:id/google_connected", async (req, res) => {
  try {
    const connected = await withTransaction((client) => hasGoogleCredentials(client, req.params.id));
    res.json({ connected: !!connected });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/initiatives/:id/google_credentials — disconnect Google for this initiative (legacy per-initiative credentials only). */
app.delete("/v1/initiatives/:id/google_credentials", async (req, res) => {
  try {
    await withTransaction((client) => deleteGoogleCredentials(client, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/brand_profiles/:id/google_connected — whether brand has Google credentials (for brand page "Connect Google"). */
app.get("/v1/brand_profiles/:id/google_connected", async (req, res) => {
  try {
    const connected = await withTransaction((client) => hasGoogleCredentialsForBrand(client, req.params.id));
    res.json({ connected: !!connected });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/brand_profiles/:id/google_credentials — disconnect Google for this brand. */
app.delete("/v1/brand_profiles/:id/google_credentials", async (req, res) => {
  try {
    await withTransaction((client) => deleteGoogleCredentialsForBrand(client, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/brand_profiles/:id/klaviyo_connected — whether brand has Klaviyo credentials (for brand page "Connect Klaviyo"). */
app.get("/v1/brand_profiles/:id/klaviyo_connected", async (req, res) => {
  try {
    const r = await pool.query("SELECT 1 FROM brand_klaviyo_credentials WHERE brand_profile_id = $1 LIMIT 1", [req.params.id]);
    res.json({ connected: r.rows.length > 0 });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PUT /v1/brand_profiles/:id/klaviyo_credentials — set Klaviyo API key and optional default list for this brand. Body: api_key, default_list_id?. */
app.put("/v1/brand_profiles/:id/klaviyo_credentials", async (req, res) => {
  try {
    const brandId = req.params.id;
    const body = req.body as { api_key?: string; default_list_id?: string };
    const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (!apiKey) return res.status(400).json({ error: "api_key is required" });
    await pool.query(
      `INSERT INTO brand_klaviyo_credentials (brand_profile_id, api_key_encrypted, default_list_id, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (brand_profile_id) DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, default_list_id = EXCLUDED.default_list_id, updated_at = now()`,
      [brandId, apiKey, body.default_list_id?.trim() || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** DELETE /v1/brand_profiles/:id/klaviyo_credentials — disconnect Klaviyo for this brand. */
app.delete("/v1/brand_profiles/:id/klaviyo_credentials", async (req, res) => {
  try {
    await pool.query("DELETE FROM brand_klaviyo_credentials WHERE brand_profile_id = $1", [req.params.id]);
    res.json({ ok: true });
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
    const allowed = ["intent_type", "title", "risk_level", "goal_state", "goal_metadata", "source_ref", "template_id", "priority", "brand_profile_id"];
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

// ---------- Graph Self-Heal V1 RPCs ----------

/** GET /v1/graph/topology/:planId — nodes, edges, status (for graph view). */
app.get("/v1/graph/topology/:planId", async (req, res) => {
  try {
    const planId = req.params.planId;
    const [plan, nodes, edges] = await Promise.all([
      pool.query("SELECT id FROM plans WHERE id = $1", [planId]).then(r => r.rows[0]),
      pool.query("SELECT * FROM plan_nodes WHERE plan_id = $1 ORDER BY sequence NULLS LAST, node_key", [planId]).then(r => r.rows),
      pool.query("SELECT * FROM plan_edges WHERE plan_id = $1", [planId]).then(r => r.rows),
    ]);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json({ plan_id: planId, nodes, edges, status: "compiled" });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/graph/frontier/:runId — executable frontier (nodes eligible and queued). */
app.get("/v1/graph/frontier/:runId", async (req, res) => {
  try {
    const runId = req.params.runId;
    const run = await pool.query("SELECT id, plan_id FROM runs WHERE id = $1", [runId]).then(r => r.rows[0]);
    if (!run) return res.status(404).json({ error: "Run not found" });
    const nodeIds = await getExecutableFrontier(pool, runId);
    res.json({ run_id: runId, plan_id: run.plan_id, executable_node_ids: nodeIds });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/graph/upstream/:planId/:nodeId — upstream (ancestor) nodes. */
app.get("/v1/graph/upstream/:planId/:nodeId", async (req, res) => {
  try {
    const { planId, nodeId } = req.params;
    const plan = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]).then(r => r.rows[0]);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const nodeIds = await getUpstreamNodes(pool, planId, nodeId);
    res.json({ plan_id: planId, node_id: nodeId, upstream_node_ids: nodeIds });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/graph/downstream/:planId/:nodeId — downstream (dependent) nodes. */
app.get("/v1/graph/downstream/:planId/:nodeId", async (req, res) => {
  try {
    const { planId, nodeId } = req.params;
    const plan = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]).then(r => r.rows[0]);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const nodeIds = await getDownstreamNodes(pool, planId, nodeId);
    res.json({ plan_id: planId, node_id: nodeId, downstream_node_ids: nodeIds });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/graph/path/:planId — path from root to target. Query: root_node_id, target_node_id. */
app.get("/v1/graph/path/:planId", async (req, res) => {
  try {
    const planId = req.params.planId;
    const rootNodeId = req.query.root_node_id as string;
    const targetNodeId = req.query.target_node_id as string;
    if (!rootNodeId || !targetNodeId) return res.status(400).json({ error: "root_node_id and target_node_id required" });
    const plan = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]).then(r => r.rows[0]);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const path = await pathToNode(pool, planId, rootNodeId, targetNodeId);
    res.json({ plan_id: planId, root_node_id: rootNodeId, target_node_id: targetNodeId, path });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/graph/audit/:runId — graph audit: missing handlers, dangling edges, nodes without outputs. */
app.get("/v1/graph/audit/:runId", async (req, res) => {
  try {
    const runId = req.params.runId;
    const run = await pool.query("SELECT id, plan_id FROM runs WHERE id = $1", [runId]).then(r => r.rows[0]);
    if (!run) return res.status(404).json({ error: "Run not found" });
    const planId = run.plan_id as string;
    const [nodes, edges, artifacts] = await Promise.all([
      pool.query("SELECT * FROM plan_nodes WHERE plan_id = $1", [planId]).then(r => r.rows),
      pool.query("SELECT * FROM plan_edges WHERE plan_id = $1", [planId]).then(r => r.rows),
      pool.query("SELECT producer_plan_node_id FROM artifacts WHERE run_id = $1 AND producer_plan_node_id IS NOT NULL", [runId]).then(r => r.rows),
    ]);
    const nodeIds = new Set((nodes as { id: string }[]).map(n => n.id));
    const artifactProducerNodes = new Set((artifacts as { producer_plan_node_id: string }[]).map(a => a.producer_plan_node_id));
    const dangling: string[] = [];
    for (const e of edges as { from_node_id: string; to_node_id: string; id: string }[]) {
      if (!nodeIds.has(e.from_node_id) || !nodeIds.has(e.to_node_id)) dangling.push(e.id);
    }
    const nodesWithoutOutputs = (nodes as { id: string }[]).filter(n => !artifactProducerNodes.has(n.id)).map(n => n.id);
    const jobTypes = (nodes as { id: string; job_type: string }[]).map(n => n.job_type);
    const missing_handlers = getUnknownJobTypes(jobTypes);
    res.json({
      run_id: runId,
      plan_id: planId,
      dangling_edge_ids: dangling,
      nodes_without_artifact_outputs: nodesWithoutOutputs,
      missing_handlers,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/graph/missing_capabilities/:planId — plan nodes whose job_type has no registered handler. */
app.get("/v1/graph/missing_capabilities/:planId", async (req, res) => {
  try {
    const planId = req.params.planId;
    const plan = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]).then(r => r.rows[0]);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const nodes = await pool.query<{ id: string; node_key: string; job_type: string }>(
      "SELECT id, node_key, job_type FROM plan_nodes WHERE plan_id = $1",
      [planId]
    );
    const jobTypes = nodes.rows.map(n => n.job_type);
    const unknown = getUnknownJobTypes(jobTypes);
    const missing = nodes.rows.filter(n => unknown.includes(n.job_type)).map(n => ({ plan_node_id: n.id, node_key: n.node_key, job_type: n.job_type }));
    res.json({ plan_id: planId, missing_capabilities: missing });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/graph/lineage/:artifactId — producer and consumers (requires artifact_consumption). */
app.get("/v1/graph/lineage/:artifactId", async (req, res) => {
  try {
    const artifactId = req.params.artifactId;
    const artifact = await pool.query(
      "SELECT id, run_id, job_run_id, producer_plan_node_id, artifact_type FROM artifacts WHERE id = $1",
      [artifactId]
    ).then(r => r.rows[0]);
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    let consumers: { job_run_id: string; plan_node_id: string }[] = [];
    try {
      const c = await pool.query(
        "SELECT job_run_id, plan_node_id FROM artifact_consumption WHERE artifact_id = $1",
        [artifactId]
      );
      consumers = c.rows as { job_run_id: string; plan_node_id: string }[];
    } catch {
      // artifact_consumption table may not exist yet
    }
    res.json({
      artifact_id: artifactId,
      run_id: artifact.run_id,
      producer_plan_node_id: artifact.producer_plan_node_id ?? null,
      consumers,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/job_failures — record a job failure (runner callback). Classifies failure_class, upserts incident_memory, optionally sets job_runs.failure_class. Body: run_id, job_run_id, plan_node_id, error_signature, job_type?. */
app.post("/v1/job_failures", async (req, res) => {
  try {
    const body = req.body as { run_id?: string; job_run_id?: string; plan_node_id?: string; error_signature?: string; job_type?: string };
    if (!body?.job_run_id || !body?.error_signature) {
      return res.status(400).json({ error: "job_run_id and error_signature required" });
    }
    const failureClass = classifyFailure(body.error_signature, body.job_type);
    await recordBuildIncident(pool, body.error_signature, failureClass);
    try {
      await pool.query(
        "UPDATE job_runs SET failure_class = $1 WHERE id = $2",
        [failureClass, body.job_run_id]
      );
    } catch {
      // job_runs.failure_class column may not exist in older migrations
    }
    res.status(201).json({ failure_class: failureClass, recorded: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/graph/repair_plan/:runId/:nodeId — repair plan for a failed node. */
app.get("/v1/graph/repair_plan/:runId/:nodeId", async (req, res) => {
  try {
    const runId = req.params.runId;
    const nodeId = req.params.nodeId;
    const run = await pool.query("SELECT id, plan_id FROM runs WHERE id = $1", [runId]).then(r => r.rows[0]);
    if (!run) return res.status(404).json({ error: "Run not found" });
    const planId = run.plan_id as string;
    const [upstream, downstream] = await Promise.all([
      getUpstreamNodes(pool, planId, nodeId),
      getDownstreamNodes(pool, planId, nodeId),
    ]);
    const jobRun = await pool.query(
      "SELECT id, status, error_signature FROM job_runs WHERE run_id = $1 AND plan_node_id = $2 ORDER BY attempt DESC LIMIT 1",
      [runId, nodeId]
    ).then(r => r.rows[0]);
    const failureCause = jobRun?.error_signature ?? "unknown";
    const similarIncidents = await incidentLookup(pool, failureCause, undefined, 5);
    res.json({
      run_id: runId,
      node_id: nodeId,
      plan_id: planId,
      failure_cause: failureCause,
      upstream_node_ids: upstream,
      downstream_node_ids: downstream,
      recommended_repair: "replay_subgraph",
      replay_scope: downstream,
      confidence: 0.8,
      similar_incidents: similarIncidents.map((m) => ({
        memory_id: m.memory_id,
        failure_signature: m.failure_signature,
        failure_class: m.failure_class,
        resolution: m.resolution,
        confidence: m.confidence,
        times_seen: m.times_seen,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/graph/subgraph_replay — re-execute root node and all downstream nodes. Body: run_id, root_node_id; optional dry_run=true; policy-gated (approval required if policy says so). */
app.post("/v1/graph/subgraph_replay", async (req, res) => {
  try {
    const body = req.body as { run_id?: string; root_node_id?: string; dry_run?: boolean; approved_by?: string };
    if (!body?.run_id || !body?.root_node_id) {
      return res.status(400).json({ error: "run_id and root_node_id required" });
    }
    if (body.dry_run) {
      const plan = await subgraphReplayPlan(pool, body.run_id, body.root_node_id);
      return res.json({ dry_run: true, ...plan });
    }
    const actionRow = await pool.query<{ risk_level: string }>("SELECT risk_level FROM action_registry WHERE action_key = $1", ["subgraph_replay"]).then((r) => r.rows[0]);
    const riskLevel = actionRow?.risk_level ?? "medium";
    const policyResult = await evaluatePolicy(pool, { action_key: "subgraph_replay", target_type: "run", risk_level: riskLevel, context: { run_id: body.run_id } });
    if (!policyResult.allowed) {
      return res.status(403).json({ error: "Policy denies this action", reason: policyResult.reason });
    }
    if (policyResult.require_approval && !body.approved_by) {
      return res.status(403).json({ error: "Approval required for this action", reason: policyResult.reason, require_approval: true });
    }
    const result = await executeSubgraphReplay(pool, body.run_id, body.root_node_id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/capabilities — capability registry (job types the system can run, with labels and optional contracts). Dev Kernel V1. */
app.get("/v1/capabilities", async (_req, res) => {
  try {
    const { getCapabilityRegistry } = await import("./capability-registry.js");
    const items = getCapabilityRegistry();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/incident_memory — list incident memory (optional failure_class, limit). */
app.get("/v1/incident_memory", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const failureClass = (req.query.failure_class as string) || null;
    let q = "SELECT memory_id, failure_signature, failure_class, resolution, confidence, times_seen, last_seen_at, created_at FROM incident_memory WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (failureClass) { q += ` AND failure_class = $${i++}`; params.push(failureClass); }
    q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/incident_memory — record a resolution (e.g. after operator confirms fix). */
app.post("/v1/incident_memory", async (req, res) => {
  try {
    const body = req.body as { failure_signature?: string; failure_class?: string; resolution?: string; confidence?: number };
    if (!body?.failure_signature || !body?.failure_class || !body?.resolution) {
      return res.status(400).json({ error: "failure_signature, failure_class, and resolution required" });
    }
    await incidentRecord(
      pool,
      body.failure_signature,
      body.failure_class,
      body.resolution,
      typeof body.confidence === "number" ? body.confidence : 0.8
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/memory/lookup — rpc_memory_lookup: similar incidents/recipes by signature and optional scope_key. Queries incident_memory and memory_entries (types: incident, repair_recipe, failure_pattern). */
app.get("/v1/memory/lookup", async (req, res) => {
  try {
    const signature = (req.query.signature as string) || (req.query.failure_signature as string) || "";
    const scopeKey = (req.query.scope_key as string) || null;
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const incidents = await incidentLookup(pool, signature, null, limit);
    let entries: unknown[] = [];
    try {
      let q = "SELECT memory_id, memory_type, scope_type, scope_key, title, summary, signature_json, resolution_json, confidence, times_seen, last_seen_at FROM memory_entries WHERE memory_type IN ('incident', 'repair_recipe', 'failure_pattern')";
      const params: unknown[] = [];
      let i = 1;
      if (scopeKey) { q += ` AND (scope_key = $${i++} OR scope_key IS NULL)`; params.push(scopeKey); }
      q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
      params.push(limit);
      const r = await pool.query(q, params);
      entries = r.rows;
    } catch {
      // memory_entries table may not exist yet
    }
    res.json({ similar_incidents: incidents, memory_entries: entries });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/memory_entries — list memory_entries (optional memory_type, scope_type, scope_key, limit). */
app.get("/v1/memory_entries", async (req, res) => {
  try {
    const memoryType = (req.query.memory_type as string) || null;
    const scopeType = (req.query.scope_type as string) || null;
    const scopeKey = (req.query.scope_key as string) || null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    let q = "SELECT memory_id, memory_type, scope_type, scope_key, title, summary, signature_json, evidence_json, resolution_json, confidence, times_seen, last_seen_at, created_at FROM memory_entries WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (memoryType) { q += ` AND memory_type = $${i++}`; params.push(memoryType); }
    if (scopeType) { q += ` AND scope_type = $${i++}`; params.push(scopeType); }
    if (scopeKey) { q += ` AND scope_key = $${i++}`; params.push(scopeKey); }
    q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/memory_entries — create a memory entry (Part D.1). */
app.post("/v1/memory_entries", async (req, res) => {
  try {
    const body = req.body as { memory_type?: string; scope_type?: string; scope_key?: string; title?: string; summary?: string; signature_json?: unknown; evidence_json?: unknown; resolution_json?: unknown; confidence?: number };
    if (!body?.memory_type || !body?.scope_type) return res.status(400).json({ error: "memory_type and scope_type required" });
    const r = await pool.query(
      `INSERT INTO memory_entries (memory_type, scope_type, scope_key, title, summary, signature_json, evidence_json, resolution_json, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING memory_id, memory_type, scope_type, scope_key, title, summary, signature_json, evidence_json, resolution_json, confidence, times_seen, last_seen_at, created_at`,
      [
        body.memory_type,
        body.scope_type,
        body.scope_key ?? null,
        body.title ?? null,
        body.summary ?? null,
        body.signature_json ? JSON.stringify(body.signature_json) : null,
        body.evidence_json ? JSON.stringify(body.evidence_json) : null,
        body.resolution_json ? JSON.stringify(body.resolution_json) : null,
        typeof body.confidence === "number" ? body.confidence : null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/baselines/compute — compute KPI baselines from kpi_values and store in memory_entries (Phase 7). */
app.post("/v1/baselines/compute", async (_req, res) => {
  try {
    const body = (_req as express.Request).body as { window_days?: number; min_samples?: number } | undefined;
    const baselines = await computeBaselines(pool, {
      windowDays: body?.window_days ?? 30,
      minSamples: body?.min_samples ?? 3,
    });
    res.json({ baselines: baselines.length, items: baselines });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/decision_loop/observe — read-only: anomalies + baselines (no act). */
app.get("/v1/decision_loop/observe", async (_req, res) => {
  try {
    const anomalies = await detectAnomalies(pool);
    res.json({ anomalies });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/decision_loop/tick — run one decision loop tick: observe → diagnose → decide → [act] → learn. Body: auto_act?, compute_baselines?. */
app.post("/v1/decision_loop/tick", async (req, res) => {
  try {
    const body = req.body as { auto_act?: boolean; compute_baselines?: boolean } | undefined;
    const result = await runDecisionLoopTick(pool, {
      auto_act: body?.auto_act ?? false,
      compute_baselines: body?.compute_baselines ?? true,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/repair_runs — list repair runs (optional run_id, status, limit). */
app.get("/v1/repair_runs", async (req, res) => {
  try {
    const runId = (req.query.run_id as string) || null;
    const status = (req.query.status as string) || null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    let q = "SELECT repair_run_id, incident_memory_id, root_node_id, run_id, repair_strategy, repair_plan_artifact_id, status, started_at, completed_at, created_at FROM repair_runs WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (runId) { q += ` AND run_id = $${i++}`; params.push(runId); }
    if (status) { q += ` AND status = $${i++}`; params.push(status); }
    q += ` ORDER BY created_at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/repair_runs — create and execute a repair run (rpc_repair_execute). Body: run_id, root_node_id, optional incident_memory_id. Creates repair_runs row, runs subgraph_replay, updates status. */
app.post("/v1/repair_runs", async (req, res) => {
  try {
    const body = req.body as { run_id?: string; root_node_id?: string; incident_memory_id?: string; repair_plan_artifact_id?: string };
    if (!body?.run_id || !body?.root_node_id) return res.status(400).json({ error: "run_id and root_node_id required" });
    const repairRunId = uuid();
    await pool.query(
      `INSERT INTO repair_runs (repair_run_id, incident_memory_id, root_node_id, run_id, repair_strategy, repair_plan_artifact_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'replay_subgraph', $5, 'running', now())`,
      [repairRunId, body.incident_memory_id ?? null, body.root_node_id, body.run_id, body.repair_plan_artifact_id ?? null]
    );
    let status = "succeeded";
    try {
      await executeSubgraphReplay(pool, body.run_id, body.root_node_id);
    } catch (err) {
      status = "failed";
      await pool.query(
        "UPDATE repair_runs SET status = $1, completed_at = now() WHERE repair_run_id = $2",
        [status, repairRunId]
      );
      throw err;
    }
    await pool.query(
      "UPDATE repair_runs SET status = $1, completed_at = now() WHERE repair_run_id = $2",
      [status, repairRunId]
    );
    // Dev Kernel V1: record resolution in incident_memory when repair succeeds (action → learning)
    if (status === "succeeded") {
      const failedJob = await pool.query<{ error_signature: string; failure_class: string }>(
        "SELECT error_signature, failure_class FROM job_runs WHERE run_id = $1 AND plan_node_id = $2 AND status = 'failed' ORDER BY attempt DESC LIMIT 1",
        [body.run_id, body.root_node_id]
      ).then((r) => r.rows[0]).catch(() => null);
      if (failedJob?.error_signature) {
        await incidentRecord(
          pool,
          failedJob.error_signature,
          failedJob.failure_class || "generic_failure",
          "subgraph_replay",
          0.8
        ).catch(() => {});
      }
    }
    res.status(201).json({ repair_run_id: repairRunId, run_id: body.run_id, root_node_id: body.root_node_id, status });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/migration_guard — parse migration SQL; return tables/columns touched and risk hints. */
app.post("/v1/migration_guard", async (req, res) => {
  try {
    const body = req.body as { sql?: string };
    const sql = body?.sql ?? "";
    const result = parseMigrationSql(sql);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/migration_audit — post-migration audit: current schema (tables, columns) from information_schema. */
app.get("/v1/migration_audit", async (req, res) => {
  try {
    const snapshotId = (req.query.snapshot_id as string) || null;
    const result = await postMigrationAudit(pool, snapshotId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/deploy_events — record a build/deploy outcome (Part I.2). Optionally creates change_event and classifies from build_log_text. */
app.post("/v1/deploy_events", async (req, res) => {
  try {
    const body = req.body as DeployEventPayload;
    if (!body?.status) return res.status(400).json({ error: "status required" });
    const result = await createDeployEventFromPayload(pool, body);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/webhooks/deploy — webhook for Render/GitHub Actions etc. Same body as POST /v1/deploy_events (service_id, commit_sha, status, build_log_text). Optional X-Webhook-Secret for future auth. */
app.post("/v1/webhooks/deploy", async (req, res) => {
  try {
    const body = req.body as DeployEventPayload;
    if (!body?.status) return res.status(400).json({ error: "status required" });
    const result = await createDeployEventFromPayload(pool, body);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/deploy_events/:id/repair_plan — suggested build repair actions and similar incidents for a failed deploy. */
app.get("/v1/deploy_events/:id/repair_plan", async (req, res) => {
  try {
    const deployId = req.params.id;
    const deployRow = await pool.query(
      "SELECT deploy_id, service_id, commit_sha, status, failure_class, error_signature, change_event_id FROM deploy_events WHERE deploy_id = $1",
      [deployId]
    );
    if (deployRow.rows.length === 0) return res.status(404).json({ error: "deploy event not found" });
    const deploy = deployRow.rows[0];
    const actionsRow = await pool.query(
      "SELECT action_id, action_key, label, description, risk_level, requires_approval FROM build_repair_actions ORDER BY action_key"
    );
    let similar_incidents: Awaited<ReturnType<typeof incidentLookup>> = [];
    if (deploy.error_signature || deploy.failure_class) {
      similar_incidents = await incidentLookup(
        pool,
        deploy.error_signature ?? "",
        deploy.failure_class ?? null,
        10
      );
    }
    let build_config_snapshot: { dependencies_json: unknown; externals_json: unknown; created_at: string } | null = null;
    if (deploy.service_id) {
      try {
        const snap = await pool.query(
          "SELECT dependencies_json, externals_json, created_at FROM build_config_snapshots WHERE service_id = $1 ORDER BY created_at DESC LIMIT 1",
          [deploy.service_id]
        );
        if (snap.rows.length > 0) build_config_snapshot = snap.rows[0];
      } catch {
        // table may not exist
      }
    }
    let suggested_file_actions: { suggested_files: string[]; unresolved_path: string | null } = { suggested_files: [], unresolved_path: null };
    if (deploy.service_id && (deploy.failure_class === "module_resolution_failed" || deploy.failure_class === "missing_committed_file") && deploy.error_signature) {
      try {
        suggested_file_actions = await suggestFilesFromImportGraph(pool, deploy.service_id, deploy.error_signature);
      } catch {
        // import_graph_snapshots may not exist
      }
    }
    res.json({
      deploy_id: deploy.deploy_id,
      service_id: deploy.service_id,
      commit_sha: deploy.commit_sha,
      status: deploy.status,
      failure_class: deploy.failure_class,
      error_signature: deploy.error_signature,
      change_event_id: deploy.change_event_id,
      suggested_actions: actionsRow.rows,
      similar_incidents,
      build_config_snapshot,
      suggested_file_actions,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/deploy_events — list deploy events (optional service_id, status, limit). */
app.get("/v1/deploy_events", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const serviceId = (req.query.service_id as string) || null;
    const status = (req.query.status as string) || null;
    let q = "SELECT deploy_id, change_event_id, service_id, commit_sha, status, failure_class, error_signature, external_deploy_id, created_at FROM deploy_events WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (serviceId) { q += ` AND service_id = $${i++}`; params.push(serviceId); }
    if (status) { q += ` AND status = $${i++}`; params.push(status); }
    q += ` ORDER BY created_at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/deploy_events/sync — sync deploy_events from Render API (full deploy observability). Env: RENDER_API_KEY, RENDER_SERVICE_IDS (e.g. srv-xxx:control-plane). */
app.post("/v1/deploy_events/sync", async (_req, res) => {
  try {
    const result = await syncAllRenderDeploys(pool);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/deploy_events/sync_github — sync deploy_events from GitHub Actions (failed workflow runs). Env: GITHUB_TOKEN, GITHUB_REPOS (e.g. owner/repo:control-plane). */
app.post("/v1/deploy_events/sync_github", async (_req, res) => {
  try {
    const result = await syncAllGitHubDeploys(pool);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/build_repair_actions — list registered build repair actions (Part I.2). */
app.get("/v1/build_repair_actions", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT action_id, action_key, label, description, risk_level, requires_approval FROM build_repair_actions ORDER BY action_key"
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/import_graph — get latest import graph snapshot for a service (Part I.2 repo/build model). */
app.get("/v1/import_graph", async (req, res) => {
  try {
    const serviceId = (req.query.service_id as string) || null;
    if (!serviceId) return res.status(400).json({ error: "service_id required" });
    const r = await pool.query(
      "SELECT snapshot_id, service_id, snapshot_json, created_at FROM import_graph_snapshots WHERE service_id = $1 ORDER BY created_at DESC LIMIT 1",
      [serviceId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "No import graph for this service" });
    res.json(r.rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return res.status(404).json({ error: "Import graph not available" });
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/import_graph — store import graph snapshot (e.g. from scripts/export-import-graph.mjs). Body: service_id, snapshot_json. */
app.post("/v1/import_graph", async (req, res) => {
  try {
    const body = req.body as { service_id?: string; snapshot_json?: { files?: string[]; edges?: { from: string; to: string }[] } };
    if (!body?.service_id || !body?.snapshot_json) return res.status(400).json({ error: "service_id and snapshot_json required" });
    const r = await pool.query(
      "INSERT INTO import_graph_snapshots (service_id, snapshot_json) VALUES ($1, $2) RETURNING snapshot_id, service_id, created_at",
      [body.service_id, JSON.stringify(body.snapshot_json)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return res.status(501).json({ error: "Run migration 20250326000001_import_graph_and_schema_drift.sql first" });
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/action_registry — list action registry (Part L.3). */
app.get("/v1/action_registry", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT action_key, action_type, target_type, risk_level, validation_strategy, rollback_strategy, approval_policy_key FROM action_registry ORDER BY action_key"
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/connectors/meta/ingest — run Meta connector pull/map/store (Phase 1). Body: scope_key, ad_account_id, access_token. */
app.post("/v1/connectors/meta/ingest", async (req, res) => {
  try {
    const body = req.body as { scope_key?: string; ad_account_id?: string; access_token?: string };
    if (!body?.scope_key || !body?.ad_account_id) return res.status(400).json({ error: "scope_key and ad_account_id required" });
    const result = await runMetaIngest(pool, { scope_key: body.scope_key, ad_account_id: body.ad_account_id, access_token: body.access_token ?? "" });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/connectors/shopify/ingest — run Shopify connector pull/map/store (Phase 1). Body: scope_key, shop_domain, store_external_ref, access_token. */
app.post("/v1/connectors/shopify/ingest", async (req, res) => {
  try {
    const body = req.body as { scope_key?: string; shop_domain?: string; store_external_ref?: string; access_token?: string };
    if (!body?.scope_key || !body?.shop_domain || !body?.store_external_ref) return res.status(400).json({ error: "scope_key, shop_domain, store_external_ref required" });
    const result = await runShopifyIngest(pool, { scope_key: body.scope_key, shop_domain: body.shop_domain, store_external_ref: body.store_external_ref, access_token: body.access_token ?? "" });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/ads/diagnosis — run diagnosis for scope (Phase 3). Query: scope_key, date_from?, date_to?, roas_floor?. */
app.get("/v1/ads/diagnosis", async (req, res) => {
  try {
    const scope_key = (req.query.scope_key as string) || "";
    if (!scope_key) return res.status(400).json({ error: "scope_key required" });
    const date_from = (req.query.date_from as string) || undefined;
    const date_to = (req.query.date_to as string) || undefined;
    const roas_floor = req.query.roas_floor != null ? Number(req.query.roas_floor) : undefined;
    const candidates = await runDiagnosis(pool, scope_key, { dateFrom: date_from, dateTo: date_to, roas_floor });
    res.json({ candidates });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/ads/slack/daily-summary — build and optionally post daily summary to Slack (Phase 5). Body: scope_key, date_from?, date_to?, post?: boolean. */
app.post("/v1/ads/slack/daily-summary", async (req, res) => {
  try {
    const body = req.body as { scope_key?: string; date_from?: string; date_to?: string; post?: boolean };
    if (!body?.scope_key) return res.status(400).json({ error: "scope_key required" });
    const payload = await buildDailySummary(pool, body.scope_key, body.date_from, body.date_to);
    const posted = body.post === true ? await postDailySummaryToSlack(payload) : false;
    res.json({ summary: payload, posted });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/checkpoints — list graph checkpoints (optional scope_type, scope_id, limit). */
app.get("/v1/checkpoints", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const scopeType = (req.query.scope_type as string) || null;
    const scopeId = (req.query.scope_id as string) || null;
    let q = "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (scopeType) { q += ` AND scope_type = $${i++}`; params.push(scopeType); }
    if (scopeId) { q += ` AND scope_id = $${i++}`; params.push(scopeId); }
    q += ` ORDER BY created_at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/checkpoints — create a known-good checkpoint (scope_type, scope_id, optional run_id). */
app.post("/v1/checkpoints", async (req, res) => {
  try {
    const body = req.body as { scope_type?: string; scope_id?: string; run_id?: string };
    if (!body?.scope_type || !body?.scope_id) return res.status(400).json({ error: "scope_type and scope_id required" });
    const r = await pool.query(
      `INSERT INTO graph_checkpoints (scope_type, scope_id, run_id)
       VALUES ($1, $2, $3)
       RETURNING checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at`,
      [body.scope_type, body.scope_id, body.run_id ?? null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/checkpoints/:id — single checkpoint. */
app.get("/v1/checkpoints/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE checkpoint_id = $1",
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Checkpoint not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/checkpoints/:id/diff — rpc_diff_checkpoint: current schema vs checkpoint (current from information_schema; snapshot diff when artifact content available). */
app.get("/v1/checkpoints/:id/diff", async (req, res) => {
  try {
    const cp = await pool.query(
      "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE checkpoint_id = $1",
      [req.params.id]
    );
    if (cp.rows.length === 0) return res.status(404).json({ error: "Checkpoint not found" });
    const checkpoint = cp.rows[0];
    const audit = await postMigrationAudit(pool, null);
    res.json({
      checkpoint_id: checkpoint.checkpoint_id,
      scope_type: checkpoint.scope_type,
      scope_id: checkpoint.scope_id,
      created_at: checkpoint.created_at,
      current_schema: { tables: audit.current_tables.length, columns: audit.current_columns.length },
      current_tables: audit.current_tables,
      current_columns: audit.current_columns,
      snapshot_artifact_id: checkpoint.schema_snapshot_artifact_id,
      snapshot_diff: checkpoint.schema_snapshot_artifact_id ? "Compare to artifact content (V1: no stored body)" : null,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/known_good — rpc_known_good: most recent checkpoint for scope (query: scope_type, scope_id). */
app.get("/v1/known_good", async (req, res) => {
  try {
    const scopeType = (req.query.scope_type as string) || null;
    const scopeId = (req.query.scope_id as string) || null;
    if (!scopeType || !scopeId) return res.status(400).json({ error: "scope_type and scope_id required" });
    const r = await pool.query(
      "SELECT checkpoint_id, scope_type, scope_id, run_id, schema_snapshot_artifact_id, contract_snapshot_artifact_id, config_snapshot_artifact_id, created_at FROM graph_checkpoints WHERE scope_type = $1 AND scope_id = $2 ORDER BY created_at DESC LIMIT 1",
      [scopeType, scopeId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "No checkpoint found for this scope" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/failure_clusters — rpc_failure_clusters: recurring failure families (grouped by failure_class from incident_memory). Optional scope_key filter via failure_class. */
app.get("/v1/failure_clusters", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const r = await pool.query(
      `SELECT failure_class, COUNT(*) AS count, MAX(last_seen_at) AS last_seen
       FROM incident_memory
       GROUP BY failure_class
       ORDER BY count DESC, last_seen DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ clusters: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/actions/execute — execute a registered action (policy-gated). Body: action_key, params, optional approved_by, include_validation_plan. System actions use action-executor (validation + learning). */
app.post("/v1/actions/execute", async (req, res) => {
  try {
    const body = req.body as { action_key?: string; params?: Record<string, string>; approved_by?: string; include_validation_plan?: boolean; run_validation_after?: boolean };
    if (!body?.action_key) return res.status(400).json({ error: "action_key required" });
    const params = body.params ?? {};
    if (["subgraph_replay", "rerun_pipeline", "rollback_release"].includes(body.action_key)) {
      try {
        const out = await executeAction(pool, {
          action_key: body.action_key,
          params,
          approved_by: body.approved_by,
          run_validation_after: body.run_validation_after,
          include_validation_plan: body.include_validation_plan,
        });
        return res.json(out);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("Policy denies") || msg.includes("Approval required")) return res.status(403).json({ error: msg, reason: msg });
        if (msg.includes("not found") || msg.includes("Run not found")) return res.status(404).json({ error: msg });
        if (msg.includes("required") || msg.includes("Unknown action_key")) return res.status(400).json({ error: msg });
        throw err;
      }
    }
    const actionRow = await pool.query<{ risk_level: string; target_type: string | null }>(
      "SELECT risk_level, target_type FROM action_registry WHERE action_key = $1",
      [body.action_key]
    ).then((r) => r.rows[0]);
    if (!actionRow) return res.status(400).json({ error: "Unknown action_key" });
    const policyResult = await evaluatePolicy(pool, {
      action_key: body.action_key,
      target_type: actionRow.target_type ?? undefined,
      risk_level: actionRow.risk_level,
      context: params,
    });
    if (!policyResult.allowed) {
      return res.status(403).json({ error: "Policy denies this action", reason: policyResult.reason });
    }
    if (policyResult.require_approval && !body.approved_by) {
      return res.status(403).json({ error: "Approval required", reason: policyResult.reason, require_approval: true });
    }
    if (body.action_key === "pause_campaign") {
      const campaignId = params.campaign_id ?? params.entity_id;
      const scopeKey = params.scope_key ?? null;
      if (!campaignId) return res.status(400).json({ error: "params.campaign_id or params.entity_id required for pause_campaign" });
      try {
        const row = await pool.query<{ id: string; external_ref: string; scope_key: string; channel: string }>(
          `SELECT c.id, c.external_ref, aa.scope_key, aa.channel FROM campaigns c JOIN ad_accounts aa ON aa.id = c.ad_account_id WHERE c.id = $1::uuid`,
          [campaignId]
        ).then((r) => r.rows[0]);
        if (row?.channel === "meta" && row.scope_key) {
          const cred = await pool.query<{ access_token_encrypted: string }>(
            "SELECT access_token_encrypted FROM ad_platform_credentials WHERE scope_key = $1 AND channel = 'meta' LIMIT 1",
            [row.scope_key]
          ).then((r) => r.rows[0]);
          const token = cred?.access_token_encrypted ?? "";
          const result = await metaPauseCampaign({ scope_key: row.scope_key, access_token: token }, row.external_ref);
          if (result.success) {
            await pool.query("UPDATE campaigns SET status = 'paused', updated_at = now() WHERE id = $1", [row.id]);
            const validation = await metaGetStatus({ scope_key: row.scope_key, access_token: token }, "campaign", row.external_ref);
            const ev = await pool.query(
              "INSERT INTO business_events (event_type, from_entity_id, payload_json, source_system) VALUES ('campaign_paused', NULL, $1, 'control_plane') RETURNING event_id",
              [JSON.stringify({ action: "pause_campaign", campaign_id: row.id, external_ref: row.external_ref, approved_by: body.approved_by ?? null, validated: validation.status === "paused" })]
            );
            return res.json({ action_key: "pause_campaign", result: { campaign_id: row.id, external_ref: row.external_ref, validated: validation.status === "paused", event_id: ev.rows[0]?.event_id } });
          }
        }
      } catch {
        /* fallback to legacy business_entities if canonical tables missing or Meta fail */
      }
      await pool.query(
        "UPDATE business_entities SET metadata_json = coalesce(metadata_json, '{}'::jsonb) || '{\"status\":\"paused\"}'::jsonb, updated_at = now() WHERE entity_id = $1",
        [campaignId]
      ).catch(() => {});
      const ev = await pool.query(
        "INSERT INTO business_events (event_type, from_entity_id, payload_json, source_system) VALUES ('campaign_paused', $1, $2, 'control_plane') RETURNING event_id",
        [campaignId, JSON.stringify({ action: "pause_campaign", approved_by: body.approved_by ?? null })]
      );
      return res.json({ action_key: "pause_campaign", result: { entity_id: campaignId, event_id: ev.rows[0]?.event_id } });
    }
    if (body.action_key === "pause_ad_set") {
      const adSetId = params.ad_set_id;
      if (!adSetId) return res.status(400).json({ error: "params.ad_set_id required for pause_ad_set" });
      try {
        const row = await pool.query<{ id: string; external_ref: string; scope_key: string; channel: string }>(
          `SELECT s.id, s.external_ref, aa.scope_key, aa.channel FROM ad_sets s JOIN campaigns c ON c.id = s.campaign_id JOIN ad_accounts aa ON aa.id = c.ad_account_id WHERE s.id = $1::uuid`,
          [adSetId]
        ).then((r) => r.rows[0]);
        if (row?.channel === "meta" && row.scope_key) {
          const cred = await pool.query<{ access_token_encrypted: string }>(
            "SELECT access_token_encrypted FROM ad_platform_credentials WHERE scope_key = $1 AND channel = 'meta' LIMIT 1",
            [row.scope_key]
          ).then((r) => r.rows[0]);
          const token = cred?.access_token_encrypted ?? "";
          const result = await metaPauseAdSet({ scope_key: row.scope_key, access_token: token }, row.external_ref);
          if (result.success) {
            await pool.query("UPDATE ad_sets SET status = 'paused', updated_at = now() WHERE id = $1", [row.id]);
            const validation = await metaGetStatus({ scope_key: row.scope_key, access_token: token }, "ad_set", row.external_ref);
            const ev = await pool.query(
              "INSERT INTO business_events (event_type, from_entity_id, payload_json, source_system) VALUES ('ad_set_paused', NULL, $1, 'control_plane') RETURNING event_id",
              [JSON.stringify({ action: "pause_ad_set", ad_set_id: row.id, external_ref: row.external_ref, approved_by: body.approved_by ?? null, validated: validation.status === "paused" })]
            );
            return res.json({ action_key: "pause_ad_set", result: { ad_set_id: row.id, external_ref: row.external_ref, validated: validation.status === "paused", event_id: ev.rows[0]?.event_id } });
          }
        }
      } catch {
        /* canonical tables missing or Meta fail */
      }
      return res.status(400).json({ error: "pause_ad_set requires canonical ad_sets and Meta credentials" });
    }
    if (body.action_key === "reduce_budget") {
      const entityId = params.entity_id ?? params.campaign_id;
      const amount = params.amount != null ? Number(params.amount) : null;
      const percent = params.percent != null ? Number(params.percent) : null;
      if (!entityId) return res.status(400).json({ error: "params.entity_id or params.campaign_id required for reduce_budget" });
      const ev = await pool.query(
        "INSERT INTO business_events (event_type, from_entity_id, payload_json, source_system) VALUES ('budget_reduced', $1, $2, 'control_plane') RETURNING event_id",
        [entityId, JSON.stringify({ amount, percent, approved_by: body.approved_by ?? null })]
      );
      return res.json({ action_key: "reduce_budget", result: { entity_id: entityId, event_id: ev.rows[0]?.event_id } });
    }
    if (body.action_key === "open_incident") {
      const summary = params.summary ?? params.title ?? "Incident from decision loop";
      const mem = await pool.query(
        `INSERT INTO memory_entries (memory_type, scope_type, scope_key, title, summary, confidence) VALUES ('incident', 'system', 'decision_loop', $1, $2, 0.7) RETURNING memory_id`,
        [summary.slice(0, 255), summary]
      );
      return res.json({ action_key: "open_incident", result: { memory_id: mem.rows[0]?.memory_id } });
    }
    if (body.action_key === "klaviyo_template_create_or_update") {
      const brand_profile_id = params.brand_profile_id;
      const artifact_id = params.artifact_id;
      if (!brand_profile_id) return res.status(400).json({ error: "params.brand_profile_id required" });
      if (!artifact_id) return res.status(400).json({ error: "params.artifact_id required" });
      const creds = await getKlaviyoCredentials(pool, brand_profile_id);
      const sendReady = await buildSendReadyEmail(pool, {
        artifact_id,
        subject: "Email",
        from_name: "Sender",
        from_email: "noreply@example.com",
        brand_profile_id,
      });
      const name = `Template ${artifact_id.slice(0, 8)}`;
      const existing = await pool.query<{ klaviyo_template_id: string }>(
        "SELECT klaviyo_template_id FROM klaviyo_template_sync WHERE brand_profile_id = $1 AND artifact_id = $2 LIMIT 1",
        [brand_profile_id, artifact_id]
      ).then((r) => r.rows[0]);
      let templateId: string;
      if (existing?.klaviyo_template_id) {
        await updateTemplate({ apiKey: creds.api_key, templateId: existing.klaviyo_template_id, template: { name, html: sendReady.html } });
        templateId = existing.klaviyo_template_id;
      } else {
        templateId = await createTemplate({ apiKey: creds.api_key, template: { name, html: sendReady.html } });
        await pool.query(
          "INSERT INTO klaviyo_template_sync (brand_profile_id, artifact_id, klaviyo_template_id, sync_state, last_synced_at, updated_at) VALUES ($1, $2, $3, 'synced', now(), now()) ON CONFLICT (brand_profile_id, artifact_id) DO UPDATE SET klaviyo_template_id = EXCLUDED.klaviyo_template_id, sync_state = 'synced', last_synced_at = now(), updated_at = now()",
          [brand_profile_id, artifact_id, templateId]
        );
      }
      return res.json({ action_key: "klaviyo_template_create_or_update", result: { template_id: templateId } });
    }
    if (body.action_key === "klaviyo_campaign_create_and_schedule") {
      const initiative_id = params.initiative_id ?? undefined;
      const run_id = params.run_id ?? undefined;
      const artifact_id = params.artifact_id;
      if (!artifact_id) return res.status(400).json({ error: "params.artifact_id required" });
      if (!initiative_id && !run_id) return res.status(400).json({ error: "params.initiative_id or params.run_id required" });
      const audience_list_ids = params.audience_list_ids ? (typeof params.audience_list_ids === "string" ? params.audience_list_ids.split(",") : [params.audience_list_ids as string]) : undefined;
      const result = await runKlaviyoCampaignPipeline({
        pool,
        initiative_id,
        run_id,
        artifact_id,
        schedule_at: params.schedule_at ?? undefined,
        audience_list_ids,
      });
      return res.json({ action_key: "klaviyo_campaign_create_and_schedule", result });
    }
    if (body.action_key === "klaviyo_flow_create_draft") {
      const brand_profile_id = params.brand_profile_id;
      const flow_type = params.flow_type;
      if (!brand_profile_id || !flow_type) return res.status(400).json({ error: "params.brand_profile_id and params.flow_type required" });
      const template_ids = params.template_ids ? (typeof params.template_ids === "string" ? params.template_ids.split(",") : [params.template_ids as string]) : undefined;
      const result = await runKlaviyoFlowPipeline({
        pool,
        brand_profile_id,
        flow_type,
        flow_name: params.flow_name ?? undefined,
        template_ids,
        delays_minutes: params.delays_minutes ? (typeof params.delays_minutes === "string" ? params.delays_minutes.split(",").map(Number) : [params.delays_minutes as number]) : undefined,
      });
      return res.json({ action_key: "klaviyo_flow_create_draft", result });
    }
    if (body.action_key === "klaviyo_flow_set_status") {
      const flow_id = params.flow_id;
      const status = params.status as "draft" | "manual" | "live";
      const brand_profile_id = params.brand_profile_id;
      if (!flow_id || !status || !["draft", "manual", "live"].includes(status)) return res.status(400).json({ error: "params.flow_id and params.status (draft|manual|live) required" });
      const resolvedBrand = brand_profile_id ?? await pool.query<{ brand_profile_id: string }>("SELECT brand_profile_id FROM klaviyo_flow_sync WHERE klaviyo_flow_id = $1 LIMIT 1", [flow_id]).then((r) => r.rows[0]?.brand_profile_id);
      if (!resolvedBrand) return res.status(400).json({ error: "params.brand_profile_id required or flow not in sync table" });
      const result = await setKlaviyoFlowStatus({
        pool,
        brand_profile_id: resolvedBrand,
        flow_id,
        status,
        approved_by: body.approved_by,
      });
      return res.json({ action_key: "klaviyo_flow_set_status", result });
    }
    return res.status(400).json({ error: "Unsupported action_key; use dedicated endpoint", action_key: body.action_key });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/kpi_registry — list KPIs (optional scope_key). */
app.get("/v1/kpi_registry", async (req, res) => {
  try {
    const scopeKey = (req.query.scope_key as string) || null;
    let q = "SELECT kpi_id, scope_key, name, unit, created_at FROM kpi_registry WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (scopeKey) { q += ` AND scope_key = $${i++}`; params.push(scopeKey); }
    q += " ORDER BY scope_key, name";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/kpi_registry — register a KPI. */
app.post("/v1/kpi_registry", async (req, res) => {
  try {
    const body = req.body as { scope_key?: string; name?: string; unit?: string };
    if (!body?.scope_key || !body?.name) return res.status(400).json({ error: "scope_key and name required" });
    const r = await pool.query(
      "INSERT INTO kpi_registry (scope_key, name, unit) VALUES ($1, $2, $3) RETURNING kpi_id, scope_key, name, unit, created_at",
      [body.scope_key, body.name, body.unit ?? null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/kpi_registry/:id/values — ingest a KPI value (metrics ingestion stub). Body: value, optional at (ISO), metadata_json. */
app.post("/v1/kpi_registry/:id/values", async (req, res) => {
  try {
    const kpiId = req.params.id;
    const body = req.body as { value?: number; at?: string; metadata_json?: Record<string, unknown> };
    if (typeof body?.value !== "number") return res.status(400).json({ error: "value (number) required" });
    const at = body.at ? new Date(body.at) : new Date();
    const r = await pool.query(
      "INSERT INTO kpi_values (kpi_id, value, at, metadata_json) VALUES ($1, $2, $3, $4) RETURNING value_id, kpi_id, value, at, created_at",
      [kpiId, body.value, at, body.metadata_json ? JSON.stringify(body.metadata_json) : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "23503") return res.status(404).json({ error: "KPI not found" });
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/kpi_registry/:id/values — list KPI values (query: limit, from, to). */
app.get("/v1/kpi_registry/:id/values", async (req, res) => {
  try {
    const kpiId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const from = (req.query.from as string) || null;
    const to = (req.query.to as string) || null;
    let q = "SELECT value_id, kpi_id, value, at, metadata_json, created_at FROM kpi_values WHERE kpi_id = $1";
    const params: unknown[] = [kpiId];
    let i = 2;
    if (from) { q += ` AND at >= $${i++}`; params.push(from); }
    if (to) { q += ` AND at <= $${i++}`; params.push(to); }
    q += ` ORDER BY at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/build_config_snapshots — list by service_id (optional limit). */
app.get("/v1/build_config_snapshots", async (req, res) => {
  try {
    const serviceId = (req.query.service_id as string) || null;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    let q = "SELECT snapshot_id, service_id, dependencies_json, externals_json, created_at FROM build_config_snapshots WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (serviceId) { q += ` AND service_id = $${i++}`; params.push(serviceId); }
    q += ` ORDER BY created_at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/build_config_snapshots — create snapshot (service_id, dependencies_json, externals_json). */
app.post("/v1/build_config_snapshots", async (req, res) => {
  try {
    const body = req.body as { service_id?: string; dependencies_json?: string[]; externals_json?: string[] };
    if (!body?.service_id) return res.status(400).json({ error: "service_id required" });
    const r = await pool.query(
      "INSERT INTO build_config_snapshots (service_id, dependencies_json, externals_json) VALUES ($1, $2, $3) RETURNING snapshot_id, service_id, dependencies_json, externals_json, created_at",
      [body.service_id, body.dependencies_json ? JSON.stringify(body.dependencies_json) : null, body.externals_json ? JSON.stringify(body.externals_json) : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/business_entity_types — list canonical entity types (Part L.1). */
app.get("/v1/business_entity_types", async (req, res) => {
  try {
    const r = await pool.query("SELECT entity_type_key, label, created_at FROM business_entity_types ORDER BY entity_type_key");
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/business_entities — list business entities (optional entity_type_key, scope_key). */
app.get("/v1/business_entities", async (req, res) => {
  try {
    const typeKey = (req.query.entity_type_key as string) || null;
    const scopeKey = (req.query.scope_key as string) || null;
    let q = "SELECT entity_id, entity_type_key, scope_key, external_ref, metadata_json, created_at, updated_at FROM business_entities WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (typeKey) { q += ` AND entity_type_key = $${i++}`; params.push(typeKey); }
    if (scopeKey) { q += ` AND scope_key = $${i++}`; params.push(scopeKey); }
    q += " ORDER BY entity_type_key, created_at DESC";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/business_entities — create a business entity (Part L.1). */
app.post("/v1/business_entities", async (req, res) => {
  try {
    const body = req.body as { entity_type_key?: string; scope_key?: string; external_ref?: string; metadata_json?: Record<string, unknown> };
    if (!body?.entity_type_key) return res.status(400).json({ error: "entity_type_key required" });
    const r = await pool.query(
      "INSERT INTO business_entities (entity_type_key, scope_key, external_ref, metadata_json) VALUES ($1, $2, $3, $4) RETURNING entity_id, entity_type_key, scope_key, external_ref, metadata_json, created_at, updated_at",
      [body.entity_type_key, body.scope_key ?? null, body.external_ref ?? null, body.metadata_json ? JSON.stringify(body.metadata_json) : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/source_mappings — list source mappings (optional source_system, canonical_entity_type, canonical_entity_id). */
app.get("/v1/source_mappings", async (req, res) => {
  try {
    const sourceSystem = (req.query.source_system as string) || null;
    const entityType = (req.query.canonical_entity_type as string) || null;
    const entityId = (req.query.canonical_entity_id as string) || null;
    let q = "SELECT mapping_id, source_system, external_id, canonical_entity_type, canonical_entity_id, metadata_json, created_at FROM source_mappings WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (sourceSystem) { q += ` AND source_system = $${i++}`; params.push(sourceSystem); }
    if (entityType) { q += ` AND canonical_entity_type = $${i++}`; params.push(entityType); }
    if (entityId) { q += ` AND canonical_entity_id = $${i++}`; params.push(entityId); }
    q += " ORDER BY created_at DESC";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/source_mappings — create source mapping (source_system, external_id, canonical_entity_type, canonical_entity_id). */
app.post("/v1/source_mappings", async (req, res) => {
  try {
    const body = req.body as { source_system?: string; external_id?: string; canonical_entity_type?: string; canonical_entity_id?: string; metadata_json?: Record<string, unknown> };
    if (!body?.source_system || !body?.external_id || !body?.canonical_entity_type || !body?.canonical_entity_id) {
      return res.status(400).json({ error: "source_system, external_id, canonical_entity_type, canonical_entity_id required" });
    }
    const r = await pool.query(
      "INSERT INTO source_mappings (source_system, external_id, canonical_entity_type, canonical_entity_id, metadata_json) VALUES ($1, $2, $3, $4, $5) RETURNING mapping_id, source_system, external_id, canonical_entity_type, canonical_entity_id, metadata_json, created_at",
      [body.source_system, body.external_id, body.canonical_entity_type, body.canonical_entity_id, body.metadata_json ? JSON.stringify(body.metadata_json) : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "23503") return res.status(400).json({ error: "canonical_entity_type or canonical_entity_id not found" });
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/business_events — list business events (optional event_type, from_entity_id, to_entity_id, limit). */
app.get("/v1/business_events", async (req, res) => {
  try {
    const eventType = (req.query.event_type as string) || null;
    const fromId = (req.query.from_entity_id as string) || null;
    const toId = (req.query.to_entity_id as string) || null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    let q = "SELECT event_id, event_type, from_entity_id, to_entity_id, payload_json, at, source_system, created_at FROM business_events WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (eventType) { q += ` AND event_type = $${i++}`; params.push(eventType); }
    if (fromId) { q += ` AND from_entity_id = $${i++}`; params.push(fromId); }
    if (toId) { q += ` AND to_entity_id = $${i++}`; params.push(toId); }
    q += ` ORDER BY at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/business_events — create business event (event_type, optional from_entity_id, to_entity_id, payload_json, source_system). */
app.post("/v1/business_events", async (req, res) => {
  try {
    const body = req.body as { event_type?: string; from_entity_id?: string; to_entity_id?: string; payload_json?: unknown; source_system?: string };
    if (!body?.event_type) return res.status(400).json({ error: "event_type required" });
    const r = await pool.query(
      "INSERT INTO business_events (event_type, from_entity_id, to_entity_id, payload_json, source_system) VALUES ($1, $2, $3, $4, $5) RETURNING event_id, event_type, from_entity_id, to_entity_id, payload_json, at, source_system, created_at",
      [body.event_type, body.from_entity_id ?? null, body.to_entity_id ?? null, body.payload_json ? JSON.stringify(body.payload_json) : null, body.source_system ?? null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "23503") return res.status(400).json({ error: "from_entity_id or to_entity_id not found" });
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/v1_slice/ingest — ingest campaign/lead/revenue event; resolve or create entity, create business_event (v1 slice adapter). */
app.post("/v1/v1_slice/ingest", async (req, res) => {
  try {
    const body = req.body as {
      event_type?: string;
      source_system?: string;
      entity_type_key?: string;
      external_id?: string;
      payload_json?: Record<string, unknown>;
      from_external_id?: string;
      from_entity_type_key?: string;
      to_external_id?: string;
      to_entity_type_key?: string;
    };
    if (!body?.event_type || !body?.source_system || !body?.entity_type_key || !body?.external_id) {
      return res.status(400).json({ error: "event_type, source_system, entity_type_key, external_id required" });
    }
    const result = await ingestV1SliceEvent(pool, {
      event_type: body.event_type,
      source_system: body.source_system,
      entity_type_key: body.entity_type_key,
      external_id: body.external_id,
      payload_json: body.payload_json,
      from_external_id: body.from_external_id,
      from_entity_type_key: body.from_entity_type_key,
      to_external_id: body.to_external_id,
      to_entity_type_key: body.to_entity_type_key,
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/v1_slice/funnel — funnel summary: campaign → lead → revenue counts and optional revenue total. */
app.get("/v1/v1_slice/funnel", async (_req, res) => {
  try {
    const summary = await getV1SliceFunnel(pool);
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/schema_drift — rpc_schema_drift. Query: environment_a (default current), environment_b (stored snapshot env). Returns current schema and optional diff vs stored snapshot. */
app.get("/v1/schema_drift", async (req, res) => {
  try {
    const environment_a = (req.query.environment_a as string) || "current";
    const environment_b = (req.query.environment_b as string) || null;
    const result = await getSchemaDrift(pool, environment_a, environment_b);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/schema_snapshots/capture — store current schema as snapshot for an environment (for schema_drift comparison). Body: environment. */
app.post("/v1/schema_snapshots/capture", async (req, res) => {
  try {
    const body = req.body as { environment?: string };
    if (!body?.environment) return res.status(400).json({ error: "environment required" });
    const shape = await getCurrentSchemaShape(pool);
    const r = await pool.query(
      "INSERT INTO schema_snapshots (environment, schema_json) VALUES ($1, $2) RETURNING schema_snapshot_id, environment, created_at",
      [body.environment, JSON.stringify(shape)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/contract_breakage_scan — rpc_contract_breakage_scan. Query: scope_key (optional). Returns plan_nodes that reference input_schema_ref or output_schema_ref (contracts at risk if schema changes). */
app.get("/v1/contract_breakage_scan", async (req, res) => {
  try {
    const scopeKey = (req.query.scope_key as string) || null;
    let q = `SELECT pn.id AS plan_node_id, pn.plan_id, pn.node_key, pn.job_type, pn.input_schema_ref, pn.output_schema_ref
             FROM plan_nodes pn WHERE (pn.input_schema_ref IS NOT NULL OR pn.output_schema_ref IS NOT NULL)`;
    const params: unknown[] = [];
    if (scopeKey) {
      q += ` AND pn.plan_id IN (SELECT id FROM plans WHERE initiative_id IN (SELECT id FROM initiatives WHERE intent_type = $1))`;
      params.push(scopeKey);
    }
    q += " ORDER BY pn.plan_id, pn.node_key";
    const r = await pool.query(q, params);
    res.json({ scope_key: scopeKey, contracts: r.rows, message: "Plan nodes with schema refs; review after schema changes." });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/change_events/:id/backfill_plan — rpc_generate_backfill_plan. Returns suggested backfill steps from change_event and optional graph_impacts. */
app.get("/v1/change_events/:id/backfill_plan", async (req, res) => {
  try {
    const id = req.params.id;
    const ev = await pool.query(
      "SELECT change_event_id, source_type, change_class, summary FROM change_events WHERE change_event_id = $1",
      [id]
    );
    if (ev.rows.length === 0) return res.status(404).json({ error: "Change event not found" });
    const event = ev.rows[0];
    const steps: { action: string; detail: string }[] = [];
    if (event.source_type === "migration" || event.change_class === "schema") {
      steps.push({ action: "review_schema", detail: "Run GET /v1/migration_audit and compare to pre-migration snapshot." });
      steps.push({ action: "backfill_if_not_null", detail: "If migration added NOT NULL columns without default, backfill existing rows before deploy." });
    }
    const impacts = await pool.query(
      "SELECT plan_id, plan_node_id, impact_type, reason FROM graph_impacts WHERE change_event_id = $1 LIMIT 50",
      [id]
    );
    if (impacts.rows.length > 0) {
      steps.push({
        action: "revalidate_affected",
        detail: `Re-run or validate ${impacts.rows.length} affected plan node(s) after backfill.`,
      });
    }
    res.json({ change_event_id: id, steps, summary: event.summary });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/validation_contracts — list validation contracts (Part L.5). */
app.get("/v1/validation_contracts", async (req, res) => {
  try {
    const actionKey = (req.query.action_key as string) || null;
    let q = "SELECT id, action_key, validation_strategy, success_criteria_json, rollback_strategy, rollback_trigger_conditions FROM validation_contracts WHERE 1=1";
    const params: unknown[] = [];
    if (actionKey) { q += " AND action_key = $1"; params.push(actionKey); }
    q += " ORDER BY action_key";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/policies/evaluate — evaluate whether an action is allowed / requires approval (Part L.4). */
app.post("/v1/policies/evaluate", async (req, res) => {
  try {
    const body = req.body as { action_key?: string; target_type?: string; risk_level?: string; context?: Record<string, unknown> };
    if (!body?.action_key) return res.status(400).json({ error: "action_key required" });
    const result = await evaluatePolicy(pool, {
      action_key: body.action_key,
      target_type: body.target_type ?? null,
      risk_level: body.risk_level ?? null,
      context: body.context,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/change_events — create a change event (migration, code_commit, config_edit). */
app.post("/v1/change_events", async (req, res) => {
  try {
    const body = req.body as { source_type?: string; source_ref?: string; change_class?: string; summary?: string; diff_artifact_id?: string };
    if (!body?.source_type || !body?.change_class) {
      return res.status(400).json({ error: "source_type and change_class required" });
    }
    const changeEventId = await createChangeEvent(pool, {
      source_type: body.source_type,
      source_ref: body.source_ref ?? null,
      change_class: body.change_class,
      summary: body.summary ?? null,
      diff_artifact_id: body.diff_artifact_id ?? null,
    });
    res.status(201).json({ change_event_id: changeEventId });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/change_events — list change events (optional limit/offset). */
app.get("/v1/change_events", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      `SELECT change_event_id, source_type, source_ref, change_class, summary, diff_artifact_id, created_at
       FROM change_events ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/change_events/:id — single change event. */
app.get("/v1/change_events/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT change_event_id, source_type, source_ref, change_class, summary, diff_artifact_id, created_at
       FROM change_events WHERE change_event_id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Change event not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/change_events/:id/impacts — list graph_impacts for a change event. */
app.get("/v1/change_events/:id/impacts", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT impact_id, change_event_id, run_id, plan_id, plan_node_id, artifact_id, impact_type, reason, created_at
       FROM graph_impacts WHERE change_event_id = $1 ORDER BY impact_type, plan_node_id`,
      [req.params.id]
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/change_events/:id/impact — compute and store graph_impacts for plan_id or run_id. */
app.post("/v1/change_events/:id/impact", async (req, res) => {
  try {
    const changeEventId = req.params.id;
    const body = req.body as { plan_id?: string; run_id?: string; replay_from_node_id?: string };
    const planId = body?.plan_id;
    const runId = body?.run_id;
    if (!planId && !runId) {
      return res.status(400).json({ error: "plan_id or run_id required" });
    }
    const opts = { replay_from_node_id: body?.replay_from_node_id ?? undefined };
    const impacts = runId
      ? await computeGraphImpactsForRun(pool, changeEventId, runId, opts)
      : await computeGraphImpactsForPlan(pool, changeEventId, planId!, { ...opts });
    res.json({ change_event_id: changeEventId, impacts });
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

/** POST /v1/pipelines/draft — generate a pipeline draft from prompt or intent_type (prompt-built pipelines). Uses pattern override if saved. Returns draft + lint. */
app.post("/v1/pipelines/draft", async (req, res) => {
  try {
    const body = (req.body as {
      prompt?: string;
      intent_type?: string;
      inputs?: Record<string, unknown>;
      compose_with?: string[];
    }) ?? {};
    const { generatePipelineDraft, classifyIntent } = await import("./prompt-to-pipeline.js");
    const { lintPipelineDraft } = await import("./pipeline-lint.js");
    const { getPatternOverride } = await import("./pipeline-pattern-overrides.js");
    const intentType = body.intent_type ?? (body.prompt ? classifyIntent(body.prompt) : "software");
    const override = await getPatternOverride(pool, intentType).catch(() => null);
    const draft = generatePipelineDraft({
      prompt: body.prompt,
      intent_type: body.intent_type,
      inputs: body.inputs,
      patternOverride: override ?? undefined,
      composeWith: body.compose_with,
    });
    const lint = lintPipelineDraft(draft);
    res.json({ draft, lint });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/pipelines/drafts — save a draft (V1.5). Body: { draft, name? }. Returns { id, draft_hash }. */
app.post("/v1/pipelines/drafts", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as { draft: PipelineDraftLike; name?: string };
    if (!body?.draft?.nodes || !Array.isArray(body.draft.nodes) || !body.draft.edges || !Array.isArray(body.draft.edges)) {
      return res.status(400).json({ error: "Body must include draft with nodes and edges arrays." });
    }
    const { saveDraft } = await import("./pipeline-drafts-db.js");
    const out = await saveDraft(pool, body.draft as import("./pipeline-draft.js").PipelineDraft, body.name);
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/pipelines/drafts — list saved drafts (V1.5). */
app.get("/v1/pipelines/drafts", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { listDrafts } = await import("./pipeline-drafts-db.js");
    const items = await listDrafts(pool, limit);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/pipelines/drafts/:id — load a saved draft (V1.5). Returns draft + lint for UI. */
app.get("/v1/pipelines/drafts/:id", async (req, res) => {
  try {
    const { getDraft } = await import("./pipeline-drafts-db.js");
    const { lintPipelineDraft } = await import("./pipeline-lint.js");
    const row = await getDraft(pool, req.params.id);
    if (!row) return res.status(404).json({ error: "Draft not found" });
    const lint = lintPipelineDraft(row.draft);
    res.json({ draft: row.draft, name: row.name, lint });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/pipelines/templates — save draft as pattern override (V2). Body: { pattern_key, draft }. */
app.post("/v1/pipelines/templates", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as { pattern_key: string; draft: { nodes: unknown[]; edges: unknown[]; requiredInputs?: string[] } };
    if (!body?.pattern_key?.trim() || !body?.draft?.nodes || !Array.isArray(body.draft.nodes) || !body.draft.edges || !Array.isArray(body.draft.edges)) {
      return res.status(400).json({ error: "Body must include pattern_key and draft with nodes and edges arrays." });
    }
    const { setPatternOverride } = await import("./pipeline-pattern-overrides.js");
    await setPatternOverride(pool, body.pattern_key.trim(), {
      nodes: body.draft.nodes as import("./pipeline-draft.js").PipelineDraftNode[],
      edges: body.draft.edges as import("./pipeline-draft.js").PipelineDraftEdge[],
      required_inputs: body.draft.requiredInputs ?? [],
    });
    res.status(201).json({ ok: true, pattern_key: body.pattern_key.trim() });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/pipelines/drafts/compose — merge two drafts or two pattern keys into one draft (V2). Body: { draft_ids?: [id1, id2], pattern_keys?: [key1, key2] }. */
app.post("/v1/pipelines/drafts/compose", async (req, res) => {
  try {
    const body = req.body as { draft_ids?: string[]; pattern_keys?: string[] };
    const { composePatterns, generatePipelineDraft } = await import("./prompt-to-pipeline.js");
    const { lintPipelineDraft } = await import("./pipeline-lint.js");
    const { getDraft } = await import("./pipeline-drafts-db.js");
    const { getPattern } = await import("./pipeline-patterns.js");

    if (body.draft_ids && body.draft_ids.length >= 2) {
      const drafts = await Promise.all(body.draft_ids.slice(0, 2).map((id) => getDraft(pool, id)));
      if (drafts.some((d) => !d)) return res.status(404).json({ error: "One or more draft IDs not found" });
      const shapes = (drafts as { draft: import("./pipeline-draft.js").PipelineDraft }[]).map((d) => ({ nodes: d.draft.nodes, edges: d.draft.edges }));
      const composed = composePatterns(shapes);
      const draft: import("./pipeline-draft.js").PipelineDraft = {
        intentType: "composed",
        summary: `Composed from ${body.draft_ids.length} drafts`,
        inputs: {},
        nodes: composed.nodes,
        edges: composed.edges,
        modulesUsed: (drafts as { draft: import("./pipeline-draft.js").PipelineDraft }[]).flatMap((d) => d.draft.modulesUsed ?? [d.draft.intentType]),
      };
      const lint = lintPipelineDraft(draft);
      return res.json({ draft, lint });
    }
    if (body.pattern_keys && body.pattern_keys.length >= 2) {
      const patterns = body.pattern_keys.slice(0, 2).map((k) => getPattern(k)).filter(Boolean);
      if (patterns.length < 2) return res.status(400).json({ error: "At least two valid pattern_keys required" });
      const composed = composePatterns(patterns.map((p) => ({ nodes: p!.nodes, edges: p!.edges })));
      const draft = generatePipelineDraft({
        intent_type: "composed",
        patternOverride: { nodes: composed.nodes, edges: composed.edges, required_inputs: [] },
        composeWith: [],
      });
      draft.modulesUsed = body.pattern_keys.slice(0, 2);
      const lint = lintPipelineDraft(draft);
      return res.json({ draft, lint });
    }
    return res.status(400).json({ error: "Body must include draft_ids (array of 2) or pattern_keys (array of 2)" });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

type PipelineDraftLike = import("./pipeline-draft.js").PipelineDraft;

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

/** POST /v1/initiatives/:id/plan/from-draft — compile a plan from a pipeline draft (prompt-built pipelines). Body: { draft }. */
app.post("/v1/initiatives/:id/plan/from-draft", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const initiativeId = req.params.id;
    const body = req.body as { draft: { nodes: { node_key: string; job_type: string; node_type?: string; agent_role?: string; consumes_artifact_types?: string[] }[]; edges: { from_key: string; to_key: string; condition?: string }[]; summary?: string }; force?: boolean };
    if (!body?.draft?.nodes || !Array.isArray(body.draft.nodes) || !body.draft.edges || !Array.isArray(body.draft.edges)) {
      return res.status(400).json({ error: "Body must include draft with nodes and edges arrays." });
    }
    const { compilePlanFromDraft } = await import("./plan-compiler.js");
    const compiled = await withTransaction((client) =>
      compilePlanFromDraft(client, initiativeId, body.draft as Parameters<typeof compilePlanFromDraft>[2], { force: body.force })
    );
    res.status(201).json({
      id: compiled.planId,
      initiative_id: initiativeId,
      status: "draft",
      nodes: compiled.nodeIds.size,
      plan_hash: compiled.planHash,
    });
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
      if (intentType === "email_design_generator" && templateId) {
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

/** POST /v1/runs/:id/rerun — create a new run with the same plan (Operator+). Policy-gated. */
app.post("/v1/runs/:id/rerun", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const runId = req.params.id;
    const body = req.body as { approved_by?: string };
    const actionRow = await pool.query<{ risk_level: string }>("SELECT risk_level FROM action_registry WHERE action_key = $1", ["rerun_pipeline"]).then((r) => r.rows[0]);
    const policyResult = await evaluatePolicy(pool, { action_key: "rerun_pipeline", target_type: "run", risk_level: actionRow?.risk_level ?? "low", context: { run_id: runId } });
    if (!policyResult.allowed) {
      return res.status(403).json({ error: "Policy denies this action", reason: policyResult.reason });
    }
    if (policyResult.require_approval && !body?.approved_by) {
      return res.status(403).json({ error: "Approval required for rerun", reason: policyResult.reason, require_approval: true });
    }
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
        const { getArtifactSignedUrl } = await import("./artifact-storage.js");
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
    const row = r.rows[0] as { artifact_type: string; metadata_json: { content?: string; index_html?: string } | null; uri?: string };
    let content: string | null = row.metadata_json?.content ?? row.metadata_json?.index_html ?? null;
    if (content == null && row.uri?.startsWith("supabase-storage://")) {
      try {
        const { downloadArtifact } = await import("./artifact-storage.js");
        content = await downloadArtifact(row.uri);
      } catch { /* storage not configured */ }
    }
    if (content == null) return res.status(404).send("Artifact content not available");
    const isHtml = row.artifact_type === "landing_page" || row.artifact_type === "email_template" || row.artifact_type === "launch_artifact";
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
        const { downloadArtifact } = await import("./artifact-storage.js");
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
      for (const key of Object.keys(body.metadata)) {
        if (!ARTIFACT_METADATA_JSON_ALLOWLIST.has(key)) {
          console.warn(
            `[PATCH artifact] metadata key "${key}" is not in the documented allowlist (content, mjml, error_signature, type). See docs/SCHEMA_JSON_GUARDRAILS.md.`,
            { artifact_id: req.params.id }
          );
        }
      }
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

/** ————— Launch Kernel V1 ————— */

/** POST /v1/build_specs — create BuildSpec (initiative_id, spec). Optional body.extended=true for extended BuildSpec. */
app.post("/v1/build_specs", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as { initiative_id?: string; spec?: unknown; extended?: boolean };
    if (!body?.initiative_id) return res.status(400).json({ error: "initiative_id required" });
    const { validateBuildSpecV1, validateBuildSpecExtended } = await import("./launch/build-spec.js");
    const validated = body.extended ? validateBuildSpecExtended(body.spec) : validateBuildSpecV1(body.spec);
    if (!validated.ok) return res.status(400).json({ error: validated.reason });
    const specToStore = validated.spec;
    const { createBuildSpec, createLaunch } = await import("./launch/launch-db.js");
    const initiativeId = body.initiative_id;
    const { build_spec_id: buildSpecId, launch_id: launchId } = await withTransaction(async (client) => {
      const specId = await createBuildSpec(client, initiativeId, specToStore as import("./launch/build-spec.js").BuildSpecV1);
      const lId = await createLaunch(client, initiativeId, specId);
      return { build_spec_id: specId, launch_id: lId };
    });
    const launch = await pool.query("SELECT * FROM launches WHERE id = $1", [launchId]);
    res.status(201).json({ build_spec_id: buildSpecId, launch_id: launchId, launch: launch.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/build_specs/from_strategy — create BuildSpec from strategy doc (markdown or YAML). Body: initiative_id, strategy_doc. */
app.post("/v1/build_specs/from_strategy", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const body = req.body as { initiative_id?: string; strategy_doc?: string };
    if (!body?.initiative_id || typeof body?.strategy_doc !== "string") return res.status(400).json({ error: "initiative_id and strategy_doc required" });
    const { parseStrategyDoc } = await import("./launch/strategy-doc-parser.js");
    const parsed = parseStrategyDoc(body.strategy_doc);
    if (!parsed.ok) return res.status(400).json({ error: parsed.reason });
    const { createBuildSpec, createLaunch } = await import("./launch/launch-db.js");
    const initiativeId = body.initiative_id;
    const { build_spec_id: buildSpecId, launch_id: launchId } = await withTransaction(async (client) => {
      const specId = await createBuildSpec(client, initiativeId, parsed.spec);
      const lId = await createLaunch(client, initiativeId, specId);
      return { build_spec_id: specId, launch_id: lId };
    });
    const launch = await pool.query("SELECT * FROM launches WHERE id = $1", [launchId]);
    res.status(201).json({ build_spec_id: buildSpecId, launch_id: launchId, launch: launch.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/build_specs — list by initiative_id. */
app.get("/v1/build_specs", async (req, res) => {
  try {
    const initiative_id = req.query.initiative_id as string | undefined;
    if (!initiative_id) return res.status(400).json({ error: "initiative_id required" });
    const r = await pool.query("SELECT * FROM build_specs WHERE initiative_id = $1 ORDER BY created_at DESC", [initiative_id]);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/build_specs/:id — single build spec. */
app.get("/v1/build_specs/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM build_specs WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Build spec not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/launches — list launches; optional initiative_id to filter. */
app.get("/v1/launches", async (req, res) => {
  try {
    const initiative_id = req.query.initiative_id as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const r = initiative_id
      ? await pool.query("SELECT * FROM launches WHERE initiative_id = $1 ORDER BY created_at DESC LIMIT $2", [initiative_id, limit])
      : await pool.query("SELECT * FROM launches ORDER BY created_at DESC LIMIT $1", [limit]);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/launches/:id — launch state. */
app.get("/v1/launches/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM launches WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Launch not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/launches/actions/:action — execute launch action (deploy.preview, domain.attach_subdomain, etc.). Body: action inputs. */
app.post("/v1/launches/actions/:action", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const action = req.params.action as string;
    const { LAUNCH_ACTIONS } = await import("./launch/action-contract.js");
    if (!LAUNCH_ACTIONS.includes(action as never)) return res.status(400).json({ error: "Invalid action" });
    const inputs = req.body && typeof req.body === "object" ? req.body : {};
    const { executeLaunchAction } = await import("./launch/action-registry.js");
    const result = await withTransaction((client) => executeLaunchAction(client, action as never, inputs));
    if (!result.ok) {
      const status = result.failure_class === "missing_env" ? 400 : 500;
      return res.status(status).json({ error: result.error, failure_class: result.failure_class });
    }
    res.json(result.result);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/launches/:id/validate — run launch validator (technical + content). */
app.post("/v1/launches/:id/validate", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const launchId = req.params.id;
    const launchRow = await pool.query("SELECT * FROM launches WHERE id = $1", [launchId]);
    if (launchRow.rows.length === 0) return res.status(404).json({ error: "Launch not found" });
    const launch = launchRow.rows[0] as { deploy_url?: string; domain?: string; build_spec_id?: string | null; artifact_id?: string | null };
    const deployUrl = launch.deploy_url;
    if (!deployUrl) return res.status(400).json({ error: "Launch has no deploy_url" });
    const buildSpecId = launch.build_spec_id;
    if (!buildSpecId) return res.status(400).json({ error: "Launch has no build_spec_id" });
    const buildSpecRow = await pool.query("SELECT spec_json FROM build_specs WHERE id = $1", [buildSpecId]);
    if (buildSpecRow.rows.length === 0) return res.status(400).json({ error: "BuildSpec not found" });
    const buildSpec = buildSpecRow.rows[0].spec_json as import("./launch/build-spec.js").BuildSpecV1;
    let html = "";
    if (launch.artifact_id) {
      const art = await pool.query("SELECT metadata_json FROM artifacts WHERE id = $1", [launch.artifact_id]);
      if (art.rows[0]?.metadata_json && typeof art.rows[0].metadata_json === "object") {
        const meta = art.rows[0].metadata_json as Record<string, unknown>;
        html = (meta.index_html as string) ?? (meta.content as string) ?? "";
      }
    }
    const { runLaunchValidation } = await import("./launch/launch-validator.js");
    const validation = await withTransaction((client) =>
      runLaunchValidation(client, launchId, deployUrl, buildSpec, html, launch.domain)
    );
    res.json(validation);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/klaviyo/templates — create or update Klaviyo template from artifact. Body: brand_profile_id, artifact_id (or html + name). */
app.post("/v1/klaviyo/templates", async (req, res) => {
  try {
    const body = req.body as { brand_profile_id?: string; artifact_id?: string; html?: string; name?: string };
    if (!body?.brand_profile_id) return res.status(400).json({ error: "brand_profile_id required" });
    const creds = await getKlaviyoCredentials(pool, body.brand_profile_id);
    let html: string;
    let name: string;
    let artifact_id: string | null = null;
    if (body.artifact_id) {
      const sendReady = await buildSendReadyEmail(pool, {
        artifact_id: body.artifact_id,
        subject: "Email",
        from_name: "Sender",
        from_email: "noreply@example.com",
        brand_profile_id: body.brand_profile_id,
      });
      html = sendReady.html;
      name = `Template ${body.artifact_id.slice(0, 8)}`;
      artifact_id = body.artifact_id;
    } else if (body.html && body.name) {
      html = body.html;
      name = body.name;
    } else {
      return res.status(400).json({ error: "artifact_id or (html + name) required" });
    }
    const existing = await pool.query<{ klaviyo_template_id: string }>(
      "SELECT klaviyo_template_id FROM klaviyo_template_sync WHERE brand_profile_id = $1 AND artifact_id = $2 LIMIT 1",
      [body.brand_profile_id, artifact_id ?? null]
    ).then((r) => r.rows[0]);
    let templateId: string;
    if (existing?.klaviyo_template_id) {
      await updateTemplate({ apiKey: creds.api_key, templateId: existing.klaviyo_template_id, template: { name, html } });
      templateId = existing.klaviyo_template_id;
    } else {
      templateId = await createTemplate({ apiKey: creds.api_key, template: { name, html } });
      if (artifact_id) {
        await pool.query(
          "INSERT INTO klaviyo_template_sync (brand_profile_id, artifact_id, klaviyo_template_id, sync_state, last_synced_at, updated_at) VALUES ($1, $2, $3, 'synced', now(), now()) ON CONFLICT (brand_profile_id, artifact_id) DO UPDATE SET klaviyo_template_id = EXCLUDED.klaviyo_template_id, sync_state = 'synced', last_synced_at = now(), updated_at = now()",
          [body.brand_profile_id, artifact_id, templateId]
        );
      }
    }
    res.status(201).json({ template_id: templateId });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("not configured") || msg.includes("not found")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

/** GET /v1/klaviyo/templates — list template sync status (brand_profile_id optional filter). */
app.get("/v1/klaviyo/templates", async (req, res) => {
  try {
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    let q = "SELECT id, brand_profile_id, artifact_id, klaviyo_template_id, sync_state, last_synced_at, last_error, created_at FROM klaviyo_template_sync WHERE 1=1";
    const params: unknown[] = [];
    if (brand_profile_id) { q += " AND brand_profile_id = $1"; params.push(brand_profile_id); }
    q += " ORDER BY created_at DESC LIMIT 100";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/klaviyo/campaigns/push — run campaign pipeline: artifact → template → campaign → optional schedule. Body: initiative_id or (run_id + artifact_id), optional schedule_at, optional audience_list_ids. */
app.post("/v1/klaviyo/campaigns/push", async (req, res) => {
  try {
    const body = req.body as { initiative_id?: string; run_id?: string; artifact_id?: string; schedule_at?: string; audience_list_ids?: string[] };
    const initiative_id = body?.initiative_id;
    const run_id = body?.run_id;
    const artifact_id = body?.artifact_id;
    if (!artifact_id) return res.status(400).json({ error: "artifact_id required" });
    if (!initiative_id && !run_id) return res.status(400).json({ error: "initiative_id or run_id required" });
    const result = await runKlaviyoCampaignPipeline({
      pool,
      initiative_id,
      run_id,
      artifact_id,
      schedule_at: body?.schedule_at,
      audience_list_ids: body?.audience_list_ids,
    });
    res.status(201).json(result);
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("not configured") || msg.includes("not found")) return res.status(404).json({ error: msg });
    if (msg.includes("Audience required")) return res.status(400).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

/** GET /v1/klaviyo/campaigns — list campaign push status (brand_profile_id optional). */
app.get("/v1/klaviyo/campaigns", async (req, res) => {
  try {
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    let q = "SELECT id, initiative_id, run_id, artifact_id, brand_profile_id, klaviyo_campaign_id, send_job_id, sync_state, scheduled_at, last_synced_at, last_error, created_at FROM klaviyo_sent_campaigns WHERE 1=1";
    const params: unknown[] = [];
    if (brand_profile_id) { q += " AND brand_profile_id = $1"; params.push(brand_profile_id); }
    q += " ORDER BY created_at DESC LIMIT 100";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/klaviyo/flows — create flow draft. Body: brand_profile_id, flow_type, optional flow_name, template_ids, delays_minutes. */
app.post("/v1/klaviyo/flows", async (req, res) => {
  try {
    const body = req.body as { brand_profile_id?: string; flow_type?: string; flow_name?: string; template_ids?: string[]; delays_minutes?: number[] };
    if (!body?.brand_profile_id || !body?.flow_type) return res.status(400).json({ error: "brand_profile_id and flow_type required" });
    const result = await runKlaviyoFlowPipeline({
      pool,
      brand_profile_id: body.brand_profile_id,
      flow_type: body.flow_type,
      flow_name: body.flow_name,
      template_ids: body.template_ids,
      delays_minutes: body.delays_minutes,
    });
    res.status(201).json(result);
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("not configured") || msg.includes("not found")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

/** PATCH /v1/klaviyo/flows/:id/status — set flow status (draft | manual | live). High-risk for live; approved_by recommended. */
app.patch("/v1/klaviyo/flows/:id/status", async (req, res) => {
  try {
    const flowId = req.params.id;
    const body = req.body as { status?: string; brand_profile_id?: string; approved_by?: string };
    const status = body?.status as "draft" | "manual" | "live" | undefined;
    if (!status || !["draft", "manual", "live"].includes(status)) return res.status(400).json({ error: "status required: draft, manual, or live" });
    const brand_profile_id = body?.brand_profile_id ?? await pool.query<{ brand_profile_id: string }>("SELECT brand_profile_id FROM klaviyo_flow_sync WHERE klaviyo_flow_id = $1 LIMIT 1", [flowId]).then((r) => r.rows[0]?.brand_profile_id);
    if (!brand_profile_id) return res.status(400).json({ error: "brand_profile_id required or flow not found in sync table" });
    const result = await setKlaviyoFlowStatus({ pool, brand_profile_id, flow_id: flowId, status, approved_by: body?.approved_by });
    res.json(result);
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("not configured") || msg.includes("not found")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

/** GET /v1/klaviyo/flows — list flow sync status (brand_profile_id optional). */
app.get("/v1/klaviyo/flows", async (req, res) => {
  try {
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    let q = "SELECT id, brand_profile_id, flow_type, klaviyo_flow_id, sync_state, last_synced_at, last_remote_status, last_error, created_at FROM klaviyo_flow_sync WHERE 1=1";
    const params: unknown[] = [];
    if (brand_profile_id) { q += " AND brand_profile_id = $1"; params.push(brand_profile_id); }
    q += " ORDER BY created_at DESC LIMIT 100";
    const r = await pool.query(q, params);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/klaviyo/performance/ingest — record campaign/flow message performance (Track C read-only ingestion). Body: brand_profile_id, entity_type, entity_id, opens?, clicks?, revenue_cents?, sent_at?. */
app.post("/v1/klaviyo/performance/ingest", async (req, res) => {
  try {
    const body = req.body as { brand_profile_id?: string; entity_type?: string; entity_id?: string; opens?: number; clicks?: number; revenue_cents?: number; sent_at?: string };
    if (!body?.brand_profile_id || !body?.entity_type || !body?.entity_id) return res.status(400).json({ error: "brand_profile_id, entity_type, entity_id required" });
    await pool.query(
      `INSERT INTO klaviyo_performance_snapshots (brand_profile_id, entity_type, entity_id, opens, clicks, revenue_cents, sent_at) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
      [body.brand_profile_id, body.entity_type, body.entity_id, body.opens ?? 0, body.clicks ?? 0, body.revenue_cents ?? 0, body.sent_at ?? null]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/klaviyo/recommendations — recommendations only (no auto-edit). Identifies weak templates/messages from performance data. */
app.get("/v1/klaviyo/recommendations", async (req, res) => {
  try {
    const brand_profile_id = req.query.brand_profile_id as string | undefined;
    let q = `SELECT entity_type, entity_id, opens, clicks, revenue_cents, sent_at, snapshot_at
             FROM klaviyo_performance_snapshots WHERE 1=1`;
    const params: unknown[] = [];
    if (brand_profile_id) { q += " AND brand_profile_id = $1"; params.push(brand_profile_id); }
    q += " ORDER BY snapshot_at DESC LIMIT 500";
    const rows = await pool.query(q, params).then((r) => r.rows as { entity_type: string; entity_id: string; opens: number; clicks: number; revenue_cents: number; sent_at: string | null }[]);
    const recommendations: { type: string; entity_id: string; reason: string; action: string }[] = [];
    for (const row of rows) {
      const clickRate = row.opens ? row.clicks / row.opens : 0;
      if (row.opens > 20 && clickRate < 0.02) recommendations.push({ type: row.entity_type, entity_id: row.entity_id, reason: "Low click rate", action: "Consider CTA or content" });
      if (row.revenue_cents === 0 && row.opens > 50) recommendations.push({ type: row.entity_type, entity_id: row.entity_id, reason: "No revenue", action: "Review offer or audience" });
    }
    res.json({ items: recommendations.slice(0, 50) });
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

/** GET /v1/brand_profiles/:id/usage — telemetry for "where these tokens are used" (Phase 4). */
app.get("/v1/brand_profiles/:id/usage", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
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
});

/** PUT /v1/brand_profiles/:id */
app.put("/v1/brand_profiles/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
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

/** DELETE /v1/brand_profiles/:id — soft delete (default) or permanent delete (?permanent=true) */
app.delete("/v1/brand_profiles/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
    const permanent = req.query.permanent === "true" || req.query.permanent === "1";
    if (permanent) {
      const r = await pool.query("DELETE FROM brand_profiles WHERE id = $1 RETURNING id", [id]);
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json({ id: r.rows[0].id, deleted: true });
    } else {
      const r = await pool.query(
        "UPDATE brand_profiles SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id, status",
        [id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(r.rows[0]);
    }
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

/** Build a placeholder map from a brand profile row for substituting [key] in MJML and {{key}} in HTML (e.g. landing footer). */
function brandPlaceholderMap(brandRow: Record<string, unknown>): Record<string, string> {
  const name = typeof brandRow.name === "string" ? brandRow.name : "Brand";
  const identity = (brandRow.identity as Record<string, unknown>) ?? {};
  const design_tokens = (brandRow.design_tokens as Record<string, unknown>) ?? {};
  const website = typeof identity.website === "string" ? identity.website : "https://example.com";
  const baseUrl = website.replace(/\/$/, "");
  const contactEmail = typeof identity.contact_email === "string" ? identity.contact_email : "";
  const tagline = typeof identity.tagline === "string" ? identity.tagline : "";
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
  const year = String(new Date().getFullYear());

  const socialMedia = Array.isArray(design_tokens.social_media) ? design_tokens.social_media as Array<{ name?: string; url?: string }> : [];
  const socialByKey: Record<string, string> = {};
  for (const s of socialMedia) {
    const n = (s.name ?? "").toLowerCase();
    const u = typeof s.url === "string" ? s.url : "";
    if (n.includes("instagram")) socialByKey.instagramUrl = u;
    else if (n.includes("tiktok")) socialByKey.tiktokUrl = u;
    else if (n.includes("twitter") || n === "x") socialByKey.twitterUrl = u;
    else if (n.includes("facebook")) socialByKey.facebookUrl = u;
    else if (n.includes("youtube")) socialByKey.youtubeUrl = u;
  }
  if (!socialByKey.instagramUrl) socialByKey.instagramUrl = website;
  if (!socialByKey.tiktokUrl) socialByKey.tiktokUrl = website;
  if (!socialByKey.twitterUrl) socialByKey.twitterUrl = website;
  if (!socialByKey.facebookUrl) socialByKey.facebookUrl = website;
  if (!socialByKey.youtubeUrl) socialByKey.youtubeUrl = website;

  const disclaimerText = typeof identity.disclaimer_text === "string" ? identity.disclaimer_text : "By signing up you agree to our";

  const footerUrls = design_tokens.footer_urls && typeof design_tokens.footer_urls === "object"
    ? (design_tokens.footer_urls as Record<string, string>)
    : {};
  const gradientsList = Array.isArray(design_tokens.gradients) ? design_tokens.gradients : [];
  const gradientCssList: string[] = [];
  for (const g of gradientsList) {
    if (g && typeof g === "object" && (g as Record<string, unknown>).type === "linear" && Array.isArray((g as Record<string, unknown>).stops)) {
      const stops = ((g as Record<string, unknown>).stops as string[]).filter((s) => typeof s === "string" && (s as string).trim());
      if (stops.length >= 2)
        gradientCssList.push(`linear-gradient(135deg, ${stops.join(", ")})`);
    }
  }
  const typo = design_tokens.typography as Record<string, unknown> | undefined;
  const fonts = typo?.fonts as Record<string, string> | undefined;
  const fontHeadings = typeof fonts?.heading === "string" ? fonts.heading : (typeof typo?.font_headings === "string" ? typo.font_headings : (typeof design_tokens.font_headings === "string" ? design_tokens.font_headings : ""));
  const fontBody = typeof fonts?.body === "string" ? fonts.body : (typeof typo?.font_body === "string" ? typo.font_body : (typeof design_tokens.font_body === "string" ? design_tokens.font_body : ""));
  const fontFamily = (fontHeadings || fontBody || "system-ui").includes(" ") ? `"${fontHeadings || fontBody || "system-ui"}"` : (fontHeadings || fontBody || "system-ui");
  const logoPharmacyText = typeof design_tokens.logo_pharmacy_text === "string"
    ? design_tokens.logo_pharmacy_text
    : (typeof identity.logo_pharmacy_text === "string" ? identity.logo_pharmacy_text : (name.split(/\s+/)[0] ?? "Brand"));
  const logoTimeText = typeof design_tokens.logo_time_text === "string"
    ? design_tokens.logo_time_text
    : (typeof identity.logo_time_text === "string" ? identity.logo_time_text : (name.split(/\s+/).slice(1).join(" ").trim() || ""));
  const headingHighlightColor =
    (typeof design_tokens.heading_highlight_color === "string" && design_tokens.heading_highlight_color.trim())
      ? design_tokens.heading_highlight_color.trim()
      : (brand && typeof (brand as Record<string, string>)["400"] === "string"
        ? (brand as Record<string, string>)["400"]
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
  const result: Record<string, string> = { ...base };
  for (const [k, v] of Object.entries(footerUrls)) {
    if (typeof v === "string" && v.trim()) result[k] = v.trim();
  }
  gradientCssList.forEach((css, i) => {
    result[`gradient_${i}`] = css;
    if (i === 0) result.gradientContainer1 = css;
    if (i === 1) result.gradientContainer2 = css;
  });
  gradientsList.forEach((g, i) => {
    if (gradientCssList[i] && g && typeof g === "object" && typeof (g as Record<string, string>).name === "string") {
      const name = String((g as Record<string, string>).name).trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "") || `gradient_${i}`;
      if (name) result[`gradient_${name}`] = gradientCssList[i];
    }
  });
  return result;
}

/** Substitute [placeholder] in mjml with values from map; leave unknown placeholders as-is. */
function substitutePlaceholders(mjml: string, map: Record<string, string>): string {
  return mjml.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    const k = key.trim();
    return k in map ? map[k] : `[${key}]`;
  });
}

/** Substitute {{placeholder}} in HTML (e.g. landing footer) with values from map; leave unknown as-is. */
function substitutePlaceholdersDoubleCurly(html: string, map: Record<string, string>): string {
  return html.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();
    return k in map ? map[k] : `{{${key}}}`;
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

/** GET /v1/email_component_library/assembled?ids=uuid1,uuid2,...&format=html&brand_profile_id=uuid — wrap fragments, optional brand substitution, return MJML or HTML. When a single id has html_fragment and use_context=landing_page, returns substituted HTML. */
app.get("/v1/email_component_library/assembled", async (req, res) => {
  try {
    const idsParam = (req.query.ids as string) ?? "";
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ error: "ids query required (comma-separated UUIDs)" });
    for (const id of ids) {
      if (!isValidUuid(id)) return res.status(400).json({ error: `Invalid UUID: ${id}` });
    }
    const r = await pool.query(
      `SELECT id, mjml_fragment, html_fragment, use_context, position FROM email_component_library WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)`,
      [ids]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "No components found" });
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
      mjml_fragment?: string | null;
      html_fragment?: string | null;
      placeholder_docs?: unknown;
      position?: number;
      use_context?: string;
    };
    if (!body.component_type?.trim() || !body.name?.trim())
      return res.status(400).json({ error: "component_type and name required" });
    const hasMjml = body.mjml_fragment != null && String(body.mjml_fragment).trim() !== "";
    const hasHtml = body.html_fragment != null && String(body.html_fragment).trim() !== "";
    if (!hasMjml && !hasHtml)
      return res.status(400).json({ error: "At least one of mjml_fragment or html_fragment required (use html_fragment for landing_page e.g. WordPress/PHP footer)" });
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
});

/** PATCH /v1/email_component_library/:id */
app.patch("/v1/email_component_library/:id", async (req, res) => {
  try {
    const role = getRole(req);
    if (role === "viewer") return res.status(403).json({ error: "Forbidden" });
    const id = req.params.id;
    if (!isValidUuid(id)) return res.status(400).json({ error: "Invalid UUID" });
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
