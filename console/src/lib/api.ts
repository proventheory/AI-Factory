/**
 * Control Plane API client. Use with React Query hooks.
 */
const API_DIRECT = (process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001").replace(/\/$/, "");

/**
 * When the console runs on Vercel (or any non-localhost host), call the API through Next.js
 * `rewrites` at `/api/control-plane/*` so the browser only talks same-origin (see console/next.config.js).
 * Local dev keeps using NEXT_PUBLIC_CONTROL_PLANE_API directly (e.g. http://localhost:3001).
 */
export function controlPlaneApiBase(): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") {
      return `${window.location.origin}/api/control-plane`;
    }
  }
  return API_DIRECT;
}

/** Response shape from Control Plane `GET /health` (capabilities added for Shopify shpat_ support). */
export type ControlPlaneHealth = {
  status?: string;
  service?: string;
  capabilities?: { shopify_brand_admin_token?: boolean };
};

/** Lightweight probe; use to warn if the console points at an old API build. */
export async function getControlPlaneHealth(): Promise<ControlPlaneHealth | null> {
  try {
    const res = await fetch(`${controlPlaneApiBase()}/health`, { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as ControlPlaneHealth;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

/** `null` = could not load /health (network/CORS); do not treat as “too old”. */
export function controlPlaneSupportsShopifyAdminToken(health: ControlPlaneHealth | null): boolean | null {
  if (health == null) return null;
  return health.capabilities?.shopify_brand_admin_token === true;
}

/** User-friendly message when Control Plane is unreachable (e.g. wrong API URL on Vercel). */
export function formatApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /ROUTER_EXTERNAL_TARGET_ERROR|EXTERNAL_TARGET/i.test(msg) ||
    /An error occurred with this application/i.test(msg)
  ) {
    return (
      "Vercel could not reach your Control Plane URL (proxy/rewrite to Render failed). " +
      "In Vercel → Project → Settings → Environment Variables: set NEXT_PUBLIC_CONTROL_PLANE_API to your API base (e.g. https://ai-factory-api-staging.onrender.com) with no path suffix, redeploy the console, and confirm the API responds at …/health. " +
      "If the API was asleep, wake it with a browser visit then retry the crawl. " +
      "Hobby plans have short serverless limits; very long crawls may need a Pro-tier maxDuration or calling the Control Plane from a network that allows long requests."
    );
  }
  if (msg.includes("ENETUNREACH") || msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "Cannot reach the Control Plane API. On Vercel, set NEXT_PUBLIC_CONTROL_PLANE_API or CONTROL_PLANE_PROXY_URL to your Control Plane HTTPS origin (no trailing slash) and redeploy. The console proxies the browser via /api/control-plane (build-time rewrite or runtime route). For local dev, run the control plane and keep the default http://localhost:3001 or match it in .env.local.";
  }
  if (msg.includes("Control Plane proxy is not configured") || msg.includes("proxy is not configured")) {
    return msg;
  }
  if (msg.includes("404") || msg.includes("Not Found")) {
    if (/crawl_execute|\/v1\/runs|\/v1\/wp-shopify/i.test(msg)) {
      return `${msg} If this is a deployed console, confirm NEXT_PUBLIC_CONTROL_PLANE_API or CONTROL_PLANE_PROXY_URL is set and the Control Plane build includes the route you are calling (e.g. POST /v1/wp-shopify-migration/crawl_execute).`;
    }
    return "The requested resource was not found.";
  }
  if (msg.includes("Database schema not applied") || (msg.includes("relation ") && msg.includes(" does not exist"))) {
    return "Control Plane database schema is missing. Run migrations against the same DB the API uses (see docs/runbooks/console-db-relation-does-not-exist.md).";
  }
  if (/deadlock/i.test(msg)) {
    return "Database briefly deadlocked (usually concurrent wizard actions). Retry once; if it persists, wait a few seconds and try again.";
  }
  if (msg.includes("did not finish within") || msg.includes("Timed out polling")) {
    return `${msg} If status stays “running”, check Render ai-factory-runner-staging is deployed and healthy; crawl jobs only finish when a worker claims the job.`;
  }
  return msg;
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  return (e as { name?: string }).name === "AbortError";
}

/** Bounded fetch so pipeline polling cannot hang forever if the proxy or API stalls. */
async function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 45_000;
  const { timeoutMs: _t, ...rest } = init;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export type RunRow = {
  id: string;
  status: string;
  environment: string;
  started_at: string | null;
  finished_at?: string | null;
  top_error_signature?: string;
  plan_id?: string;
};

export type InitiativeRow = {
  id: string;
  intent_type: string;
  title: string | null;
  risk_level: string;
  created_by: string | null;
  created_at: string;
};

export type PlanRow = {
  id: string;
  initiative_id: string;
  version: number;
  status?: string;
  created_at: string;
};

export type ArtifactRow = {
  id: string;
  run_id?: string;
  job_run_id?: string | null;
  artifact_type: string;
  artifact_class?: string;
  uri: string;
  producer_plan_node_id?: string | null;
  created_at: string;
  metadata_json?: Record<string, unknown> | null;
};

/** Body for PATCH /v1/artifacts/:id (email edit Phase 5). */
export type UpdateArtifactPayload = { content?: string; metadata?: Record<string, unknown> };

export type JobRunRow = {
  id: string;
  run_id: string;
  plan_node_id: string;
  status: string;
  environment?: string;
  started_at: string | null;
  finished_at?: string | null;
  job_type?: string;
  node_key?: string;
};

export type ApprovalRow = {
  id: string;
  type: string;
  status: string;
  run_id?: string;
  plan_node_id?: string;
  created_at: string;
  payload?: unknown;
};

export type ToolCallRow = {
  id: string;
  job_run_id: string;
  adapter_id: string;
  capability?: string;
  operation_key?: string;
  status?: string;
  started_at?: string | null;
  ended_at?: string | null;
};

export async function getRuns(params?: { status?: string; intent_type?: string; environment?: string; limit?: number }): Promise<{ items: RunRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.intent_type) searchParams.set("intent_type", params.intent_type);
  if (params?.environment) searchParams.set("environment", params.environment);
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  const res = await fetch(`${controlPlaneApiBase()}/v1/runs?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRun(id: string): Promise<RunRow & { job_runs?: unknown[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/runs/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRunStatus(id: string): Promise<{ status: string }> {
  const res = await fetchWithTimeout(`${controlPlaneApiBase()}/v1/runs/${id}/status`, { timeoutMs: 30_000 });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRunArtifacts(runId: string): Promise<{ items: ArtifactRow[] }> {
  const res = await fetchWithTimeout(`${controlPlaneApiBase()}/v1/runs/${runId}/artifacts`, { timeoutMs: 60_000 });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "rolled_back", "partial"]);

/** Combine latest wizard_progress from each job_run (parallel migration: blogs job + PDFs job). */
function mergeWizardProgressPayloads(payloads: Record<string, unknown>[]): Record<string, unknown> {
  if (payloads.length === 0) return {};
  if (payloads.length === 1) return { ...payloads[0] };
  const out: Record<string, unknown> = {};
  const banners: string[] = [];
  for (const pl of payloads) {
    const b = pl.phase_banner;
    if (typeof b === "string" && b.trim()) banners.push(b.trim());
    if (pl.blogs != null) out.blogs = pl.blogs;
    if (pl.pdfs != null) out.pdfs = pl.pdfs;
    if (pl.blog_tags != null) out.blog_tags = pl.blog_tags;
    if (pl.crawl != null) out.crawl = pl.crawl;
    if (pl.phase != null) out.phase = pl.phase;
    if (pl.migration_branch != null) out.migration_branch = pl.migration_branch;
  }
  if (banners.length > 0) out.phase_banner = banners.join(" · ");
  return out;
}

/** Response from enqueue-only WP → Shopify wizard endpoints (dry run, PDF import, PDF resolve). */
export type WpShopifyWizardEnqueueResponse = {
  run_id: string;
  plan_id: string;
  initiative_id: string;
  message?: string;
  /** True when migration_run queued blogs/tags/ETL and PDFs as two parallel root jobs. */
  parallel_migration_jobs?: boolean;
};

export type WpShopifyPipelinePollOptions = {
  intervalMs?: number;
  maxWaitMs?: number;
  onStatus?: (status: string) => void;
  /** Fires as soon as the control plane returns `run_id` (before polling completes). */
  onRunEnqueued?: (runId: string) => void;
  /** When set, polling uses GET /v1/runs/:id (includes latest `wizard_progress` job_events). */
  onWizardProgress?: (payload: Record<string, unknown>) => void;
};

/** Poll GET /v1/runs/:id/status until succeeded, partial, failed, or rolled_back (default timeout 45 minutes). */
export async function pollRunUntilTerminal(
  runId: string,
  opts?: {
    intervalMs?: number;
    maxWaitMs?: number;
    onStatus?: (status: string) => void;
    onWizardProgress?: (payload: Record<string, unknown>) => void;
  },
): Promise<{ status: string }> {
  const intervalMs = opts?.intervalMs ?? 1500;
  const maxWaitMs = opts?.maxWaitMs ?? 45 * 60_000;
  const start = Date.now();
  const useDetail = Boolean(opts?.onWizardProgress);
  for (;;) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error(
        `Run ${runId} did not finish within ${Math.round(maxWaitMs / 1000)}s. Open Pipeline Runs to inspect it.`,
      );
    }
    try {
      if (useDetail) {
        const res = await fetchWithTimeout(`${controlPlaneApiBase()}/v1/runs/${runId}`, { timeoutMs: 30_000 });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          run?: { status?: string };
          job_events?: Array<{
            event_type?: string;
            payload_json?: unknown;
            job_run_id?: string;
            created_at?: string;
          }>;
        };
        const status = data.run?.status ?? "unknown";
        opts?.onStatus?.(status);
        const wizRows = (data.job_events ?? []).filter((e) => e.event_type === "wizard_progress");
        const latestByJob = new Map<string, { created_at?: string; payload_json?: unknown }>();
        for (const e of wizRows) {
          const jid = String(e.job_run_id ?? "");
          if (!jid) continue;
          const prev = latestByJob.get(jid);
          const t = e.created_at ? Date.parse(e.created_at) : 0;
          const pt = prev?.created_at ? Date.parse(prev.created_at) : -1;
          if (!prev || t >= pt) {
            latestByJob.set(jid, { created_at: e.created_at, payload_json: e.payload_json });
          }
        }
        const merged = mergeWizardProgressPayloads(
          [...latestByJob.values()]
            .map((x) => x.payload_json)
            .filter((p): p is Record<string, unknown> => p != null && typeof p === "object" && !Array.isArray(p)),
        );
        if (Object.keys(merged).length > 0) {
          opts?.onWizardProgress?.(merged);
        }
        if (TERMINAL_RUN_STATUSES.has(status)) return { status };
      } else {
        const { status } = await getRunStatus(runId);
        opts?.onStatus?.(status);
        if (TERMINAL_RUN_STATUSES.has(status)) return { status };
      }
    } catch (e) {
      if (isAbortError(e)) {
        opts?.onStatus?.("API poll timed out (retrying…)");
      } else {
        throw e;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function wpShopifyArtifactMeta(items: ArtifactRow[], artifactType: string): Record<string, unknown> | null {
  const a = items.find((x) => x.artifact_type === artifactType);
  const m = a?.metadata_json;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
}

/** When migration runs as two parallel jobs, two `wp_shopify_migration_run` artifacts are produced — merge by_entity for the UI. */
function mergeWpShopifyMigrationRunArtifacts(metas: Record<string, unknown>[]): Record<string, unknown> {
  if (metas.length === 0) {
    throw new Error("mergeWpShopifyMigrationRunArtifacts: no artifacts");
  }
  if (metas.length === 1) return metas[0];
  const by_entity: Record<string, unknown> = {};
  const messages: string[] = [];
  const entities = new Set<string>();
  const unsupported = new Set<string>();
  for (const m of metas) {
    if (typeof m.message === "string" && m.message.trim()) messages.push(m.message.trim());
    const be = m.by_entity;
    if (be && typeof be === "object" && !Array.isArray(be)) {
      for (const [k, v] of Object.entries(be as Record<string, unknown>)) {
        by_entity[k] = v;
      }
    }
    if (Array.isArray(m.entities)) {
      for (const e of m.entities) entities.add(String(e));
    }
    if (Array.isArray(m.unsupported)) {
      for (const u of m.unsupported) unsupported.add(String(u));
    }
  }
  return {
    message: messages.join(" "),
    entities: [...entities],
    unsupported: [...unsupported],
    by_entity,
    generated_at: new Date().toISOString(),
  };
}

async function waitForWizardMigrationRunMerged(
  runId: string,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<Record<string, unknown>> {
  const { status } = await pollRunUntilTerminal(runId, pollOpts);
  if (status !== "succeeded" && status !== "partial") await throwWpShopifyRunFailed(runId, status);
  const { items } = await getRunArtifacts(runId);
  const metas = items
    .filter((x) => x.artifact_type === "wp_shopify_migration_run")
    .map((x) => x.metadata_json)
    .filter((m): m is Record<string, unknown> => m != null && typeof m === "object" && !Array.isArray(m));
  if (metas.length === 0) {
    throw new Error("Run finished but artifact wp_shopify_migration_run was not found.");
  }
  return mergeWpShopifyMigrationRunArtifacts(metas);
}

async function throwWpShopifyRunFailed(runId: string, status: string): Promise<never> {
  let detail = status;
  try {
    const res = await fetchWithTimeout(`${controlPlaneApiBase()}/v1/runs/${runId}`, { timeoutMs: 30_000 });
    if (res.ok) {
      const data = (await res.json()) as {
        job_runs?: Array<{ error_signature?: string | null; status?: string; ended_at?: string | null }>;
        job_events?: Array<{ event_type?: string; payload_json?: unknown }>;
      };
      const failed = (data.job_runs ?? []).filter((j) => j.status === "failed");
      failed.sort((a, b) => {
        const ta = a.ended_at ? Date.parse(a.ended_at) : 0;
        const tb = b.ended_at ? Date.parse(b.ended_at) : 0;
        return tb - ta;
      });
      const sig = failed.map((j) => j.error_signature).find((s) => s && String(s).trim());
      if (sig) detail = String(sig);
      const failEvents = (data.job_events ?? []).filter((e) => e.event_type === "attempt_failed");
      for (const ev of failEvents) {
        const pl = ev?.payload_json;
        if (pl && typeof pl === "object" && !Array.isArray(pl)) {
          const msg = (pl as { message?: string }).message;
          if (typeof msg === "string" && msg.trim()) {
            detail = sig ? `${sig}: ${msg.trim()}` : msg.trim();
            break;
          }
          const reason = (pl as { reason?: string }).reason;
          if (typeof reason === "string" && reason.trim() && !sig) {
            detail = reason.trim();
            break;
          }
        }
      }
      if (detail === status && failed.length > 0) {
        detail = failed[0]?.error_signature?.trim() || "job failed (see run Logs / job_events)";
      }
    }
  } catch {
    /* keep detail */
  }
  if (detail === status && status === "failed") {
    detail =
      "failed (no error_signature or attempt_failed payload on this run — open the run page or runner logs). Each crawl is its own pipeline run: filter Pipeline Runs by status failed or search this run ID; quick GSC/GA successes are different rows.";
  }
  throw new Error(`Pipeline run failed (${detail}). Open /runs/${runId} for details.`);
}

function parseWizardEnqueueResponse(text: string, res: Response): WpShopifyWizardEnqueueResponse {
  let enq: WpShopifyWizardEnqueueResponse & { error?: string };
  try {
    enq = JSON.parse(text) as WpShopifyWizardEnqueueResponse & { error?: string };
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(enq.error ?? text);
  if (!enq.run_id) throw new Error("Pipeline did not return run_id");
  return enq;
}

async function postWpShopifyMigrationPost(path: string, body: Record<string, unknown>): Promise<WpShopifyWizardEnqueueResponse> {
  const res = await fetchWithTimeout(`${controlPlaneApiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 90_000,
  });
  const text = await res.text();
  return parseWizardEnqueueResponse(text, res);
}

/** POST /v1/wp-shopify-migration/wizard_job; returns null if the deployed API has no route yet (404). */
async function tryPostWizardJob(body: Record<string, unknown>): Promise<WpShopifyWizardEnqueueResponse | null> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/wp-shopify-migration/wizard_job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 404 || (res.status === 405 && text.includes("Cannot POST"))) {
    return null;
  }
  return parseWizardEnqueueResponse(text, res);
}

async function waitForWizardArtifact(
  runId: string,
  artifactType: string,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<Record<string, unknown>> {
  const { status } = await pollRunUntilTerminal(runId, pollOpts);
  if (status !== "succeeded" && status !== "partial") await throwWpShopifyRunFailed(runId, status);
  const { items } = await getRunArtifacts(runId);
  const meta = wpShopifyArtifactMeta(items, artifactType);
  if (!meta) throw new Error(`Run finished but artifact ${artifactType} was not found.`);
  return meta;
}

/** Fire-and-forget: records wizard progress on the WP → Shopify initiative (artifact `wp_shopify_wizard_snapshot`). Does not poll. No-op if wizard_job route is missing (older API). */
export async function wpShopifyWizardStateSnapshotEnqueue(params: {
  brand_id: string;
  wizard_step: number;
  summary: Record<string, unknown>;
  previous_step?: number;
  environment?: string;
  /** Synced into initiative goal_metadata so SEO template jobs (source/target inventory, GSC/GA) see the same URLs as the wizard. */
  source_url?: string;
  target_store_url?: string;
  gsc_site_url?: string;
  ga4_property_id?: string;
}): Promise<WpShopifyWizardEnqueueResponse | undefined> {
  const enq = await tryPostWizardJob({
    kind: "wizard_state_snapshot",
    brand_id: params.brand_id,
    wizard_step: params.wizard_step,
    summary: params.summary,
    ...(params.previous_step != null ? { previous_step: params.previous_step } : {}),
    ...(params.environment ? { environment: params.environment } : {}),
    ...(params.source_url?.trim() ? { source_url: params.source_url.trim() } : {}),
    ...(params.target_store_url?.trim() ? { target_store_url: params.target_store_url.trim() } : {}),
    ...(params.gsc_site_url?.trim() ? { gsc_site_url: params.gsc_site_url.trim() } : {}),
    ...(params.ga4_property_id?.trim() ? { ga4_property_id: params.ga4_property_id.trim() } : {}),
  });
  return enq ?? undefined;
}

export async function getInitiatives(params?: { intent_type?: string; risk_level?: string; limit?: number }): Promise<{ items: InitiativeRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.intent_type) searchParams.set("intent_type", params.intent_type);
  if (params?.risk_level) searchParams.set("risk_level", params.risk_level);
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  const res = await fetch(`${controlPlaneApiBase()}/v1/initiatives?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getInitiative(id: string): Promise<InitiativeRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/initiatives/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateInitiative(
  id: string,
  body: Partial<{ intent_type: string; title: string | null; risk_level: string; source_ref: string; goal_metadata: Record<string, unknown> }>,
): Promise<InitiativeRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/initiatives/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/initiatives/:id/google_connected — whether initiative has Google OAuth credentials (for SEO). */
export async function getInitiativeGoogleConnected(id: string): Promise<{ connected: boolean }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/initiatives/${id}/google_connected`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** DELETE /v1/initiatives/:id/google_credentials — disconnect Google for this initiative (legacy only). */
export async function deleteInitiativeGoogleCredentials(id: string): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/initiatives/${id}/google_credentials`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** GET /v1/brand_profiles/:id/google_connected — whether brand has Google OAuth credentials (GSC/GA4) and selected GA4 property. */
export async function getBrandGoogleConnected(id: string): Promise<{ connected: boolean; ga4_property_id?: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/google_connected`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/seo/google_ga4_properties?brand_id= or /v1/brand_profiles/:id/google_ga4_properties — list GA4 properties for the connected Google account. */
export async function getBrandGoogleGa4Properties(id: string): Promise<{ properties: { propertyId: string; displayName: string; accountDisplayName?: string }[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/seo/google_ga4_properties?brand_id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try {
      const j = JSON.parse(body) as { error?: string };
      if (typeof j?.error === "string") msg = j.error;
    } catch {
      /* use body as-is */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** PATCH /v1/brand_profiles/:id/google_ga4_property — set selected GA4 property for this brand. */
export async function patchBrandGoogleGa4Property(id: string, body: { property_id: string | null }): Promise<{ ok: boolean; ga4_property_id?: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/google_ga4_property`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** DELETE /v1/brand_profiles/:id/google_credentials — disconnect Google for this brand. */
export async function deleteBrandGoogleCredentials(id: string): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/google_credentials`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** GET /v1/brand_profiles/:id/klaviyo_connected — whether brand has Klaviyo credentials. */
export async function getBrandKlaviyoConnected(id: string): Promise<{ connected: boolean }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/klaviyo_connected`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** PUT /v1/brand_profiles/:id/klaviyo_credentials — set Klaviyo API key and optional default list. */
export async function putBrandKlaviyoCredentials(id: string, body: { api_key: string; default_list_id?: string }): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/klaviyo_credentials`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

/** DELETE /v1/brand_profiles/:id/klaviyo_credentials — disconnect Klaviyo for this brand. */
export async function deleteBrandKlaviyoCredentials(id: string): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/klaviyo_credentials`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** GET /v1/brand_profiles/:id/shopify_connected — whether brand has Shopify connector (shop_domain). */
export async function getBrandShopifyConnected(id: string): Promise<{
  connected: boolean;
  shop_domain?: string;
  /** True when credentials use shpat_ custom app token (not OAuth client credentials). */
  uses_custom_app_token?: boolean;
}> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/shopify_connected`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** PUT /v1/brand_profiles/:id/shopify_credentials — Partner OAuth (client_id + secret) or custom app (admin_access_token). */
export async function putBrandShopifyCredentials(
  id: string,
  body: {
    shop_domain: string;
    client_id?: string;
    client_secret?: string;
    admin_access_token?: string;
    scopes?: string[];
  }
): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/shopify_credentials`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string") msg = j.error;
    } catch {
      /* keep raw body */
    }
    if (msg.includes("shop_domain, client_id, and client_secret are required")) {
      throw new Error(
        "The Control Plane at your API URL is an older build: it does not accept Admin API tokens (shpat_) yet. Redeploy control-plane from the latest code, set NEXT_PUBLIC_CONTROL_PLANE_API to that deployment, then connect again.",
      );
    }
    throw new Error(msg);
  }
}

/** DELETE /v1/brand_profiles/:id/shopify_credentials — disconnect Shopify for this brand. */
export async function deleteBrandShopifyCredentials(id: string): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/shopify_credentials`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** GET /v1/brand_profiles/:id/woocommerce_connected — WooCommerce REST connector (store URL only; keys are server-side). */
export async function getBrandWooCommerceConnected(id: string): Promise<{
  connected: boolean;
  store_url?: string;
}> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/woocommerce_connected`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** PUT /v1/brand_profiles/:id/woocommerce_credentials — WooCommerce REST API (Read key). Encrypted on the server. */
export async function putBrandWooCommerceCredentials(
  id: string,
  body: { store_url: string; consumer_key: string; consumer_secret: string },
): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/woocommerce_credentials`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

/** DELETE /v1/brand_profiles/:id/woocommerce_credentials — disconnect WooCommerce REST for this brand. */
export async function deleteBrandWooCommerceCredentials(id: string): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}/woocommerce_credentials`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function createInitiative(body: { intent_type: string; title?: string | null; risk_level: string; source_ref?: string; brand_profile_id?: string | null }): Promise<InitiativeRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/initiatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

// ——— Launch kernel: build specs & launches ———

export type BuildSpecRow = { id: string; initiative_id: string; spec_json: Record<string, unknown>; created_at: string; updated_at: string };

export type LaunchRow = {
  id: string;
  initiative_id: string;
  status: string;
  build_spec_id: string | null;
  artifact_id: string | null;
  deploy_url: string | null;
  deploy_id: string | null;
  domain: string | null;
  verification_status: string | null;
  created_at: string;
  updated_at: string;
};

export async function getBuildSpecs(initiativeId: string): Promise<{ items: BuildSpecRow[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/build_specs?initiative_id=${encodeURIComponent(initiativeId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getBuildSpec(id: string): Promise<BuildSpecRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/build_specs/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBuildSpec(body: {
  initiative_id: string;
  spec: Record<string, unknown>;
  extended?: boolean;
}): Promise<{ build_spec_id: string; launch_id: string; launch: LaunchRow }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/build_specs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

export async function createBuildSpecFromStrategy(body: {
  initiative_id: string;
  strategy_doc: string;
}): Promise<{ build_spec_id: string; launch_id: string; launch: LaunchRow }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/build_specs/from_strategy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

export async function getLaunches(params?: { initiative_id?: string; limit?: number }): Promise<{ items: LaunchRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.initiative_id) searchParams.set("initiative_id", params.initiative_id);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const res = await fetch(`${controlPlaneApiBase()}/v1/launches?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getLaunch(id: string): Promise<LaunchRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/launches/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postLaunchAction(
  action: string,
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/launches/actions/${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(inputs),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

export async function postLaunchValidate(launchId: string): Promise<{ passed: boolean; checks?: unknown[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/launches/${launchId}/validate`, {
    method: "POST",
    headers: { "x-role": "operator" },
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

export type PipelineDraft = {
  intentType: string;
  summary: string;
  inputs: Record<string, unknown>;
  requiredInputs?: string[];
  nodes: { node_key: string; job_type: string; node_type?: string; agent_role?: string; consumes_artifact_types?: string[] }[];
  edges: { from_key: string; to_key: string; condition?: string }[];
  entryNodeKeys?: string[];
  terminalNodeKeys?: string[];
  expectedOutputs?: string[];
  modulesUsed?: string[];
  validations?: string[];
  successCriteria?: string[];
  warnings?: string[];
  fallbackStrategy?: string;
};
export type PipelineLintResult = { valid: boolean; errors: string[]; warnings: string[] };

/** POST /v1/pipelines/draft — prompt-built pipeline draft + lint. Supports compose_with (V2). */
export async function createPipelineDraft(params: {
  prompt?: string;
  intent_type?: string;
  inputs?: Record<string, unknown>;
  compose_with?: string[];
}): Promise<{ draft: PipelineDraft; lint: PipelineLintResult }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/pipelines/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

/** POST /v1/pipelines/drafts — save draft (V1.5). */
export async function savePipelineDraft(draft: PipelineDraft, name?: string): Promise<{ id: string; draft_hash: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/pipelines/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify({ draft, name }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

/** GET /v1/pipelines/drafts — list saved drafts. */
export async function listPipelineDrafts(limit?: number): Promise<{ items: { id: string; draft_hash: string; name: string | null; created_at: string }[] }> {
  const q = limit != null ? `?limit=${limit}` : "";
  const res = await fetch(`${controlPlaneApiBase()}/v1/pipelines/drafts${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/pipelines/drafts/:id — load a saved draft (returns draft + lint). */
export async function getPipelineDraft(id: string): Promise<{ draft: PipelineDraft; name: string | null; lint: PipelineLintResult }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/pipelines/drafts/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/pipelines/templates — save draft as pattern override (V2). */
export async function savePipelineTemplate(patternKey: string, draft: PipelineDraft): Promise<{ ok: boolean; pattern_key: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/pipelines/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify({ pattern_key: patternKey, draft }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

/** POST /v1/pipelines/drafts/compose — merge two drafts or two pattern keys (V2). */
export async function composePipelineDrafts(body: { draft_ids?: string[]; pattern_keys?: string[] }): Promise<{ draft: PipelineDraft; lint: PipelineLintResult }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/pipelines/drafts/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

/** POST /v1/initiatives/:id/plan/from-draft — compile plan from pipeline draft. */
export async function compilePlanFromDraft(initiativeId: string, draft: PipelineDraft, options?: { force?: boolean }): Promise<{ id: string; initiative_id: string; status: string; nodes: number; plan_hash: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/initiatives/${initiativeId}/plan/from-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify({ draft, force: options?.force }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

export async function getPlans(params?: { initiative_id?: string; limit?: number }): Promise<{ items: PlanRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.initiative_id) searchParams.set("initiative_id", params.initiative_id);
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  const res = await fetch(`${controlPlaneApiBase()}/v1/plans?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPlan(id: string): Promise<PlanRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/plans/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/plans/:id/start — create a run for this plan. Returns run id. */
export async function startPlanRun(planId: string, options?: { environment?: "sandbox" | "staging" | "prod" }): Promise<{ id: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/plans/${planId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify({ environment: options?.environment ?? "sandbox" }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

export async function getArtifacts(params?: { limit?: number; artifact_class?: string; run_id?: string }): Promise<{ items: ArtifactRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  if (params?.artifact_class) searchParams.set("artifact_class", params.artifact_class);
  if (params?.run_id) searchParams.set("run_id", params.run_id);
  const res = await fetch(`${controlPlaneApiBase()}/v1/artifacts?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getArtifact(id: string): Promise<ArtifactRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/artifacts/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/artifacts/:id/content — raw body (HTML or text) for edit/preview. */
export async function getArtifactContent(id: string): Promise<string> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/artifacts/${id}/content`);
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

/** PATCH /v1/artifacts/:id — update content and/or metadata (Phase 5 email edit). */
export async function updateArtifact(id: string, payload: UpdateArtifactPayload): Promise<ArtifactRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/artifacts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getJobRuns(params?: { status?: string; environment?: string; run_id?: string; limit?: number }): Promise<{ items: JobRunRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.environment) searchParams.set("environment", params.environment);
  if (params?.run_id) searchParams.set("run_id", params.run_id);
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  const res = await fetch(`${controlPlaneApiBase()}/v1/job_runs?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getJobRun(id: string): Promise<JobRunRow> {
  const { items } = await getJobRuns({ limit: 500 });
  const found = items.find((j) => j.id === id);
  if (!found) throw new Error("Job run not found");
  return found;
}

export async function getToolCalls(params?: { run_id?: string; job_run_id?: string; limit?: number }): Promise<{ items: ToolCallRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.run_id) searchParams.set("run_id", params.run_id);
  if (params?.job_run_id) searchParams.set("job_run_id", params.job_run_id);
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  const res = await fetch(`${controlPlaneApiBase()}/v1/tool_calls?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return { items: data.items ?? [] };
}

export async function getApprovals(params?: { status?: string; limit?: number }): Promise<{ items: ApprovalRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  const res = await fetch(`${controlPlaneApiBase()}/v1/approvals?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPendingApprovals(): Promise<{ items: ApprovalRow[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/approvals/pending`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getApproval(id: string): Promise<ApprovalRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/approvals/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function rerunRun(id: string): Promise<{ id: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/runs/${id}/rerun`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cancelRun(id: string, reason?: string): Promise<{ id: string; status: string; cancelled_at?: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/runs/${id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reason != null ? { reason } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type LlmCallRow = {
  id: string;
  run_id: string;
  job_run_id: string;
  model_tier: string;
  model_id: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: string;
};

export type UsageByProvider = {
  provider: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  estimated_cost_usd: number;
};

export type UsageByModel = {
  model_tier: string;
  model_id: string;
  provider: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  estimated_cost_usd: number;
};

export type UsageAggregate = {
  by_tier: { model_tier: string; calls: number; tokens_in: number; tokens_out: number; avg_latency_ms: number }[];
  by_provider?: UsageByProvider[];
  by_model?: UsageByModel[];
  totals: { calls: number; tokens_in: number; tokens_out: number; estimated_cost_usd?: number };
  percentiles?: { p50_latency_ms: number; p95_latency_ms: number };
  error_count?: number;
  from?: string;
  to?: string;
};

export async function getLlmCalls(params?: { run_id?: string; model_tier?: string; limit?: number; offset?: number }): Promise<{ items: LlmCallRow[]; limit: number; offset: number }> {
  const searchParams = new URLSearchParams();
  if (params?.run_id) searchParams.set("run_id", params.run_id);
  if (params?.model_tier) searchParams.set("model_tier", params.model_tier);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const res = await fetch(`${controlPlaneApiBase()}/v1/llm_calls?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getUsage(params?: { from?: string; to?: string }): Promise<UsageAggregate> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  const res = await fetch(`${controlPlaneApiBase()}/v1/usage?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Agent Memory --

export type AgentMemoryRow = {
  id: string;
  initiative_id?: string | null;
  run_id?: string | null;
  scope: string;
  key: string;
  value: string;
  created_at: string;
};

export async function getAgentMemory(params?: { initiative_id?: string; run_id?: string; scope?: string; limit?: number }): Promise<{ items: AgentMemoryRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.initiative_id) searchParams.set("initiative_id", params.initiative_id);
  if (params?.run_id) searchParams.set("run_id", params.run_id);
  if (params?.scope) searchParams.set("scope", params.scope);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const res = await fetch(`${controlPlaneApiBase()}/v1/agent_memory?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAgentMemoryById(id: string): Promise<AgentMemoryRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/agent_memory/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- MCP Servers --

export type McpServerRow = {
  id: string;
  name: string;
  server_type: string;
  url_or_cmd: string;
  args_json?: unknown;
  env_json?: unknown;
  auth_header?: string | null;
  capabilities?: string[] | null;
  active: boolean;
  created_at: string;
};

export async function getMcpServers(params?: { limit?: number }): Promise<{ items: McpServerRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const res = await fetch(`${controlPlaneApiBase()}/v1/mcp_servers?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMcpServer(id: string): Promise<McpServerRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/mcp_servers/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createMcpServer(body: { name: string; server_type: string; url_or_cmd: string; args_json?: unknown; capabilities?: string[] }): Promise<McpServerRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/mcp_servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "admin" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteMcpServer(id: string): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/mcp_servers/${id}`, { method: "DELETE", headers: { "x-role": "admin" } });
  if (!res.ok) throw new Error(await res.text());
}

export async function testMcpServer(id: string): Promise<{ reachable?: boolean; status?: number; message?: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/mcp_servers/${id}/test`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Per-node LLM calls (run replay) --

export type JobRunLlmSummary = {
  calls: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency_ms: number;
};

export async function getJobRunLlmCalls(jobRunId: string): Promise<{ items: LlmCallRow[]; summary: JobRunLlmSummary }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/job_runs/${jobRunId}/llm_calls`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Routing policies --

export type RoutingPolicyRow = {
  id: string;
  job_type: string;
  model_tier: string;
  config_json?: unknown;
  active: boolean;
};

export async function getRoutingPolicies(): Promise<{ items: RoutingPolicyRow[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/routing_policies`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Webhook Outbox --

export type WebhookOutboxRow = {
  id: string;
  event_type: string;
  payload: unknown;
  status: string;
  attempt_count: number;
  last_error: string | null;
  next_retry_at: string | null;
  idempotency_key: string | null;
  destination: string | null;
  created_at: string;
  sent_at: string | null;
  updated_at: string;
};

export async function getWebhookOutbox(params?: { status?: string; limit?: number; offset?: number }): Promise<{ items: WebhookOutboxRow[]; limit: number; offset: number }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const res = await fetch(`${controlPlaneApiBase()}/v1/webhook_outbox?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchWebhookOutbox(id: string, body: { status?: string; attempt_count?: number; last_error?: string; next_retry_at?: string | null; sent_at?: string | null }): Promise<WebhookOutboxRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/webhook_outbox/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- LLM Budgets --

export type LlmBudgetRow = {
  id: string;
  scope_type: string;
  scope_value: string;
  budget_tokens: number | null;
  budget_dollars: number | null;
  period: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getLlmBudgets(params?: { limit?: number; offset?: number }): Promise<{ items: LlmBudgetRow[]; limit: number; offset: number }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const res = await fetch(`${controlPlaneApiBase()}/v1/llm_budgets?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Usage by job_type --

export type UsageByJobType = {
  job_type: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency_ms: number;
};

export async function getUsageByJobType(params?: { from?: string; to?: string }): Promise<{ items: UsageByJobType[] }> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  const res = await fetch(`${controlPlaneApiBase()}/v1/usage/by_job_type?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Analytics (real run activity, cost, artifacts) --

export type AnalyticsPayload = {
  run_activity_heatmap: { id: string; data: { x: string; y: number }[] }[];
  cost_treemap: { name: string; children: { name: string; children?: { name: string; value: number }[]; value?: number }[] };
  artifact_breakdown: { name: string; children: { name: string; value: number }[] };
  from: string;
  to: string;
};

export async function getAnalytics(params?: { from?: string; to?: string }): Promise<AnalyticsPayload> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  const res = await fetch(`${controlPlaneApiBase()}/v1/analytics?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Email campaigns --

export type EmailCampaignRow = {
  id: string;
  title: string | null;
  intent_type: string;
  risk_level: string;
  created_at: string;
  status?: string;
  subject_line?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  template_artifact_id?: string | null;
  audience_segment_ref?: string | null;
  metadata_updated_at?: string | null;
};

export async function getEmailCampaigns(params?: { limit?: number; offset?: number; campaign_kind?: string }): Promise<{ items: EmailCampaignRow[]; limit: number; offset: number }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  if (params?.campaign_kind) searchParams.set("campaign_kind", params.campaign_kind);
  const res = await fetch(`${controlPlaneApiBase()}/v1/email_designs?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getEmailCampaign(id: string): Promise<EmailCampaignRow & { reply_to?: string | null; metadata_json?: unknown }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/email_designs/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createEmailCampaign(body: {
  title?: string;
  subject_line?: string;
  from_name?: string;
  from_email?: string;
  brand_profile_id?: string;
  template_id?: string;
  template_artifact_id?: string;
  metadata_json?: unknown;
}): Promise<EmailCampaignRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/email_designs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error && typeof j.error === "string") throw new Error(j.error);
    } catch (e) {
      if (e instanceof Error && e.message !== text) throw e;
    }
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateEmailCampaign(id: string, body: {
  subject_line?: string;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  audience_segment_ref?: string;
  template_artifact_id?: string;
  metadata_json?: unknown;
}): Promise<EmailCampaignRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/email_designs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchSitemapProducts(params: {
  sitemap_url: string;
  sitemap_type: string;
  page?: number;
  limit?: number;
}): Promise<{ items: Array<{ src: string; title: string; product_url: string; description?: string }>; has_more: boolean; total?: number }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/sitemap/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Fetch products from JSON URL (e.g. Shopify collection) or XML sitemap. Use when type is shopify_json or to unify with sitemap. */
export async function fetchProductsFromUrl(params: {
  url: string;
  type: "shopify_json" | "sitemap_xml";
  sitemap_type?: string;
  limit?: number;
}): Promise<{ items: Array<{ src: string; title: string; product_url: string; description?: string }>; has_more: boolean; total?: number }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/products/from_url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** WP → Shopify migration wizard — Step 1: crawl source site (every live URL; optional link-following for WordPress). Requires brand_id for initiative runs. */
export type WpShopifyMigrationCrawlParams = {
  brand_id: string;
  source_url: string;
  use_link_crawl?: boolean;
  max_urls?: number;
  crawl_delay_ms?: number;
  fetch_page_details?: boolean;
  environment?: string;
};

/** Updates initiative goal_metadata only — does not create a pipeline run (avoids snapshot job spam). */
export async function wpShopifyMigrationSyncGoalMetadata(params: {
  brand_id: string;
  environment?: string;
  source_url?: string;
  target_store_url?: string;
  gsc_site_url?: string;
  ga4_property_id?: string;
}): Promise<{ ok: boolean; initiative_id?: string }> {
  const res = await fetchWithTimeout(`${controlPlaneApiBase()}/v1/wp-shopify-migration/sync_goal_metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand_id: params.brand_id,
      ...(params.environment ? { environment: params.environment } : {}),
      ...(params.source_url?.trim() ? { source_url: params.source_url.trim() } : {}),
      ...(params.target_store_url?.trim() ? { target_store_url: params.target_store_url.trim() } : {}),
      ...(params.gsc_site_url?.trim() ? { gsc_site_url: params.gsc_site_url.trim() } : {}),
      ...(params.ga4_property_id?.trim() ? { ga4_property_id: params.ga4_property_id.trim() } : {}),
    }),
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; initiative_id?: string }>;
}

export type WpShopifyMigrationCrawlResult = {
  source_url: string;
  urls: Array<{
    url: string;
    normalized_url: string;
    path: string;
    status: number;
    type: string;
    source: "sitemap" | "crawl" | "both";
    title?: string | null;
    meta_description?: string | null;
    h1?: string | null;
  }>;
  crawl_mode: "sitemap" | "crawl" | "hybrid";
  stats: { total_urls: number; by_type: Record<string, number>; status_counts: Record<string, number> };
};

export async function wpShopifyMigrationCrawl(
  params: WpShopifyMigrationCrawlParams,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<WpShopifyMigrationCrawlResult> {
  const { brand_id, ...rest } = params;
  const linkCrawl = Boolean(rest.use_link_crawl);
  const body = {
    brand_id,
    source_url: rest.source_url,
    use_link_crawl: rest.use_link_crawl,
    max_urls: rest.max_urls,
    crawl_delay_ms: rest.crawl_delay_ms,
    fetch_page_details: rest.fetch_page_details,
  };

  pollOpts?.onStatus?.(linkCrawl ? "Running crawl on API (direct, long timeout)…" : "Running crawl on API (direct)…");
  try {
    const res = await fetchWithTimeout(`${controlPlaneApiBase()}/v1/wp-shopify-migration/crawl_execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: linkCrawl ? 95 * 60_000 : 30 * 60_000,
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(text || `Crawl API invalid JSON (${res.status})`);
    }
    if (!res.ok) {
      const err = (data as { error?: string })?.error;
      const ex = new Error(err || text || `crawl_execute failed (${res.status})`) as Error & { httpStatus?: number };
      ex.httpStatus = res.status;
      throw ex;
    }
    return data as WpShopifyMigrationCrawlResult;
  } catch (directErr) {
    const msg = String(directErr instanceof Error ? directErr.message : directErr);
    const httpStatus = (directErr as Error & { httpStatus?: number }).httpStatus;
    const poolSaturated =
      /MaxClientsInSessionMode|max clients reached|Session mode|too many clients|53300/i.test(msg);
    const clientAborted = isAbortError(directErr);
    // Vercel / CDN / proxy often returns 502–504 while Render may still be crawling; pipeline fallback only adds failed runs.
    const gatewayOrProxy =
      (typeof httpStatus === "number" && httpStatus >= 502 && httpStatus <= 504) ||
      /Gateway Time-out|Bad Gateway|FUNCTION_INVOCATION_TIMEOUT|invocation failed|timeout waiting|upstream connect|ECONNRESET/i.test(
        msg,
      );
    // Pool-saturated errors: pipeline crawl uses the same DB pool → more failed runs, not a fix.
    // Client abort (browser/proxy timeout): the API may still be crawling; enqueuing a second job duplicates work.
    if (poolSaturated || clientAborted || gatewayOrProxy) {
      pollOpts?.onStatus?.(
        poolSaturated
          ? "Crawl API hit a database connection limit — not queueing a pipeline run (would make it worse). Lower DATABASE_POOL_MAX / use direct Postgres URL on Control Plane, then retry."
          : gatewayOrProxy
            ? "Proxy or gateway closed the long crawl request — not queueing a pipeline run (avoids duplicate failed runs). Wait and use Refetch; crawl may still complete on the Control Plane."
            : "Request timed out — not auto-queueing a pipeline crawl (avoids duplicate runs). Wait and use Refetch, or raise the client timeout.",
      );
      throw directErr instanceof Error ? directErr : new Error(msg);
    }
    // Runner fallback removed: POST /crawl created many failed Pipeline Runs (same initiative) and confused operators.
    // Step 1 is API-only; fix crawl_execute / proxy max duration / DB pool instead.
    pollOpts?.onStatus?.("Crawl API request failed (no runner fallback).");
    throw directErr instanceof Error ? directErr : new Error(msg);
  }
}

/** WP → Shopify migration wizard — Step 2: Google Search Console report via control plane (no pipeline run; avoids noisy failed runs when the UI already got data). */
export type SeoGscReportParams = {
  brand_id: string;
  site_url: string;
  date_range?: string;
  row_limit?: number;
  environment?: string;
};
export type SeoGscReport = {
  site_url: string;
  date_range: { start: string; end: string };
  pages: Array<{ url: string; clicks: number; impressions: number; ctr: number; position: number }>;
  queries: Array<{ query: string; clicks: number; impressions: number }>;
  /** Keywords that generated traffic per page (GSC dimensions: page + query). */
  page_queries: Array<{ page: string; query: string; clicks: number; impressions: number }>;
  error?: string;
};

export async function seoGscReport(params: SeoGscReportParams, _pollOpts?: WpShopifyPipelinePollOptions): Promise<SeoGscReport> {
  const res = await fetchWithTimeout(`${controlPlaneApiBase()}/v1/seo/gsc_report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      site_url: params.site_url,
      date_range: params.date_range ?? "last28days",
      row_limit: params.row_limit ?? 500,
      brand_id: params.brand_id,
    }),
    timeoutMs: 120_000,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `GSC report: invalid response (${res.status})`);
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error;
    throw new Error(err || text || `GSC report failed (${res.status})`);
  }
  return data as SeoGscReport;
}

/** WP → Shopify migration wizard — Step 2: GA4 report. With brand_id: control plane only (no pipeline run). With property_id only: same direct API (no initiative). */
export type SeoGa4ReportParams = { property_id?: string; row_limit?: number; brand_id?: string; environment?: string };
export type SeoGa4Report = {
  property_id: string;
  pages: Array<{
    full_page_url?: string;
    page_path?: string;
    sessions: number;
    screen_page_views?: number;
    user_engagement_duration?: number;
  }>;
  /** When GA4 has Search Console linked: query-level keywords (no per-URL in GA4 API). */
  search_console_queries?: Array<{ query: string; clicks: number; impressions: number }>;
  /** When GA4 pages succeeded but Search Console report failed (e.g. property not linked). */
  search_console_error?: string;
  error?: string;
};

export async function seoGa4Report(params: SeoGa4ReportParams, _pollOpts?: WpShopifyPipelinePollOptions): Promise<SeoGa4Report> {
  const res = await fetchWithTimeout(`${controlPlaneApiBase()}/v1/seo/ga4_report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    timeoutMs: 120_000,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `GA4 report: invalid response (${res.status})`);
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error;
    throw new Error(err || text || `GA4 report failed (${res.status})`);
  }
  return data as SeoGa4Report;
}

/** WP → Shopify migration wizard — Keyword Planner: monthly search volume (pipeline → `wp_shopify_seo_keyword_volume`). */
export type SeoKeywordVolumeParams = { brand_id: string; keywords: string[]; environment?: string };
export type SeoKeywordVolumeResult = {
  volumes: Array<{ keyword: string; monthly_search_volume: number }>;
  error?: string;
};

const SEO_KEYWORD_VOLUME_CHUNK = 400;

export async function seoKeywordVolume(
  params: SeoKeywordVolumeParams,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<SeoKeywordVolumeResult> {
  const keywords = Array.isArray(params.keywords) ? params.keywords : [];
  if (keywords.length === 0) return { volumes: [] };
  const enq = await tryPostWizardJob({
    kind: "seo_keyword_volume",
    brand_id: params.brand_id,
    keywords,
    ...(params.environment ? { environment: params.environment } : {}),
  });
  if (enq) {
    pollOpts?.onRunEnqueued?.(enq.run_id);
    const meta = await waitForWizardArtifact(enq.run_id, "wp_shopify_seo_keyword_volume", pollOpts);
    const volumes = meta.volumes as SeoKeywordVolumeResult["volumes"] | undefined;
    const error = meta.error != null ? String(meta.error) : undefined;
    return {
      volumes: Array.isArray(volumes) ? volumes : [],
      ...(error ? { error } : {}),
    };
  }
  const merged: SeoKeywordVolumeResult["volumes"] = [];
  const errors: string[] = [];
  for (let i = 0; i < keywords.length; i += SEO_KEYWORD_VOLUME_CHUNK) {
    const chunk = keywords.slice(i, i + SEO_KEYWORD_VOLUME_CHUNK);
    const res = await fetch(`${controlPlaneApiBase()}/v1/seo/keyword_volume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: chunk }),
    });
    const text = await res.text();
    let data: SeoKeywordVolumeResult | { error?: string } | null = null;
    try {
      data = text ? (JSON.parse(text) as SeoKeywordVolumeResult) : null;
    } catch {
      if (!res.ok) errors.push(text.slice(0, 500) || `HTTP ${res.status}`);
      else errors.push(text.slice(0, 500));
      continue;
    }
    if (!res.ok) {
      const errMsg =
        data && typeof data === "object" && data.error != null ? String(data.error) : text.slice(0, 500) || `HTTP ${res.status}`;
      errors.push(errMsg);
      continue;
    }
    const okBody = data as SeoKeywordVolumeResult | null;
    if (okBody?.volumes) merged.push(...okBody.volumes);
    if (okBody?.error) errors.push(String(okBody.error));
  }
  const uniqueErrors = Array.from(new Set(errors.map((s) => s.trim()).filter(Boolean)));
  return { volumes: merged, ...(uniqueErrors.length > 0 ? { error: uniqueErrors.join("; ") } : {}) };
}

/** WP → Shopify migration wizard — DataForSEO ranked keywords per URL (cached). Returns keywords each URL ranks for. */
export type SeoRankedKeywordsParams = { urls: string[]; limit_per_url?: number };
export type SeoRankedKeywordItem = { keyword: string; monthly_search_volume?: number; position?: number };
export type SeoRankedKeywordsResult = {
  by_url: Record<string, { keywords: SeoRankedKeywordItem[]; cached: boolean }>;
  error?: string;
};

export async function seoRankedKeywords(params: SeoRankedKeywordsParams): Promise<SeoRankedKeywordsResult> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/seo/ranked_keywords`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** WooCommerce REST: pass either `brand_id` (keys saved on brand) or all three woo_* fields (e.g. one-off / override). */
export type WpShopifyMigrationWooRestParams = {
  brand_id?: string;
  woo_server?: string;
  woo_consumer_key?: string;
  woo_consumer_secret?: string;
};

/** WP → Shopify migration wizard — Step 3: WooCommerce → Shopify migration (Matrixify-style). Dry run: preview counts from WooCommerce API. */
export type WpShopifyMigrationDryRunParams = WpShopifyMigrationWooRestParams & {
  entities: string[];
  /** Improves PDF media counts / preview when media is not public. */
  wp_username?: string;
  wp_application_password?: string;
  environment?: string;
};
export type WpShopifyMigrationDryRunResult = { counts: Record<string, number>; run_id: string };

/** Dry-run counts via pipeline (`wp_shopify_wizard_job` → artifact `wp_shopify_migration_dry_run`). */
export async function wpShopifyMigrationDryRun(
  params: WpShopifyMigrationDryRunParams,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<WpShopifyMigrationDryRunResult> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/wp-shopify-migration/dry_run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let enq: WpShopifyWizardEnqueueResponse & { error?: string };
  try {
    enq = JSON.parse(text) as WpShopifyWizardEnqueueResponse & { error?: string };
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(enq.error ?? text);
  const runId = enq.run_id;
  if (!runId) throw new Error("dry_run did not return run_id");
  pollOpts?.onRunEnqueued?.(runId);
  const { status } = await pollRunUntilTerminal(runId, pollOpts);
  if (status !== "succeeded") await throwWpShopifyRunFailed(runId, status);
  const { items } = await getRunArtifacts(runId);
  const meta = wpShopifyArtifactMeta(items, "wp_shopify_migration_dry_run");
  const counts = meta?.counts as Record<string, number> | undefined;
  if (!counts || typeof counts !== "object") {
    throw new Error("Dry run succeeded but artifact wp_shopify_migration_dry_run is missing counts.");
  }
  return { counts, run_id: runId };
}

/** Paginated preview rows for step 3 granular migration selection. */
export type MigrationPreviewItem = { id: string; title: string; status: string; slug?: string; url?: string };
export type WpShopifyMigrationPreviewItemsParams = WpShopifyMigrationWooRestParams & {
  brand_id: string;
  entity: string;
  page?: number;
  per_page?: number;
  wp_username?: string;
  wp_application_password?: string;
  environment?: string;
};
export type WpShopifyMigrationPreviewItemsResult = {
  items: MigrationPreviewItem[];
  total: number;
  page: number;
  per_page: number;
  scope_note?: string;
  error?: string;
};

export async function wpShopifyMigrationPreviewItems(
  params: WpShopifyMigrationPreviewItemsParams,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<WpShopifyMigrationPreviewItemsResult> {
  const enq = await postWpShopifyMigrationPost("/v1/wp-shopify-migration/preview_items", {
    brand_id: params.brand_id,
    entity: params.entity,
    page: params.page,
    per_page: params.per_page,
    ...(params.woo_server ? { woo_server: params.woo_server } : {}),
    ...(params.woo_consumer_key ? { woo_consumer_key: params.woo_consumer_key } : {}),
    ...(params.woo_consumer_secret ? { woo_consumer_secret: params.woo_consumer_secret } : {}),
    ...(params.wp_username ? { wp_username: params.wp_username } : {}),
    ...(params.wp_application_password ? { wp_application_password: params.wp_application_password } : {}),
    ...(params.environment ? { environment: params.environment } : {}),
  });
  pollOpts?.onRunEnqueued?.(enq.run_id);
  const meta = await waitForWizardArtifact(enq.run_id, "wp_shopify_migration_preview", pollOpts);
  return {
    items: (Array.isArray(meta.items) ? meta.items : []) as MigrationPreviewItem[],
    total: Number(meta.total) || 0,
    page: Number(meta.page) || 1,
    per_page: Number(meta.per_page) || 50,
    ...(typeof meta.scope_note === "string" ? { scope_note: meta.scope_note } : {}),
    ...(meta.error != null ? { error: String(meta.error) } : {}),
  };
}

/** WP → Shopify migration wizard — Step 3 / launch: entity-aware run (`wp_shopify_migration_run` artifact). PDFs import to Shopify Files; blog tags are exported from WordPress; other entities reported as pending ETL. */
export type WpShopifyMigrationRunParams = WpShopifyMigrationWooRestParams & {
  brand_id: string;
  entities: string[];
  /** Per-entity WordPress/Woo IDs excluded in the wizard (same keys as step 3 sheets). */
  excluded_ids_by_entity?: Record<string, string[]>;
  max_files?: number;
  create_redirects?: boolean;
  skip_if_exists_in_shopify?: boolean;
  /** Public storefront origin (e.g. https://stigmathc.com) so tag redirect CSV can pre-fill /blogs/.../tagged/{slug}. */
  target_store_url?: string;
  /** When the store has multiple blogs, pin the blog handle used for tag URLs. */
  shopify_blog_handle?: string;
  wp_username?: string;
  wp_application_password?: string;
  environment?: string;
};
export type WpShopifyBlogMigrationRow = {
  wordpress_id: string;
  title: string;
  slug?: string;
  wordpress_url?: string;
  shopify_article_id?: string;
  shopify_admin_url?: string;
  note?: string;
  error?: string;
};

export type WpShopifyMigrationRunResult = {
  run_id: string;
  /** Set when API queued blogs/tags/ETL and PDFs as two parallel root jobs (two runners can work at once). */
  parallel_migration_jobs?: boolean;
  message?: string;
  entities?: string[];
  unsupported?: string[];
  /** WordPress tag archive URLs → suggested Shopify /blogs/{handle}/tagged/{slug} when Shopify + target URL are set. */
  blog_tag_redirect_csv?: string;
  blog_tag_redirect_csv_rows?: number;
  /** When “blogs” entity ran: per-post outcomes (verify in Shopify Admin → Content → Blog posts). */
  blog_migration?: {
    summary: { created: number; skipped: number; failed: number };
    rows: WpShopifyBlogMigrationRow[];
    truncated?: boolean;
    shopify_blog_handle?: string;
    hint?: string;
    /** public_rest = no WP app password (published only); application_password = full wp/v2 access */
    wordpress_posts_source?: "application_password" | "public_rest";
  };
};

export async function wpShopifyMigrationRun(
  params: WpShopifyMigrationRunParams,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<WpShopifyMigrationRunResult> {
  const enq = await postWpShopifyMigrationPost("/v1/wp-shopify-migration/run", {
    brand_id: params.brand_id,
    entities: params.entities,
    ...(params.excluded_ids_by_entity && Object.keys(params.excluded_ids_by_entity).length > 0
      ? { excluded_ids_by_entity: params.excluded_ids_by_entity }
      : {}),
    ...(params.max_files != null ? { max_files: params.max_files } : {}),
    ...(params.create_redirects === false ? { create_redirects: false } : {}),
    ...(params.skip_if_exists_in_shopify === true ? { skip_if_exists_in_shopify: true } : {}),
    ...(params.target_store_url?.trim() ? { target_store_url: params.target_store_url.trim() } : {}),
    ...(params.shopify_blog_handle?.trim() ? { shopify_blog_handle: params.shopify_blog_handle.trim() } : {}),
    ...(params.wp_username ? { wp_username: params.wp_username } : {}),
    ...(params.wp_application_password ? { wp_application_password: params.wp_application_password } : {}),
    ...(params.woo_server ? { woo_server: params.woo_server } : {}),
    ...(params.woo_consumer_key ? { woo_consumer_key: params.woo_consumer_key } : {}),
    ...(params.woo_consumer_secret ? { woo_consumer_secret: params.woo_consumer_secret } : {}),
    ...(params.environment ? { environment: params.environment } : {}),
  });
  pollOpts?.onRunEnqueued?.(enq.run_id);
  const meta = await waitForWizardMigrationRunMerged(enq.run_id, pollOpts);
  const byEntity = meta.by_entity && typeof meta.by_entity === "object" && !Array.isArray(meta.by_entity) ? (meta.by_entity as Record<string, unknown>) : undefined;
  const blogBlock = byEntity?.blog_tags && typeof byEntity.blog_tags === "object" && !Array.isArray(byEntity.blog_tags) ? (byEntity.blog_tags as Record<string, unknown>) : undefined;
  const blogCsv = typeof blogBlock?.redirect_csv === "string" ? blogBlock.redirect_csv : undefined;
  const blogCsvRows =
    typeof blogBlock?.tag_archive_urls_in_redirect_csv === "number"
      ? blogBlock.tag_archive_urls_in_redirect_csv
      : undefined;
  const blogsBlock = byEntity?.blogs && typeof byEntity.blogs === "object" && !Array.isArray(byEntity.blogs) ? (byEntity.blogs as Record<string, unknown>) : undefined;
  const blogRows = Array.isArray(blogsBlock?.rows) ? (blogsBlock!.rows as WpShopifyBlogMigrationRow[]) : undefined;
  const blogSummary = blogsBlock?.summary && typeof blogsBlock.summary === "object" && !Array.isArray(blogsBlock.summary) ? (blogsBlock.summary as { created?: number; skipped?: number; failed?: number }) : undefined;
  const rawWpSource = blogsBlock?.wordpress_posts_source;
  const wordpressPostsSource: "application_password" | "public_rest" | undefined =
    rawWpSource === "application_password" || rawWpSource === "public_rest" ? rawWpSource : undefined;
  const blogMigration =
    blogRows && blogSummary
      ? {
          summary: {
            created: Number(blogSummary.created) || 0,
            skipped: Number(blogSummary.skipped) || 0,
            failed: Number(blogSummary.failed) || 0,
          },
          rows: blogRows,
          ...(blogsBlock?.truncated === true ? { truncated: true } : {}),
          ...(typeof blogsBlock?.shopify_blog_handle === "string" ? { shopify_blog_handle: blogsBlock.shopify_blog_handle } : {}),
          ...(typeof blogsBlock?.hint === "string" ? { hint: blogsBlock.hint } : {}),
          ...(wordpressPostsSource ? { wordpress_posts_source: wordpressPostsSource } : {}),
        }
      : undefined;
  return {
    run_id: enq.run_id,
    ...(enq.parallel_migration_jobs === true ? { parallel_migration_jobs: true as const } : {}),
    message: typeof meta.message === "string" ? meta.message : undefined,
    entities: Array.isArray(meta.entities) ? (meta.entities as string[]) : undefined,
    unsupported: Array.isArray(meta.unsupported) ? (meta.unsupported as string[]) : undefined,
    ...(blogCsv ? { blog_tag_redirect_csv: blogCsv } : {}),
    ...(blogCsvRows != null ? { blog_tag_redirect_csv_rows: blogCsvRows } : {}),
    ...(blogMigration ? { blog_migration: blogMigration } : {}),
  };
}

/** WordPress PDF → Shopify Files (+ optional redirects). */
export type WpShopifyMigrationPdfRow = {
  wordpress_id: string;
  title: string;
  source_url: string;
  shopify_file_url?: string;
  redirect_path?: string;
  redirect_created?: boolean;
  /** e.g. matched existing Shopify file without upload */
  note?: string;
  error?: string;
};
export type WpShopifyMigrationMigratePdfsParams = WpShopifyMigrationWooRestParams & {
  brand_id: string;
  wp_username?: string;
  wp_application_password?: string;
  excluded_ids?: string[];
  /** When set, import these WordPress media IDs in preview order (matches step-3 in-scope PDFs). */
  wordpress_ids?: string[];
  create_redirects?: boolean;
  max_files?: number;
  /** Match recent Shopify Files by filename and skip fileCreate when found. */
  skip_if_exists_in_shopify?: boolean;
  environment?: string;
};
export type WpShopifyMigrationMigratePdfsResult = {
  rows: WpShopifyMigrationPdfRow[];
  redirect_csv: string;
  truncated: boolean;
  summary?: { uploaded: number; failed: number; warnings?: number; truncated: boolean };
  hint?: string;
};

function parsePdfImportArtifact(meta: Record<string, unknown>): WpShopifyMigrationMigratePdfsResult {
  const rows = meta.rows as WpShopifyMigrationPdfRow[] | undefined;
  const redirect_csv = typeof meta.redirect_csv === "string" ? meta.redirect_csv : "";
  const truncated = Boolean(meta.truncated);
  if (!Array.isArray(rows)) throw new Error("PDF artifact missing rows array");
  return {
    rows,
    redirect_csv,
    truncated,
    summary: meta.summary as WpShopifyMigrationMigratePdfsResult["summary"],
    hint: typeof meta.hint === "string" ? meta.hint : undefined,
  };
}

/** PDF import via pipeline (`wp_shopify_wizard_job` → artifact `wp_shopify_pdf_import`). */
export async function wpShopifyMigrationMigratePdfs(
  params: WpShopifyMigrationMigratePdfsParams,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<WpShopifyMigrationMigratePdfsResult> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/wp-shopify-migration/migrate_pdfs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let enq: WpShopifyWizardEnqueueResponse & { error?: string };
  try {
    enq = JSON.parse(text) as WpShopifyWizardEnqueueResponse & { error?: string };
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(enq.error ?? text);
  const runId = enq.run_id;
  if (!runId) throw new Error("migrate_pdfs did not return run_id");
  pollOpts?.onRunEnqueued?.(runId);
  const { status } = await pollRunUntilTerminal(runId, pollOpts);
  if (status !== "succeeded") await throwWpShopifyRunFailed(runId, status);
  const { items } = await getRunArtifacts(runId);
  const meta = wpShopifyArtifactMeta(items, "wp_shopify_pdf_import");
  if (!meta) throw new Error("Import succeeded but artifact wp_shopify_pdf_import was not found.");
  return parsePdfImportArtifact(meta);
}

/** Resolve CDN URLs for WordPress PDF media IDs from existing Shopify Files (no upload). Pipeline artifact `wp_shopify_pdf_resolve`. */
export type WpShopifyMigrationResolvePdfUrlsParams = Omit<
  WpShopifyMigrationMigratePdfsParams,
  "excluded_ids" | "max_files" | "skip_if_exists_in_shopify"
> & {
  wordpress_ids: string[];
};

export async function wpShopifyMigrationResolvePdfUrls(
  params: WpShopifyMigrationResolvePdfUrlsParams,
  pollOpts?: WpShopifyPipelinePollOptions,
): Promise<WpShopifyMigrationMigratePdfsResult> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/wp-shopify-migration/resolve_pdf_urls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let enq: WpShopifyWizardEnqueueResponse & { error?: string };
  try {
    enq = JSON.parse(text) as WpShopifyWizardEnqueueResponse & { error?: string };
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(enq.error ?? text);
  const runId = enq.run_id;
  if (!runId) throw new Error("resolve_pdf_urls did not return run_id");
  pollOpts?.onRunEnqueued?.(runId);
  const { status } = await pollRunUntilTerminal(runId, pollOpts);
  if (status !== "succeeded") await throwWpShopifyRunFailed(runId, status);
  const { items } = await getRunArtifacts(runId);
  const meta = wpShopifyArtifactMeta(items, "wp_shopify_pdf_resolve");
  if (!meta) throw new Error("Resolve succeeded but artifact wp_shopify_pdf_resolve was not found.");
  return parsePdfImportArtifact(meta);
}

export type EmailTemplateRow = {
  id: string;
  type: string;
  name: string;
  image_url: string | null;
  mjml: string | null;
  template_json: unknown;
  sections_json: unknown;
  img_count: number;
  /** Content image slots ([image 1], [image 2], …). From contract or MJML. For picker and validation. */
  image_slots?: number;
  /** Product slots (max product_N). From contract or MJML. Used by wizard to validate selection. */
  product_slots?: number;
  /** e.g. "newsletter (email template)". Shown when picking templates. */
  layout_style?: string;
  brand_profile_id?: string | null;
  /** Ordered list of email_component_library IDs this template is composed from. */
  component_sequence?: string[] | null;
  created_at: string;
  updated_at: string;
};

/** Single row from email component library (for "Components used" on template detail). */
export type EmailComponentRow = {
  id: string;
  component_type: string;
  name: string;
  position: number;
  use_context?: string;
  description?: string | null;
};

export async function getEmailComponentLibrary(params?: { limit?: number }): Promise<{ items: EmailComponentRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`${controlPlaneApiBase()}/v1/email_component_library?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Pexels API proxy (search photos). */
export async function pexelsSearch(params: { q: string; per_page?: number; page?: number }): Promise<{
  page: number;
  per_page: number;
  photos: Array<{
    id: number;
    src: { original: string; medium: string; large: string; large2x: string };
    alt: string;
    photographer: string;
    photographer_url: string;
  }>;
  total_results: number;
  next_page?: string;
  prev_page?: string;
}> {
  const sp = new URLSearchParams();
  sp.set("q", params.q.trim() || "nature");
  if (params.per_page) sp.set("per_page", String(params.per_page));
  if (params.page) sp.set("page", String(params.page));
  const res = await fetch(`${controlPlaneApiBase()}/v1/pexels/search?${sp}`);
  const text = await res.text();
  if (!res.ok) {
    if (text.trimStart().startsWith("<") || res.headers.get("content-type")?.includes("text/html")) {
      throw new Error("Pexels search unavailable. Ensure the Control Plane is running and NEXT_PUBLIC_CONTROL_PLANE_API is set to its URL (e.g. http://localhost:3001).");
    }
    throw new Error(text || res.statusText);
  }
  try {
    return JSON.parse(text) as Awaited<ReturnType<typeof pexelsSearch>>;
  } catch {
    throw new Error("Pexels search unavailable. Check Control Plane is running and NEXT_PUBLIC_CONTROL_PLANE_API is correct.");
  }
}

/** Copy image from URL (e.g. Pexels) to our CDN; returns stable URL for emails. */
export async function copyCampaignImageToCdn(url: string): Promise<{ cdn_url: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/campaign-images/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Copy to CDN failed");
  }
  return res.json();
}

export async function getEmailTemplates(params?: { type?: string; brand_profile_id?: string; limit?: number; offset?: number }): Promise<{ items: EmailTemplateRow[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.type) searchParams.set("type", params.type);
  if (params?.brand_profile_id) searchParams.set("brand_profile_id", params.brand_profile_id);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const res = await fetch(`${controlPlaneApiBase()}/v1/email_templates?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getEmailTemplate(id: string): Promise<EmailTemplateRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/email_templates/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** URL for HTML preview of an email template. */
export function getEmailTemplatePreviewUrl(id: string): string {
  return `${controlPlaneApiBase()}/v1/email_templates/${id}/preview`;
}

/** Fetch rendered HTML for template preview (use in iframe srcdoc to avoid cross-origin issues). */
export async function fetchEmailTemplatePreviewHtml(id: string): Promise<string> {
  const res = await fetch(getEmailTemplatePreviewUrl(id));
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

/** Delete an email template. */
export async function deleteEmailTemplate(id: string): Promise<{ deleted: boolean; id: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/email_templates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Brand Engine --

export type BrandProfileRow = {
  id: string;
  name: string;
  slug: string;
  brand_theme_id?: string | null;
  identity: Record<string, unknown>;
  tone: Record<string, unknown>;
  visual_style: Record<string, unknown>;
  copy_style: Record<string, unknown>;
  design_tokens: Record<string, unknown>;
  deck_theme: Record<string, unknown>;
  report_theme: Record<string, unknown>;
  style_dimensions?: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

export type BrandEmbeddingRow = {
  id: string;
  brand_profile_id: string;
  embedding_type: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type BrandAssetRow = {
  id: string;
  brand_profile_id: string;
  asset_type: string;
  uri: string;
  filename?: string;
  mime_type?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type DocumentTemplateRow = {
  id: string;
  brand_profile_id?: string;
  template_type: string;
  name: string;
  description?: string;
  template_config: Record<string, unknown>;
  component_sequence: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
  components?: DocumentComponentRow[];
};

export type DocumentComponentRow = {
  id: string;
  template_id: string;
  component_type: string;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
};

export async function getBrandProfiles(params?: { status?: string; search?: string; limit?: number; offset?: number }): Promise<{ items: BrandProfileRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.search) sp.set("search", params.search);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getBrandProfile(id: string): Promise<BrandProfileRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type BrandUsageRow = {
  initiatives_count: number;
  runs_count: number;
  last_run_at: string | null;
  document_templates_count: number;
  email_templates_count: number;
};

export async function getBrandUsage(brandProfileId: string): Promise<BrandUsageRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${brandProfileId}/usage`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Prefill brand form from live URL: fetches site and extracts colors, fonts, logo, sitemap, tagline, industry. */
export type BrandPrefillFromUrlResult = {
  name: string;
  website: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  font_headings: string | null;
  font_body: string | null;
  sitemap_url: string | null;
  sitemap_type: string;
  title: string | null;
  meta_description: string | null;
  tagline: string | null;
  industry: string | null;
  raw_colors: string[];
  raw_fonts: string[];
};

export async function prefillBrandFromUrl(url: string): Promise<BrandPrefillFromUrlResult> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/prefill_from_url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBrandProfile(body: { name: string; identity?: Record<string, unknown>; tone?: Record<string, unknown>; visual_style?: Record<string, unknown>; copy_style?: Record<string, unknown>; design_tokens?: Record<string, unknown>; deck_theme?: Record<string, unknown>; report_theme?: Record<string, unknown> }): Promise<BrandProfileRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateBrandProfile(id: string, body: Partial<BrandProfileRow>): Promise<BrandProfileRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBrandProfile(id: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getBrandEmbeddings(brandId: string, params?: { embedding_type?: string; limit?: number }): Promise<{ items: BrandEmbeddingRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.embedding_type) sp.set("embedding_type", params.embedding_type);
  if (params?.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${brandId}/embeddings?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBrandEmbedding(brandId: string, body: { content: string; embedding_type: string; metadata?: Record<string, unknown> }): Promise<BrandEmbeddingRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${brandId}/embeddings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBrandEmbedding(brandId: string, embeddingId: string): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${brandId}/embeddings/${embeddingId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function getBrandAssets(brandId: string): Promise<{ items: BrandAssetRow[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${brandId}/assets`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBrandAsset(brandId: string, body: { asset_type: string; uri: string; filename?: string; mime_type?: string }): Promise<BrandAssetRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${brandId}/assets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBrandAsset(brandId: string, assetId: string): Promise<void> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/brand_profiles/${brandId}/assets/${assetId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function getDocumentTemplates(params?: { brand_profile_id?: string; template_type?: string; limit?: number }): Promise<{ items: DocumentTemplateRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.brand_profile_id) sp.set("brand_profile_id", params.brand_profile_id);
  if (params?.template_type) sp.set("template_type", params.template_type);
  if (params?.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`${controlPlaneApiBase()}/v1/document_templates?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplateRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/document_templates/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDocumentTemplate(body: { brand_profile_id?: string; template_type: string; name: string; description?: string; template_config?: Record<string, unknown>; component_sequence?: unknown[] }): Promise<DocumentTemplateRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/document_templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateDocumentTemplate(id: string, body: Partial<DocumentTemplateRow>): Promise<DocumentTemplateRow> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/document_templates/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDocumentTemplate(id: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/document_templates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** v1 slice funnel: campaign → lead → revenue counts. */
export async function getV1SliceFunnel(): Promise<{
  campaigns: number;
  leads: number;
  orders: number;
  revenue_events: number;
  revenue_total: number | null;
  events_by_type: Record<string, number>;
}> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/v1_slice/funnel`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/decision_loop/observe — anomalies and baselines (read-only). */
export async function getDecisionLoopObserve(): Promise<{
  anomalies: Array<{ kpi_key: string; current: number; baseline: number; deviation_pct?: number }>;
  baselines: Array<{ kpi_key: string; value: number }>;
}> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/decision_loop/observe`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/decision_loop/tick — run one tick (observe → diagnose → decide → [act] → learn). */
export async function postDecisionLoopTick(body?: { auto_act?: boolean; compute_baselines?: boolean }): Promise<{
  observed: { anomalies: unknown[] };
  diagnosed?: unknown;
  decided?: unknown;
  acted?: unknown;
  learned?: unknown;
  baselines_computed?: number;
}> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/decision_loop/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/deploy_events/:id/repair_plan — deploy details and repair plan. */
export async function getDeployEventRepairPlan(deployId: string): Promise<{
  deploy_id: string;
  service_id: string;
  commit_sha: string | null;
  status: string;
  failure_class: string | null;
  error_signature: string | null;
  change_event_id: string | null;
  suggested_actions: Array<{ action_id: string; action_key: string; label: string; description: string | null; risk_level: string; requires_approval: boolean }>;
  similar_incidents: unknown[];
  build_config_snapshot: { dependencies_json: unknown; externals_json: unknown; created_at: string } | null;
  suggested_file_actions: { suggested_files: string[]; unresolved_path: string | null };
}> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/deploy_events/${encodeURIComponent(deployId)}/repair_plan`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/deploy_events — list deploy events. */
export async function getDeployEvents(params?: { service_id?: string; status?: string; limit?: number }): Promise<{
  items: Array<{
    deploy_id: string;
    change_event_id: string | null;
    service_id: string;
    commit_sha: string | null;
    status: string;
    failure_class: string | null;
    error_signature: string | null;
    external_deploy_id: string | null;
    created_at: string;
  }>;
}> {
  const sp = new URLSearchParams();
  if (params?.service_id) sp.set("service_id", params.service_id);
  if (params?.status) sp.set("status", params.status);
  if (params?.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`${controlPlaneApiBase()}/v1/deploy_events?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/deploy_events/sync — sync from Render API. */
export async function postDeployEventsSync(): Promise<{ synced: number; message?: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/deploy_events/sync`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/deploy_events/sync_github — sync from GitHub Actions. */
export async function postDeployEventsSyncGitHub(): Promise<{ synced: number; message?: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/deploy_events/sync_github`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/render/status — live Render service status for dashboard. */
export type RenderServiceStatus = {
  id: string;
  name: string;
  slug?: string;
  dashboardUrl: string;
  environment: "staging" | "prod";
  latestDeploy: { id: string; status: string; commit?: string; updatedAt?: string } | null;
};

export async function getRenderStatus(): Promise<{ services: RenderServiceStatus[]; message?: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/render/status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/import_graph — latest import graph snapshot for a service. */
export async function getImportGraph(serviceId: string): Promise<{
  snapshot_id: string;
  service_id: string;
  snapshot_json: unknown;
  created_at: string;
} | null> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/import_graph?service_id=${encodeURIComponent(serviceId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/import_graph — store import graph snapshot. */
export async function postImportGraph(serviceId: string, snapshotJson: unknown): Promise<{ snapshot_id: string; service_id: string; created_at: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/import_graph`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service_id: serviceId, snapshot_json: snapshotJson }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/schema_drift — current schema vs stored snapshot. */
export async function getSchemaDrift(params?: { environment_a?: string; environment_b?: string }): Promise<{
  current_schema?: unknown;
  stored_snapshot?: unknown;
  diff?: unknown;
}> {
  const sp = params ? new URLSearchParams(params) : new URLSearchParams();
  const res = await fetch(`${controlPlaneApiBase()}/v1/schema_drift?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/schema_snapshots/capture — store current schema as snapshot. */
export async function postSchemaSnapshotsCapture(environment: string): Promise<{ schema_snapshot_id: string; environment: string; created_at: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/schema_snapshots/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ environment }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/contract_breakage_scan — plan nodes with schema refs (contracts at risk). */
export async function getContractBreakageScan(params?: { scope_key?: string }): Promise<{
  scope_key: string | null;
  contracts: Array<{ plan_node_id: string; plan_id: string; node_key: string; job_type?: string; input_schema_ref?: string | null; output_schema_ref?: string | null }>;
  message?: string;
}> {
  const sp = params?.scope_key ? `?scope_key=${encodeURIComponent(params.scope_key)}` : "";
  const res = await fetch(`${controlPlaneApiBase()}/v1/contract_breakage_scan${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/change_events/:id/backfill_plan — suggested backfill steps. */
export async function getChangeEventBackfillPlan(changeEventId: string): Promise<{ steps: unknown[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/change_events/${changeEventId}/backfill_plan`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/incident_memory — list incident memory. */
export async function getIncidentMemory(params?: { limit?: number; failure_class?: string }): Promise<{
  items: Array<{ memory_id: string; failure_signature?: string; failure_class?: string; resolution?: string; confidence?: number; times_seen?: number; last_seen_at?: string; created_at?: string }>;
  limit: number;
}> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.failure_class) sp.set("failure_class", params.failure_class);
  const res = await fetch(`${controlPlaneApiBase()}/v1/incident_memory?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/memory/lookup — similar incidents by signature. */
export async function getMemoryLookup(params: { signature?: string; limit?: number }): Promise<{ similar_incidents: unknown[]; memory_entries: unknown[] }> {
  const sp = new URLSearchParams();
  if (params.signature) sp.set("signature", params.signature);
  if (params.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`${controlPlaneApiBase()}/v1/memory/lookup?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/checkpoints — list graph checkpoints. */
export async function getCheckpoints(params?: { limit?: number; scope_type?: string; scope_id?: string }): Promise<{
  items: Array<{ checkpoint_id: string; scope_type: string; scope_id: string; run_id?: string | null; schema_snapshot_artifact_id?: string | null; contract_snapshot_artifact_id?: string | null; config_snapshot_artifact_id?: string | null; created_at: string }>;
  limit: number;
}> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.scope_type) sp.set("scope_type", params.scope_type);
  if (params?.scope_id) sp.set("scope_id", params.scope_id);
  const res = await fetch(`${controlPlaneApiBase()}/v1/checkpoints?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/checkpoints/:id — single checkpoint. */
export async function getCheckpoint(id: string): Promise<{ checkpoint_id: string; scope_type: string; scope_id: string; run_id?: string | null; created_at: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/checkpoints/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/checkpoints/:id/diff — diff between checkpoint and current. */
export async function getCheckpointDiff(id: string): Promise<{
  checkpoint_id: string; scope_type: string; scope_id: string; created_at: string;
  current_schema?: unknown; current_tables?: unknown[]; current_columns?: unknown[];
  snapshot_artifact_id?: string | null; snapshot_diff?: unknown;
}> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/checkpoints/${encodeURIComponent(id)}/diff`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/checkpoints — create checkpoint. */
export async function postCheckpoint(body: { scope_type: string; scope_id: string; run_id?: string }): Promise<{ checkpoint_id: string; scope_type: string; scope_id: string; created_at: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/checkpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/failure_clusters — failure_class counts. */
export async function getFailureClusters(params?: { limit?: number }): Promise<{
  clusters: Array<{ failure_class: string; count: string; last_seen?: string }>;
}> {
  const sp = params?.limit ? `?limit=${params.limit}` : "";
  const res = await fetch(`${controlPlaneApiBase()}/v1/failure_clusters${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/change_events — list change events. */
export async function getChangeEvents(params?: { limit?: number; offset?: number }): Promise<{
  items: Array<{ change_event_id: string; source_type?: string; source_ref?: string; change_class?: string; summary?: string | null; diff_artifact_id?: string | null; created_at: string }>;
  limit: number;
  offset: number;
}> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const res = await fetch(`${controlPlaneApiBase()}/v1/change_events?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/change_events/:id — single change event. */
export async function getChangeEvent(id: string): Promise<{ change_event_id: string; source_type?: string; source_ref?: string; change_class?: string; summary?: string | null; created_at: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/change_events/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/change_events/:id/impacts — list graph impacts for change event. */
export async function getChangeEventImpacts(id: string): Promise<{ items: Array<{ impact_id: string; change_event_id: string; run_id?: string; plan_id?: string; plan_node_id?: string; artifact_id?: string; impact_type?: string; reason?: string }> }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/change_events/${encodeURIComponent(id)}/impacts`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/change_events/:id/impact — compute impacts (stub). */
export async function postChangeEventImpact(id: string): Promise<{ change_event_id: string; impacts: unknown[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/change_events/${encodeURIComponent(id)}/impact`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/topology/:planId — plan node graph. */
export async function getGraphTopology(planId: string): Promise<{ plan_id: string; nodes: unknown[]; edges: unknown[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/graph/topology/${encodeURIComponent(planId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/frontier/:runId — run frontier. */
export async function getGraphFrontier(runId: string): Promise<{ run_id: string; completed_node_ids: string[]; pending_node_ids: string[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/graph/frontier/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/repair_plan/:runId/:nodeId — repair plan for failed node. */
export async function getGraphRepairPlan(runId: string, nodeId: string): Promise<{
  run_id: string;
  node_id: string;
  suggested_actions: unknown[];
  subgraph_replay_scope: unknown[];
  error_signature?: string | null;
}> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/graph/repair_plan/${encodeURIComponent(runId)}/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/graph/subgraph_replay — trigger subgraph replay. */
export async function postGraphSubgraphReplay(body: {
  run_id: string;
  node_ids?: string[];
  /** Reserved for future partial subgraph replay; control plane currently creates a full-plan replay run. */
  root_node_id?: string;
}): Promise<{ run_id: string | null; replayed: number; message?: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/graph/subgraph_replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/migration_guard — analyze migration SQL. */
export async function postMigrationGuard(body: { sql?: string; migration_ref?: string }): Promise<{ tables_touched: unknown[]; columns: unknown[]; risks: unknown[]; checkpoint_suggestion: unknown; raw?: string | null }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/migration_guard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/audit/:runId — graph audit. */
export async function getGraphAudit(runId: string): Promise<{ run_id: string; issues: unknown[]; summary: unknown }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/graph/audit/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/missing_capabilities/:planId — missing capabilities. */
export async function getGraphMissingCapabilities(planId: string): Promise<{ plan_id: string; missing: unknown[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/graph/missing_capabilities/${encodeURIComponent(planId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/lineage/:artifactId — artifact lineage. */
export async function getGraphLineage(artifactId: string): Promise<{ artifact_id: string; producers: unknown[]; consumers: unknown[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/graph/lineage/${encodeURIComponent(artifactId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/baselines/compute — compute KPI baselines. */
export async function postBaselinesCompute(): Promise<{ baselines: number; items: unknown[] }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/baselines/compute`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ——— Klaviyo operator pack ———
export async function getKlaviyoTemplates(brand_profile_id?: string): Promise<{ items: { id: string; brand_profile_id: string; artifact_id: string; klaviyo_template_id: string; sync_state: string; last_synced_at: string | null; last_error: string | null; created_at: string }[] }> {
  const url = brand_profile_id ? `${controlPlaneApiBase()}/v1/klaviyo/templates?brand_profile_id=${encodeURIComponent(brand_profile_id)}` : `${controlPlaneApiBase()}/v1/klaviyo/templates`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKlaviyoCampaigns(brand_profile_id?: string): Promise<{ items: { id: string; initiative_id: string | null; run_id: string | null; artifact_id: string; brand_profile_id: string; klaviyo_campaign_id: string; send_job_id: string | null; sync_state: string; scheduled_at: string | null; last_error: string | null; created_at: string }[] }> {
  const url = brand_profile_id ? `${controlPlaneApiBase()}/v1/klaviyo/campaigns?brand_profile_id=${encodeURIComponent(brand_profile_id)}` : `${controlPlaneApiBase()}/v1/klaviyo/campaigns`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKlaviyoFlows(brand_profile_id?: string): Promise<{ items: { id: string; brand_profile_id: string; flow_type: string; klaviyo_flow_id: string; sync_state: string; last_remote_status: string | null; last_error: string | null; created_at: string }[] }> {
  const url = brand_profile_id ? `${controlPlaneApiBase()}/v1/klaviyo/flows?brand_profile_id=${encodeURIComponent(brand_profile_id)}` : `${controlPlaneApiBase()}/v1/klaviyo/flows`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postKlaviyoCampaignsPush(body: { initiative_id?: string; run_id?: string; artifact_id: string; schedule_at?: string; audience_list_ids?: string[] }): Promise<{ template_id: string; campaign_id: string; send_job_id?: string; sync_state: string; klaviyo_sent_campaigns_id: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/klaviyo/campaigns/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postKlaviyoFlows(body: { brand_profile_id: string; flow_type: string; flow_name?: string; template_ids?: string[]; delays_minutes?: number[] }): Promise<{ flow_id: string; sync_state: string; klaviyo_flow_sync_id: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/klaviyo/flows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchKlaviyoFlowStatus(flowId: string, body: { status: "draft" | "manual" | "live"; brand_profile_id?: string; approved_by?: string }): Promise<{ flow_id: string; status: string }> {
  const res = await fetch(`${controlPlaneApiBase()}/v1/klaviyo/flows/${encodeURIComponent(flowId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  getRuns, getRun, getInitiatives, getInitiative, createInitiative, updateInitiative, getPlans, getPlan,
  getJobRuns, getJobRun, getArtifacts, getArtifact, getToolCalls, getApprovals,
  getPendingApprovals, getApproval, rerunRun, cancelRun, getLlmCalls, getUsage,
  getAgentMemory, getAgentMemoryById, getMcpServers, getMcpServer, createMcpServer,
  deleteMcpServer, testMcpServer, getJobRunLlmCalls, getRoutingPolicies, getUsageByJobType,
  getBrandProfiles, getBrandProfile, createBrandProfile, updateBrandProfile, deleteBrandProfile,
  getBrandEmbeddings, createBrandEmbedding, deleteBrandEmbedding, getBrandAssets, createBrandAsset, deleteBrandAsset,
  getDocumentTemplates, getDocumentTemplate, createDocumentTemplate, updateDocumentTemplate, deleteDocumentTemplate,
  getV1SliceFunnel,
  getDecisionLoopObserve, postDecisionLoopTick,
  getDeployEvents, getDeployEventRepairPlan, postDeployEventsSync, postDeployEventsSyncGitHub,
  getImportGraph, postImportGraph,
  getSchemaDrift, postSchemaSnapshotsCapture,   getContractBreakageScan, getChangeEventBackfillPlan,
  getIncidentMemory, getMemoryLookup,
  getCheckpoints, getCheckpoint, getCheckpointDiff, postCheckpoint,
  getFailureClusters,
  getChangeEvents, getChangeEvent, getChangeEventImpacts, postChangeEventImpact,
  getGraphTopology, getGraphFrontier, getGraphRepairPlan, postGraphSubgraphReplay,
  postMigrationGuard, getGraphAudit, getGraphMissingCapabilities, getGraphLineage,
  postBaselinesCompute,
  getKlaviyoTemplates, getKlaviyoCampaigns, getKlaviyoFlows,
  postKlaviyoCampaignsPush, postKlaviyoFlows, patchKlaviyoFlowStatus,
};
