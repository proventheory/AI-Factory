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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const execFileAsync = promisify(execFile);
const OPENHANDS_TIMEOUT_MS = 5 * 60_000; // 5 minutes
/**
 * Run OpenHands resolver against an issue.
 *
 * Tries (in order):
 * 1. Docker-based: `docker run --rm openhands/resolver ...`
 * 2. CLI-based: `openhands-resolver --issue-url ...`
 * 3. Fallback: use LLM gateway directly to generate a patch (MAX tier)
 */
export async function runOpenHandsResolver(input) {
    const workDir = mkdtempSync(join(tmpdir(), "openhands-"));
    const issueFile = join(workDir, "issue.json");
    writeFileSync(issueFile, JSON.stringify(input));
    // Try Docker
    try {
        const { stdout, stderr } = await execFileAsync("docker", [
            "run", "--rm",
            "-v", `${workDir}:/workspace`,
            "-e", `GITHUB_TOKEN=${process.env.GITHUB_TOKEN ?? ""}`,
            "-e", `LLM_API_KEY=${process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY ?? ""}`,
            "-e", `LLM_MODEL=${process.env.OPENHANDS_MODEL ?? "gpt-4o"}`,
            "ghcr.io/all-hands-ai/openhands:latest",
            "--issue-url", input.issue_url ?? "",
            "--repo-path", "/workspace",
        ], { timeout: OPENHANDS_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
        const patchPath = join(workDir, "output.patch");
        const patch = existsSync(patchPath) ? readFileSync(patchPath, "utf-8") : extractPatchFromOutput(stdout);
        return {
            patch: patch || stdout.slice(-5000),
            summary: extractSummary(stdout),
            model_used: process.env.OPENHANDS_MODEL ?? "gpt-4o",
            exit_code: 0,
            logs: (stdout + "\n" + stderr).slice(-10000),
        };
    }
    catch (dockerErr) {
        // Docker not available or image not pulled — try CLI
    }
    // Try CLI
    try {
        const args = [];
        if (input.issue_url)
            args.push("--issue-url", input.issue_url);
        if (input.workspace_path)
            args.push("--repo-path", input.workspace_path);
        if (input.repo_url)
            args.push("--repo-url", input.repo_url);
        const { stdout, stderr } = await execFileAsync("openhands-resolver", args, {
            timeout: OPENHANDS_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024,
            env: {
                ...process.env,
                LLM_API_KEY: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY ?? "",
                LLM_MODEL: process.env.OPENHANDS_MODEL ?? "gpt-4o",
            },
        });
        const patch = extractPatchFromOutput(stdout);
        return {
            patch: patch || stdout.slice(-5000),
            summary: extractSummary(stdout),
            model_used: process.env.OPENHANDS_MODEL ?? "gpt-4o",
            exit_code: 0,
            logs: (stdout + "\n" + stderr).slice(-10000),
        };
    }
    catch (cliErr) {
        // CLI not available — fallback to LLM-based patch generation
    }
    // Fallback: generate patch via LLM gateway (MAX tier)
    const { chat, isGatewayConfigured } = await import("./llm-client.js");
    if (!isGatewayConfigured()) {
        return {
            patch: "",
            summary: "OpenHands Docker and CLI not available; LLM gateway not configured.",
            model_used: "none",
            exit_code: 1,
            logs: "No resolver backend available. Install OpenHands (Docker or CLI) or configure LLM_GATEWAY_URL.",
        };
    }
    const result = await chat({
        model: "max/chat",
        messages: [
            { role: "system", content: "You are an expert bug-fixing agent. Given an issue description and optional repo context, produce a unified diff patch that fixes the issue. Output ONLY the patch (unified diff format)." },
            { role: "user", content: `Issue: ${input.issue_title ?? "Unknown"}\n\n${input.issue_body ?? ""}\n\nRepo: ${input.repo_url ?? input.workspace_path ?? "unknown"}` },
        ],
        context: { run_id: "resolver", job_run_id: "resolver", job_type: "openhands_resolver" },
    });
    return {
        patch: result.content,
        summary: `LLM-generated patch (fallback). Model: ${result.model_id}`,
        model_used: result.model_id,
        exit_code: 0,
        logs: `Tokens: ${result.tokens_in ?? 0} in, ${result.tokens_out ?? 0} out. Latency: ${result.latency_ms ?? 0}ms.`,
    };
}
function extractPatchFromOutput(output) {
    const diffStart = output.indexOf("diff --git");
    if (diffStart >= 0)
        return output.slice(diffStart);
    const unifiedStart = output.indexOf("--- a/");
    if (unifiedStart >= 0)
        return output.slice(unifiedStart);
    return "";
}
function extractSummary(output) {
    const lines = output.split("\n");
    const summaryLine = lines.find(l => l.startsWith("Summary:") || l.startsWith("## Summary"));
    return summaryLine ?? lines.slice(-3).join("\n").slice(0, 500);
}
//# sourceMappingURL=openhands-resolver.js.map