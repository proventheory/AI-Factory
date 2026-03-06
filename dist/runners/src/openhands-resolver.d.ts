/**
 * OpenHands Resolver — real integration.
 *
 * OpenHands (formerly OpenDevin) resolves GitHub issues by:
 * 1. Reading the issue description and repo context
 * 2. Generating hypotheses and patches
 * 3. Producing a unified diff or PR-ready patch
 *
 * Invocation: Docker-based (openhands/resolver image) or CLI (`openhands-resolver`).
 * Docs: https://github.com/All-Hands-AI/OpenHands
 *
 * The runner spawns OpenHands as a child process, captures output, and writes
 * the patch as an artifact. The patch is NOT auto-merged — gating requires
 * eval pass + human approval (see LLM_GATEWAY_AND_OPTIMIZATION.md gating policy).
 */
export interface ResolverInput {
    issue_url?: string;
    issue_title?: string;
    issue_body?: string;
    repo_url?: string;
    workspace_path?: string;
    llm_source?: "gateway" | "openai_direct";
}
export interface ResolverOutput {
    patch: string;
    summary: string;
    model_used: string;
    exit_code: number;
    logs: string;
}
/**
 * Run OpenHands resolver against an issue.
 *
 * Tries (in order):
 * 1. Docker-based: `docker run --rm openhands/resolver ...`
 * 2. CLI-based: `openhands-resolver --issue-url ...`
 * 3. Fallback: use LLM gateway directly to generate a patch (MAX tier)
 */
export declare function runOpenHandsResolver(input: ResolverInput): Promise<ResolverOutput>;
//# sourceMappingURL=openhands-resolver.d.ts.map