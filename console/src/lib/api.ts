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
};

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

export async function getRuns(params?: { status?: string; intent_type?: string; limit?: number }): Promise<{ items: RunRow[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.intent_type) searchParams.set("intent_type", params.intent_type);
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

export async function updateInitiative(id: string, body: Partial<{ intent_type: string; title: string | null; risk_level: string; source_ref: string }>): Promise<InitiativeRow> {
  const res = await fetch(`${API}/v1/initiatives/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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

export type UsageAggregate = {
  by_tier: { model_tier: string; calls: number; tokens_in: number; tokens_out: number; avg_latency_ms: number }[];
  totals: { calls: number; tokens_in: number; tokens_out: number };
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

export async function getUsage(): Promise<UsageAggregate> {
  const res = await fetch(`${API}/v1/usage`);
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

export async function getEmailCampaigns(params?: { limit?: number; offset?: number }): Promise<{ items: EmailCampaignRow[]; limit: number; offset: number }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const res = await fetch(`${API}/v1/email_campaigns?${searchParams}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getEmailCampaign(id: string): Promise<EmailCampaignRow & { reply_to?: string | null; metadata_json?: unknown }> {
  const res = await fetch(`${API}/v1/email_campaigns/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createEmailCampaign(body: { title?: string; subject_line?: string; from_name?: string; from_email?: string }): Promise<EmailCampaignRow> {
  const res = await fetch(`${API}/v1/email_campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateEmailCampaign(id: string, body: { subject_line?: string; from_name?: string; from_email?: string; reply_to?: string; audience_segment_ref?: string }): Promise<EmailCampaignRow> {
  const res = await fetch(`${API}/v1/email_campaigns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export const api = {
  getRuns, getRun, getInitiatives, getInitiative, createInitiative, updateInitiative, getPlans, getPlan,
  getJobRuns, getJobRun, getArtifacts, getArtifact, getToolCalls, getApprovals,
  getPendingApprovals, getApproval, rerunRun, getLlmCalls, getUsage,
  getAgentMemory, getAgentMemoryById, getMcpServers, getMcpServer, createMcpServer,
  deleteMcpServer, testMcpServer, getJobRunLlmCalls, getRoutingPolicies, getUsageByJobType,
  getBrandProfiles, getBrandProfile, createBrandProfile, updateBrandProfile, deleteBrandProfile,
  getBrandEmbeddings, createBrandEmbedding, deleteBrandEmbedding, getBrandAssets, createBrandAsset, deleteBrandAsset,
  getDocumentTemplates, getDocumentTemplate, createDocumentTemplate, updateDocumentTemplate, deleteDocumentTemplate,
};
