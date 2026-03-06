/**
 * SWE-agent executor — real integration.
 *
 * SWE-agent takes a GitHub issue and produces a patch via autonomous coding.
 * Docs: https://github.com/SWE-agent/SWE-agent
 *
 * Invocation: Python CLI (`sweagent run ...`) or Docker.
 * The runner spawns SWE-agent, captures the patch output, and writes it as an artifact.
 */
export interface SweAgentInput {
    issue_url?: string;
    issue_text?: string;
    repo_url?: string;
    workspace_path?: string;
    llm_source?: "gateway" | "openai_direct";
}
export interface SweAgentOutput {
    patch: string;
    summary: string;
    model_used: string;
    exit_code: number;
    trajectory_log: string;
}
/**
 * Run SWE-agent against an issue.
 *
 * Tries:
 * 1. Python CLI: `sweagent run --model_name ... --data_path ... --repo_path ...`
 * 2. Docker: `docker run --rm sweagent/swe-agent ...`
 * 3. Fallback: LLM gateway MAX tier patch generation
 */
export declare function runSweAgent(input: SweAgentInput): Promise<SweAgentOutput>;
//# sourceMappingURL=swe-agent.d.ts.map