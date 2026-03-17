/**
 * Control Plane API client. Use with React Query hooks.
 */
const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

/** User-friendly message when Control Plane is unreachable (e.g. wrong API URL on Vercel). */
export function formatApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ENETUNREACH") || msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "Cannot reach the Control Plane API. If this app is deployed, set NEXT_PUBLIC_CONTROL_PLANE_API to your deployed API URL (e.g. your Render service URL) and ensure CORS allows this origin.";
  }
  if (msg.includes("404") || msg.includes("Not Found")) return "The requested resource was not found.";
  if (msg.includes("Database schema not applied") || (msg.includes("relation ") && msg.includes(" does not exist"))) {
    return "Control Plane database schema is missing. Run migrations against the same DB the API uses (see docs/runbooks/console-db-relation-does-not-exist.md).";
  }
  return msg;
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
  const res = await fetch(`${API}/v1/runs?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRun(id: string): Promise<RunRow & { job_runs?: unknown[] }> {
  const res = await fetch(`${API}/v1/runs/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRunStatus(id: string): Promise<{ status: string }> {
  const res = await fetch(`${API}/v1/runs/${id}/status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRunArtifacts(runId: string): Promise<{ items: ArtifactRow[] }> {
  const res = await fetch(`${API}/v1/runs/${runId}/artifacts`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getInitiatives(params?: { intent_type?: string; risk_level?: string; limit?: number }): Promise<{ items: InitiativeRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.intent_type) searchParams.set("intent_type", params.intent_type);
  if (params?.risk_level) searchParams.set("risk_level", params.risk_level);
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  const res = await fetch(`${API}/v1/initiatives?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getInitiative(id: string): Promise<InitiativeRow> {
  const res = await fetch(`${API}/v1/initiatives/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateInitiative(
  id: string,
  body: Partial<{ intent_type: string; title: string | null; risk_level: string; source_ref: string; goal_metadata: Record<string, unknown> }>,
): Promise<InitiativeRow> {
  const res = await fetch(`${API}/v1/initiatives/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/initiatives/:id/google_connected — whether initiative has Google OAuth credentials (for SEO). */
export async function getInitiativeGoogleConnected(id: string): Promise<{ connected: boolean }> {
  const res = await fetch(`${API}/v1/initiatives/${id}/google_connected`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** DELETE /v1/initiatives/:id/google_credentials — disconnect Google for this initiative (legacy only). */
export async function deleteInitiativeGoogleCredentials(id: string): Promise<void> {
  const res = await fetch(`${API}/v1/initiatives/${id}/google_credentials`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** GET /v1/brand_profiles/:id/google_connected — whether brand has Google OAuth credentials (GSC/GA4) and selected GA4 property. */
export async function getBrandGoogleConnected(id: string): Promise<{ connected: boolean; ga4_property_id?: string }> {
  const res = await fetch(`${API}/v1/brand_profiles/${id}/google_connected`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/seo/google_ga4_properties?brand_id= or /v1/brand_profiles/:id/google_ga4_properties — list GA4 properties for the connected Google account. */
export async function getBrandGoogleGa4Properties(id: string): Promise<{ properties: { propertyId: string; displayName: string; accountDisplayName?: string }[] }> {
  const res = await fetch(`${API}/v1/seo/google_ga4_properties?brand_id=${encodeURIComponent(id)}`);
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
  const res = await fetch(`${API}/v1/brand_profiles/${id}/google_ga4_property`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** DELETE /v1/brand_profiles/:id/google_credentials — disconnect Google for this brand. */
export async function deleteBrandGoogleCredentials(id: string): Promise<void> {
  const res = await fetch(`${API}/v1/brand_profiles/${id}/google_credentials`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** GET /v1/brand_profiles/:id/klaviyo_connected — whether brand has Klaviyo credentials. */
export async function getBrandKlaviyoConnected(id: string): Promise<{ connected: boolean }> {
  const res = await fetch(`${API}/v1/brand_profiles/${id}/klaviyo_connected`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** PUT /v1/brand_profiles/:id/klaviyo_credentials — set Klaviyo API key and optional default list. */
export async function putBrandKlaviyoCredentials(id: string, body: { api_key: string; default_list_id?: string }): Promise<void> {
  const res = await fetch(`${API}/v1/brand_profiles/${id}/klaviyo_credentials`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

/** DELETE /v1/brand_profiles/:id/klaviyo_credentials — disconnect Klaviyo for this brand. */
export async function deleteBrandKlaviyoCredentials(id: string): Promise<void> {
  const res = await fetch(`${API}/v1/brand_profiles/${id}/klaviyo_credentials`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function createInitiative(body: { intent_type: string; title?: string | null; risk_level: string; source_ref?: string; brand_profile_id?: string | null }): Promise<InitiativeRow> {
  const res = await fetch(`${API}/v1/initiatives`, {
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
  const res = await fetch(`${API}/v1/build_specs?initiative_id=${encodeURIComponent(initiativeId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getBuildSpec(id: string): Promise<BuildSpecRow> {
  const res = await fetch(`${API}/v1/build_specs/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBuildSpec(body: {
  initiative_id: string;
  spec: Record<string, unknown>;
  extended?: boolean;
}): Promise<{ build_spec_id: string; launch_id: string; launch: LaunchRow }> {
  const res = await fetch(`${API}/v1/build_specs`, {
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
  const res = await fetch(`${API}/v1/build_specs/from_strategy`, {
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
  const res = await fetch(`${API}/v1/launches?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getLaunch(id: string): Promise<LaunchRow> {
  const res = await fetch(`${API}/v1/launches/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postLaunchAction(
  action: string,
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/v1/launches/actions/${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(inputs),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? await res.text());
  return data;
}

export async function postLaunchValidate(launchId: string): Promise<{ passed: boolean; checks?: unknown[] }> {
  const res = await fetch(`${API}/v1/launches/${launchId}/validate`, {
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
  const res = await fetch(`${API}/v1/pipelines/draft`, {
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
  const res = await fetch(`${API}/v1/pipelines/drafts`, {
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
  const res = await fetch(`${API}/v1/pipelines/drafts${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/pipelines/drafts/:id — load a saved draft (returns draft + lint). */
export async function getPipelineDraft(id: string): Promise<{ draft: PipelineDraft; name: string | null; lint: PipelineLintResult }> {
  const res = await fetch(`${API}/v1/pipelines/drafts/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/pipelines/templates — save draft as pattern override (V2). */
export async function savePipelineTemplate(patternKey: string, draft: PipelineDraft): Promise<{ ok: boolean; pattern_key: string }> {
  const res = await fetch(`${API}/v1/pipelines/templates`, {
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
  const res = await fetch(`${API}/v1/pipelines/drafts/compose`, {
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
  const res = await fetch(`${API}/v1/initiatives/${initiativeId}/plan/from-draft`, {
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
  const res = await fetch(`${API}/v1/plans?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPlan(id: string): Promise<PlanRow> {
  const res = await fetch(`${API}/v1/plans/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/plans/:id/start — create a run for this plan. Returns run id. */
export async function startPlanRun(planId: string, options?: { environment?: "sandbox" | "staging" | "prod" }): Promise<{ id: string }> {
  const res = await fetch(`${API}/v1/plans/${planId}/start`, {
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
  const res = await fetch(`${API}/v1/artifacts?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getArtifact(id: string): Promise<ArtifactRow> {
  const res = await fetch(`${API}/v1/artifacts/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/artifacts/:id/content — raw body (HTML or text) for edit/preview. */
export async function getArtifactContent(id: string): Promise<string> {
  const res = await fetch(`${API}/v1/artifacts/${id}/content`);
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

/** PATCH /v1/artifacts/:id — update content and/or metadata (Phase 5 email edit). */
export async function updateArtifact(id: string, payload: UpdateArtifactPayload): Promise<ArtifactRow> {
  const res = await fetch(`${API}/v1/artifacts/${id}`, {
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
  const res = await fetch(`${API}/v1/job_runs?${searchParams}`);
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
  const res = await fetch(`${API}/v1/tool_calls?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return { items: data.items ?? [] };
}

export async function getApprovals(params?: { status?: string; limit?: number }): Promise<{ items: ApprovalRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 50));
  const res = await fetch(`${API}/v1/approvals?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPendingApprovals(): Promise<{ items: ApprovalRow[] }> {
  const res = await fetch(`${API}/v1/approvals/pending`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getApproval(id: string): Promise<ApprovalRow> {
  const res = await fetch(`${API}/v1/approvals/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function rerunRun(id: string): Promise<{ id: string }> {
  const res = await fetch(`${API}/v1/runs/${id}/rerun`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cancelRun(id: string, reason?: string): Promise<{ id: string; status: string; cancelled_at?: string }> {
  const res = await fetch(`${API}/v1/runs/${id}/cancel`, {
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
  const res = await fetch(`${API}/v1/llm_calls?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getUsage(params?: { from?: string; to?: string }): Promise<UsageAggregate> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  const res = await fetch(`${API}/v1/usage?${searchParams}`);
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
  const res = await fetch(`${API}/v1/agent_memory?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAgentMemoryById(id: string): Promise<AgentMemoryRow> {
  const res = await fetch(`${API}/v1/agent_memory/${id}`);
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
  const res = await fetch(`${API}/v1/mcp_servers?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMcpServer(id: string): Promise<McpServerRow> {
  const res = await fetch(`${API}/v1/mcp_servers/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createMcpServer(body: { name: string; server_type: string; url_or_cmd: string; args_json?: unknown; capabilities?: string[] }): Promise<McpServerRow> {
  const res = await fetch(`${API}/v1/mcp_servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "admin" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteMcpServer(id: string): Promise<void> {
  const res = await fetch(`${API}/v1/mcp_servers/${id}`, { method: "DELETE", headers: { "x-role": "admin" } });
  if (!res.ok) throw new Error(await res.text());
}

export async function testMcpServer(id: string): Promise<{ reachable?: boolean; status?: number; message?: string }> {
  const res = await fetch(`${API}/v1/mcp_servers/${id}/test`, { method: "POST" });
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
  const res = await fetch(`${API}/v1/job_runs/${jobRunId}/llm_calls`);
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
  const res = await fetch(`${API}/v1/routing_policies`);
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
  const res = await fetch(`${API}/v1/webhook_outbox?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchWebhookOutbox(id: string, body: { status?: string; attempt_count?: number; last_error?: string; next_retry_at?: string | null; sent_at?: string | null }): Promise<WebhookOutboxRow> {
  const res = await fetch(`${API}/v1/webhook_outbox/${id}`, {
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
  const res = await fetch(`${API}/v1/llm_budgets?${searchParams}`);
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
  const res = await fetch(`${API}/v1/usage/by_job_type?${searchParams}`);
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
  const res = await fetch(`${API}/v1/analytics?${searchParams}`);
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
  const res = await fetch(`${API}/v1/email_designs?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getEmailCampaign(id: string): Promise<EmailCampaignRow & { reply_to?: string | null; metadata_json?: unknown }> {
  const res = await fetch(`${API}/v1/email_designs/${id}`);
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
  const res = await fetch(`${API}/v1/email_designs`, {
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
  const res = await fetch(`${API}/v1/email_designs/${id}`, {
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
  const res = await fetch(`${API}/v1/sitemap/products`, {
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
  const res = await fetch(`${API}/v1/products/from_url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** SEO migration wizard — Step 1: crawl source site (every live URL; optional link-following for WordPress). */
export type SeoMigrationCrawlParams = {
  source_url: string;
  use_link_crawl?: boolean;
  max_urls?: number;
  crawl_delay_ms?: number;
  fetch_page_details?: boolean;
};

export type SeoMigrationCrawlResult = {
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

export async function seoMigrationCrawl(params: SeoMigrationCrawlParams): Promise<SeoMigrationCrawlResult> {
  const res = await fetch(`${API}/v1/seo/migration/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** SEO migration wizard — Step 2: Google Search Console report. */
export type SeoGscReportParams = { site_url: string; date_range?: string; row_limit?: number };
export type SeoGscReport = {
  site_url: string;
  date_range: { start: string; end: string };
  pages: Array<{ url: string; clicks: number; impressions: number; ctr: number; position: number }>;
  queries: Array<{ query: string; clicks: number; impressions: number }>;
  error?: string;
};

export async function seoGscReport(params: SeoGscReportParams): Promise<SeoGscReport> {
  const res = await fetch(`${API}/v1/seo/gsc_report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** SEO migration wizard — Step 2: GA4 report. */
export type SeoGa4ReportParams = { property_id: string; row_limit?: number };
export type SeoGa4Report = {
  property_id: string;
  pages: Array<{
    full_page_url?: string;
    page_path?: string;
    sessions: number;
    screen_page_views?: number;
    user_engagement_duration?: number;
  }>;
  error?: string;
};

export async function seoGa4Report(params: SeoGa4ReportParams): Promise<SeoGa4Report> {
  const res = await fetch(`${API}/v1/seo/ga4_report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
  const res = await fetch(`${API}/v1/email_component_library?${sp}`);
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
  const res = await fetch(`${API}/v1/pexels/search?${sp}`);
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
  const res = await fetch(`${API}/v1/campaign-images/copy`, {
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
  const res = await fetch(`${API}/v1/email_templates?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getEmailTemplate(id: string): Promise<EmailTemplateRow> {
  const res = await fetch(`${API}/v1/email_templates/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** URL for HTML preview of an email template. */
export function getEmailTemplatePreviewUrl(id: string): string {
  return `${API}/v1/email_templates/${id}/preview`;
}

/** Fetch rendered HTML for template preview (use in iframe srcdoc to avoid cross-origin issues). */
export async function fetchEmailTemplatePreviewHtml(id: string): Promise<string> {
  const res = await fetch(getEmailTemplatePreviewUrl(id));
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

/** Delete an email template. */
export async function deleteEmailTemplate(id: string): Promise<{ deleted: boolean; id: string }> {
  const res = await fetch(`${API}/v1/email_templates/${id}`, { method: "DELETE" });
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
  const res = await fetch(`${API}/v1/brand_profiles?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getBrandProfile(id: string): Promise<BrandProfileRow> {
  const res = await fetch(`${API}/v1/brand_profiles/${id}`);
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
  const res = await fetch(`${API}/v1/brand_profiles/${brandProfileId}/usage`);
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
  const res = await fetch(`${API}/v1/brand_profiles/prefill_from_url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBrandProfile(body: { name: string; identity?: Record<string, unknown>; tone?: Record<string, unknown>; visual_style?: Record<string, unknown>; copy_style?: Record<string, unknown>; design_tokens?: Record<string, unknown>; deck_theme?: Record<string, unknown>; report_theme?: Record<string, unknown> }): Promise<BrandProfileRow> {
  const res = await fetch(`${API}/v1/brand_profiles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateBrandProfile(id: string, body: Partial<BrandProfileRow>): Promise<BrandProfileRow> {
  const res = await fetch(`${API}/v1/brand_profiles/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBrandProfile(id: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API}/v1/brand_profiles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getBrandEmbeddings(brandId: string, params?: { embedding_type?: string; limit?: number }): Promise<{ items: BrandEmbeddingRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.embedding_type) sp.set("embedding_type", params.embedding_type);
  if (params?.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`${API}/v1/brand_profiles/${brandId}/embeddings?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBrandEmbedding(brandId: string, body: { content: string; embedding_type: string; metadata?: Record<string, unknown> }): Promise<BrandEmbeddingRow> {
  const res = await fetch(`${API}/v1/brand_profiles/${brandId}/embeddings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBrandEmbedding(brandId: string, embeddingId: string): Promise<void> {
  const res = await fetch(`${API}/v1/brand_profiles/${brandId}/embeddings/${embeddingId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function getBrandAssets(brandId: string): Promise<{ items: BrandAssetRow[] }> {
  const res = await fetch(`${API}/v1/brand_profiles/${brandId}/assets`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBrandAsset(brandId: string, body: { asset_type: string; uri: string; filename?: string; mime_type?: string }): Promise<BrandAssetRow> {
  const res = await fetch(`${API}/v1/brand_profiles/${brandId}/assets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBrandAsset(brandId: string, assetId: string): Promise<void> {
  const res = await fetch(`${API}/v1/brand_profiles/${brandId}/assets/${assetId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function getDocumentTemplates(params?: { brand_profile_id?: string; template_type?: string; limit?: number }): Promise<{ items: DocumentTemplateRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.brand_profile_id) sp.set("brand_profile_id", params.brand_profile_id);
  if (params?.template_type) sp.set("template_type", params.template_type);
  if (params?.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`${API}/v1/document_templates?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplateRow> {
  const res = await fetch(`${API}/v1/document_templates/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDocumentTemplate(body: { brand_profile_id?: string; template_type: string; name: string; description?: string; template_config?: Record<string, unknown>; component_sequence?: unknown[] }): Promise<DocumentTemplateRow> {
  const res = await fetch(`${API}/v1/document_templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateDocumentTemplate(id: string, body: Partial<DocumentTemplateRow>): Promise<DocumentTemplateRow> {
  const res = await fetch(`${API}/v1/document_templates/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDocumentTemplate(id: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API}/v1/document_templates/${id}`, { method: "DELETE" });
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
  const res = await fetch(`${API}/v1/v1_slice/funnel`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/decision_loop/observe — anomalies and baselines (read-only). */
export async function getDecisionLoopObserve(): Promise<{
  anomalies: Array<{ kpi_key: string; current: number; baseline: number; deviation_pct?: number }>;
  baselines: Array<{ kpi_key: string; value: number }>;
}> {
  const res = await fetch(`${API}/v1/decision_loop/observe`);
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
  const res = await fetch(`${API}/v1/decision_loop/tick`, {
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
  const res = await fetch(`${API}/v1/deploy_events/${encodeURIComponent(deployId)}/repair_plan`);
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
  const res = await fetch(`${API}/v1/deploy_events?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/deploy_events/sync — sync from Render API. */
export async function postDeployEventsSync(): Promise<{ synced: number; message?: string }> {
  const res = await fetch(`${API}/v1/deploy_events/sync`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/deploy_events/sync_github — sync from GitHub Actions. */
export async function postDeployEventsSyncGitHub(): Promise<{ synced: number; message?: string }> {
  const res = await fetch(`${API}/v1/deploy_events/sync_github`, { method: "POST" });
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
  const res = await fetch(`${API}/v1/render/status`);
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
  const res = await fetch(`${API}/v1/import_graph?service_id=${encodeURIComponent(serviceId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/import_graph — store import graph snapshot. */
export async function postImportGraph(serviceId: string, snapshotJson: unknown): Promise<{ snapshot_id: string; service_id: string; created_at: string }> {
  const res = await fetch(`${API}/v1/import_graph`, {
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
  const res = await fetch(`${API}/v1/schema_drift?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/schema_snapshots/capture — store current schema as snapshot. */
export async function postSchemaSnapshotsCapture(environment: string): Promise<{ schema_snapshot_id: string; environment: string; created_at: string }> {
  const res = await fetch(`${API}/v1/schema_snapshots/capture`, {
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
  const res = await fetch(`${API}/v1/contract_breakage_scan${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/change_events/:id/backfill_plan — suggested backfill steps. */
export async function getChangeEventBackfillPlan(changeEventId: string): Promise<{ steps: unknown[] }> {
  const res = await fetch(`${API}/v1/change_events/${changeEventId}/backfill_plan`);
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
  const res = await fetch(`${API}/v1/incident_memory?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/memory/lookup — similar incidents by signature. */
export async function getMemoryLookup(params: { signature?: string; limit?: number }): Promise<{ similar_incidents: unknown[]; memory_entries: unknown[] }> {
  const sp = new URLSearchParams();
  if (params.signature) sp.set("signature", params.signature);
  if (params.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`${API}/v1/memory/lookup?${sp}`);
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
  const res = await fetch(`${API}/v1/checkpoints?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/checkpoints/:id — single checkpoint. */
export async function getCheckpoint(id: string): Promise<{ checkpoint_id: string; scope_type: string; scope_id: string; run_id?: string | null; created_at: string }> {
  const res = await fetch(`${API}/v1/checkpoints/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/checkpoints/:id/diff — diff between checkpoint and current. */
export async function getCheckpointDiff(id: string): Promise<{
  checkpoint_id: string; scope_type: string; scope_id: string; created_at: string;
  current_schema?: unknown; current_tables?: unknown[]; current_columns?: unknown[];
  snapshot_artifact_id?: string | null; snapshot_diff?: unknown;
}> {
  const res = await fetch(`${API}/v1/checkpoints/${encodeURIComponent(id)}/diff`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/checkpoints — create checkpoint. */
export async function postCheckpoint(body: { scope_type: string; scope_id: string; run_id?: string }): Promise<{ checkpoint_id: string; scope_type: string; scope_id: string; created_at: string }> {
  const res = await fetch(`${API}/v1/checkpoints`, {
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
  const res = await fetch(`${API}/v1/failure_clusters${sp}`);
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
  const res = await fetch(`${API}/v1/change_events?${sp}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/change_events/:id — single change event. */
export async function getChangeEvent(id: string): Promise<{ change_event_id: string; source_type?: string; source_ref?: string; change_class?: string; summary?: string | null; created_at: string }> {
  const res = await fetch(`${API}/v1/change_events/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/change_events/:id/impacts — list graph impacts for change event. */
export async function getChangeEventImpacts(id: string): Promise<{ items: Array<{ impact_id: string; change_event_id: string; run_id?: string; plan_id?: string; plan_node_id?: string; artifact_id?: string; impact_type?: string; reason?: string }> }> {
  const res = await fetch(`${API}/v1/change_events/${encodeURIComponent(id)}/impacts`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/change_events/:id/impact — compute impacts (stub). */
export async function postChangeEventImpact(id: string): Promise<{ change_event_id: string; impacts: unknown[] }> {
  const res = await fetch(`${API}/v1/change_events/${encodeURIComponent(id)}/impact`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/topology/:planId — plan node graph. */
export async function getGraphTopology(planId: string): Promise<{ plan_id: string; nodes: unknown[]; edges: unknown[] }> {
  const res = await fetch(`${API}/v1/graph/topology/${encodeURIComponent(planId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/frontier/:runId — run frontier. */
export async function getGraphFrontier(runId: string): Promise<{ run_id: string; completed_node_ids: string[]; pending_node_ids: string[] }> {
  const res = await fetch(`${API}/v1/graph/frontier/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/repair_plan/:runId/:nodeId — repair plan for failed node. */
export async function getGraphRepairPlan(runId: string, nodeId: string): Promise<{ run_id: string; node_id: string; suggested_actions: unknown[]; subgraph_replay_scope: unknown[] }> {
  const res = await fetch(`${API}/v1/graph/repair_plan/${encodeURIComponent(runId)}/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/graph/subgraph_replay — trigger subgraph replay. */
export async function postGraphSubgraphReplay(body: { run_id: string; node_ids?: string[] }): Promise<{ run_id: string | null; replayed: number }> {
  const res = await fetch(`${API}/v1/graph/subgraph_replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/migration_guard — analyze migration SQL. */
export async function postMigrationGuard(body: { sql?: string; migration_ref?: string }): Promise<{ tables_touched: unknown[]; columns: unknown[]; risks: unknown[]; checkpoint_suggestion: unknown; raw?: string | null }> {
  const res = await fetch(`${API}/v1/migration_guard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/audit/:runId — graph audit. */
export async function getGraphAudit(runId: string): Promise<{ run_id: string; issues: unknown[]; summary: unknown }> {
  const res = await fetch(`${API}/v1/graph/audit/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/missing_capabilities/:planId — missing capabilities. */
export async function getGraphMissingCapabilities(planId: string): Promise<{ plan_id: string; missing: unknown[] }> {
  const res = await fetch(`${API}/v1/graph/missing_capabilities/${encodeURIComponent(planId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET /v1/graph/lineage/:artifactId — artifact lineage. */
export async function getGraphLineage(artifactId: string): Promise<{ artifact_id: string; producers: unknown[]; consumers: unknown[] }> {
  const res = await fetch(`${API}/v1/graph/lineage/${encodeURIComponent(artifactId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST /v1/baselines/compute — compute KPI baselines. */
export async function postBaselinesCompute(): Promise<{ baselines: number; items: unknown[] }> {
  const res = await fetch(`${API}/v1/baselines/compute`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ——— Klaviyo operator pack ———
export async function getKlaviyoTemplates(brand_profile_id?: string): Promise<{ items: { id: string; brand_profile_id: string; artifact_id: string; klaviyo_template_id: string; sync_state: string; last_synced_at: string | null; last_error: string | null; created_at: string }[] }> {
  const url = brand_profile_id ? `${API}/v1/klaviyo/templates?brand_profile_id=${encodeURIComponent(brand_profile_id)}` : `${API}/v1/klaviyo/templates`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKlaviyoCampaigns(brand_profile_id?: string): Promise<{ items: { id: string; initiative_id: string | null; run_id: string | null; artifact_id: string; brand_profile_id: string; klaviyo_campaign_id: string; send_job_id: string | null; sync_state: string; scheduled_at: string | null; last_error: string | null; created_at: string }[] }> {
  const url = brand_profile_id ? `${API}/v1/klaviyo/campaigns?brand_profile_id=${encodeURIComponent(brand_profile_id)}` : `${API}/v1/klaviyo/campaigns`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKlaviyoFlows(brand_profile_id?: string): Promise<{ items: { id: string; brand_profile_id: string; flow_type: string; klaviyo_flow_id: string; sync_state: string; last_remote_status: string | null; last_error: string | null; created_at: string }[] }> {
  const url = brand_profile_id ? `${API}/v1/klaviyo/flows?brand_profile_id=${encodeURIComponent(brand_profile_id)}` : `${API}/v1/klaviyo/flows`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postKlaviyoCampaignsPush(body: { initiative_id?: string; run_id?: string; artifact_id: string; schedule_at?: string; audience_list_ids?: string[] }): Promise<{ template_id: string; campaign_id: string; send_job_id?: string; sync_state: string; klaviyo_sent_campaigns_id: string }> {
  const res = await fetch(`${API}/v1/klaviyo/campaigns/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postKlaviyoFlows(body: { brand_profile_id: string; flow_type: string; flow_name?: string; template_ids?: string[]; delays_minutes?: number[] }): Promise<{ flow_id: string; sync_state: string; klaviyo_flow_sync_id: string }> {
  const res = await fetch(`${API}/v1/klaviyo/flows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchKlaviyoFlowStatus(flowId: string, body: { status: "draft" | "manual" | "live"; brand_profile_id?: string; approved_by?: string }): Promise<{ flow_id: string; status: string }> {
  const res = await fetch(`${API}/v1/klaviyo/flows/${encodeURIComponent(flowId)}/status`, {
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
