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
    brandContext?: {
        id: string;
        name: string;
        systemPrompt?: string;
    };
    /** When false, use OPENAI_API_KEY directly even if LLM_GATEWAY_URL is set (run-level choice from Console). */
    useGateway?: boolean;
}
export interface LLMChatResult {
    content: string;
    model_id: string;
    tokens_in?: number;
    tokens_out?: number;
    latency_ms?: number;
}
export declare function isSafeToCache(jobType: string): boolean;
/** Default tier by job type when no routing policy exists. */
export declare function pickTier(jobType: string): ModelTier;
/** Resolve model tier for a job type: routing_policies from Control Plane, else pickTier. */
export declare function resolveTier(jobType: string): Promise<ModelTier>;
export declare function chat(options: LLMChatOptions): Promise<LLMChatResult>;
export declare function isGatewayConfigured(): boolean;
export interface ChatLocalOptions {
    model?: ModelTier | string;
    messages: LLMChatMessage[];
    max_tokens?: number;
    temperature?: number;
}
export declare function chatLocal(options: ChatLocalOptions): Promise<LLMChatResult>;
//# sourceMappingURL=llm-client.d.ts.map