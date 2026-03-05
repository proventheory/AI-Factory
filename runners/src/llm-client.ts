/**
 * LLM client for executors: all LLM calls go through the gateway (LiteLLM Proxy).
 * Set LLM_GATEWAY_URL in env. Executors use this instead of calling OpenAI/Anthropic directly.
 * See docs/LLM_GATEWAY_AND_OPTIMIZATION.md.
 */

export type ModelTier = "auto/chat" | "fast/chat" | "max/chat";

export interface LLMCallContext {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string | null;
}

export interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  model: ModelTier;
  messages: LLMChatMessage[];
  max_tokens?: number;
  temperature?: number;
  context: LLMCallContext;
  brandContext?: { id: string; name: string; systemPrompt?: string };
}

export interface LLMChatResult {
  content: string;
  model_id: string;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
}

// Phase 3: job types that are safe to cache (deterministic-ish outputs).
// Unsafe types produce unique or sensitive output per run and must not be cached.
const SAFE_TO_CACHE: ReadonlySet<string> = new Set([
  "triage",
  "analyze_repo",
  "code_review",
  "plan_compile",
  "plan_migration",
  "research",
]);

const UNSAFE_TO_CACHE: ReadonlySet<string> = new Set([
  "codegen",
  "write_patch",
  "submit_pr",
  "apply_batch",
  "openhands_resolver",
  "prd",
  "design",
  "unit_test",
]);

export function isSafeToCache(jobType: string): boolean {
  return SAFE_TO_CACHE.has(jobType);
}

/** Default tier by job type when no routing policy exists. */
export function pickTier(jobType: string): ModelTier {
  const maxTypes = new Set(["codegen", "write_patch", "design", "openhands_resolver"]);
  if (maxTypes.has(jobType)) return "max/chat";
  if (isSafeToCache(jobType)) return "fast/chat";
  return "auto/chat";
}

// ---------------------------------------------------------------------------
// Routing policies: resolve model_tier from Control Plane (LLM governance)
// ---------------------------------------------------------------------------

const ROUTING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let routingCache: { policies: { job_type: string; model_tier: string }[]; ts: number } | null = null;

function getControlPlaneUrl(): string {
  return (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

async function getRoutingPolicies(): Promise<{ job_type: string; model_tier: string }[]> {
  if (routingCache && Date.now() - routingCache.ts < ROUTING_CACHE_TTL_MS) {
    return routingCache.policies;
  }
  try {
    const base = getControlPlaneUrl();
    const res = await fetch(`${base}/v1/routing_policies?limit=500`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: { job_type: string; model_tier: string }[] };
    const policies = data.items ?? [];
    routingCache = { policies, ts: Date.now() };
    return policies;
  } catch {
    return routingCache?.policies ?? [];
  }
}

const VALID_TIERS: ModelTier[] = ["auto/chat", "fast/chat", "max/chat"];

/** Resolve model tier for a job type: routing_policies from Control Plane, else pickTier. */
export async function resolveTier(jobType: string): Promise<ModelTier> {
  const policies = await getRoutingPolicies();
  const policy = policies.find((p) => p.job_type === jobType);
  const tier = policy?.model_tier?.trim();
  if (tier && VALID_TIERS.includes(tier as ModelTier)) return tier as ModelTier;
  return pickTier(jobType);
}

function getGatewayUrl(): string {
  const url = process.env.LLM_GATEWAY_URL;
  if (!url) {
    throw new Error(
      "LLM_GATEWAY_URL is not set. Set it to the LiteLLM Proxy base URL when executors call LLMs."
    );
  }
  return url.replace(/\/$/, "");
}

export async function chat(options: LLMChatOptions): Promise<LLMChatResult> {
  const base = getGatewayUrl();
  const start = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-run-id": options.context.run_id,
    "x-job-run-id": options.context.job_run_id,
    "x-job-type": options.context.job_type,
  };

  if (options.context.initiative_id) {
    headers["x-initiative-id"] = options.context.initiative_id;
  }

  // Phase 3 cache scoping: safe job types allow caching; unsafe send no-cache.
  if (isSafeToCache(options.context.job_type)) {
    headers["x-cache-scope"] = "safe";
  } else {
    headers["x-cache-scope"] = "no-cache";
    headers["cache-control"] = "no-cache";
  }

  if (options.brandContext) {
    headers["x-brand-profile-id"] = options.brandContext.id;
  }

  let messages = options.messages;
  if (options.brandContext?.systemPrompt) {
    messages = [
      { role: "system" as const, content: options.brandContext.systemPrompt },
      ...options.messages,
    ];
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      messages,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0,
    }),
  });
  const latency_ms = Date.now() - start;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM gateway error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";
  return {
    content,
    model_id: data.model ?? options.model,
    tokens_in: data.usage?.prompt_tokens,
    tokens_out: data.usage?.completion_tokens,
    latency_ms,
  };
}

export function isGatewayConfigured(): boolean {
  return Boolean(process.env.LLM_GATEWAY_URL);
}

// ---------------------------------------------------------------------------
// Local-only LLM call (no gateway, no cloud — just OPENAI_API_KEY)
// Used by scripts/self-heal.ts for local self-healing without any infra.
// ---------------------------------------------------------------------------

const MODEL_MAP: Record<string, string> = {
  "max/chat": "gpt-4o",
  "auto/chat": "gpt-4o-mini",
  "fast/chat": "gpt-4o-mini",
};

export interface ChatLocalOptions {
  model?: ModelTier | string;
  messages: LLMChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

export async function chatLocal(options: ChatLocalOptions): Promise<LLMChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Required for local self-healing.");
  }

  const model = MODEL_MAP[options.model ?? "max/chat"] ?? options.model ?? "gpt-4o";
  const start = Date.now();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0,
    }),
  });

  const latency_ms = Date.now() - start;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model_id: data.model ?? model,
    tokens_in: data.usage?.prompt_tokens,
    tokens_out: data.usage?.completion_tokens,
    latency_ms,
  };
}
