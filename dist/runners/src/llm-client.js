/**
 * LLM client for executors: all LLM calls go through the gateway (LiteLLM Proxy).
 * Set LLM_GATEWAY_URL in env. Executors use this instead of calling OpenAI/Anthropic directly.
 * See docs/LLM_GATEWAY_AND_OPTIMIZATION.md.
 */
// Phase 3: job types that are safe to cache (deterministic-ish outputs).
// Unsafe types produce unique or sensitive output per run and must not be cached.
const SAFE_TO_CACHE = new Set([
    "triage",
    "analyze_repo",
    "code_review",
    "plan_compile",
    "plan_migration",
    "research",
]);
const UNSAFE_TO_CACHE = new Set([
    "codegen",
    "write_patch",
    "submit_pr",
    "apply_batch",
    "openhands_resolver",
    "prd",
    "design",
    "unit_test",
]);
export function isSafeToCache(jobType) {
    return SAFE_TO_CACHE.has(jobType);
}
function getGatewayUrl() {
    const url = process.env.LLM_GATEWAY_URL;
    if (!url) {
        throw new Error("LLM_GATEWAY_URL is not set. Set it to the LiteLLM Proxy base URL when executors call LLMs.");
    }
    return url.replace(/\/$/, "");
}
export async function chat(options) {
    const base = getGatewayUrl();
    const start = Date.now();
    const headers = {
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
    }
    else {
        headers["x-cache-scope"] = "no-cache";
        headers["cache-control"] = "no-cache";
    }
    if (options.brandContext) {
        headers["x-brand-profile-id"] = options.brandContext.id;
    }
    let messages = options.messages;
    if (options.brandContext?.systemPrompt) {
        messages = [
            { role: "system", content: options.brandContext.systemPrompt },
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
    const data = (await res.json());
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
export function isGatewayConfigured() {
    return Boolean(process.env.LLM_GATEWAY_URL);
}
//# sourceMappingURL=llm-client.js.map