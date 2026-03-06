/**
 * SWE-agent executor — real integration.
 *
 * SWE-agent takes a GitHub issue and produces a patch via autonomous coding.
 * Docs: https://github.com/SWE-agent/SWE-agent
 *
 * Invocation: Python CLI (`sweagent run ...`) or Docker.
 * The runner spawns SWE-agent, captures the patch output, and writes it as an artifact.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const execFileAsync = promisify(execFile);
const SWE_AGENT_TIMEOUT_MS = 10 * 60_000; // 10 minutes
/**
 * Run SWE-agent against an issue.
 *
 * Tries:
 * 1. Python CLI: `sweagent run --model_name ... --data_path ... --repo_path ...`
 * 2. Docker: `docker run --rm sweagent/swe-agent ...`
 * 3. Fallback: LLM gateway MAX tier patch generation
 */
export async function runSweAgent(input) {
    const workDir = mkdtempSync(join(tmpdir(), "sweagent-"));
    const model = process.env.SWE_AGENT_MODEL ?? "gpt-4o";
    // Try Python CLI
    try {
        const args = [
            "run",
            "--model_name", model,
            "--data_path", input.issue_url ?? "",
        ];
        if (input.workspace_path)
            args.push("--repo_path", input.workspace_path);
        if (input.repo_url)
            args.push("--repo_path", input.repo_url);
        args.push("--output_dir", workDir);
        const { stdout, stderr } = await execFileAsync("sweagent", args, {
            timeout: SWE_AGENT_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024,
            env: {
                ...process.env,
                OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
            },
        });
        const patch = findPatchInDir(workDir) || extractPatch(stdout);
        return {
            patch: patch || stdout.slice(-5000),
            summary: extractSummary(stdout),
            model_used: model,
            exit_code: 0,
            trajectory_log: (stdout + "\n" + stderr).slice(-10000),
        };
    }
    catch {
        // CLI not available
    }
    // Try Docker
    try {
        const { stdout, stderr } = await execFileAsync("docker", [
            "run", "--rm",
            "-v", `${workDir}:/output`,
            "-e", `OPENAI_API_KEY=${process.env.OPENAI_API_KEY ?? ""}`,
            "sweagent/swe-agent:latest",
            "run",
            "--model_name", model,
            "--data_path", input.issue_url ?? "",
            "--output_dir", "/output",
        ], { timeout: SWE_AGENT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
        const patch = findPatchInDir(workDir) || extractPatch(stdout);
        return {
            patch: patch || stdout.slice(-5000),
            summary: extractSummary(stdout),
            model_used: model,
            exit_code: 0,
            trajectory_log: (stdout + "\n" + stderr).slice(-10000),
        };
    }
    catch {
        // Docker not available
    }
    // Fallback: LLM gateway
    const { chat, isGatewayConfigured } = await import("./llm-client.js");
    if (!isGatewayConfigured()) {
        return {
            patch: "",
            summary: "SWE-agent CLI and Docker not available; LLM gateway not configured.",
            model_used: "none",
            exit_code: 1,
            trajectory_log: "Install SWE-agent (pip install sweagent) or Docker, or configure LLM_GATEWAY_URL.",
        };
    }
    const result = await chat({
        model: "max/chat",
        messages: [
            { role: "system", content: "You are SWE-agent, an autonomous coding agent. Given an issue, analyze the problem, reason about the fix, and produce a unified diff patch. Output ONLY the patch." },
            { role: "user", content: `Issue: ${input.issue_text ?? input.issue_url ?? "No issue provided"}\n\nRepo: ${input.repo_url ?? input.workspace_path ?? "unknown"}` },
        ],
        context: { run_id: "swe-agent", job_run_id: "swe-agent", job_type: "swe_agent" },
        useGateway: input.llm_source !== "openai_direct",
    });
    return {
        patch: result.content,
        summary: `LLM-generated patch (SWE-agent fallback). Model: ${result.model_id}`,
        model_used: result.model_id,
        exit_code: 0,
        trajectory_log: `Tokens: ${result.tokens_in ?? 0} in, ${result.tokens_out ?? 0} out.`,
    };
}
function findPatchInDir(dir) {
    try {
        const files = readdirSync(dir, { recursive: true });
        const patchFile = files.find(f => f.endsWith(".patch") || f.endsWith(".diff"));
        if (patchFile)
            return readFileSync(join(dir, patchFile), "utf-8");
        const predFile = files.find(f => f.includes("predictions") || f.includes("output"));
        if (predFile && existsSync(join(dir, predFile))) {
            const content = readFileSync(join(dir, predFile), "utf-8");
            return extractPatch(content);
        }
    }
    catch { /* empty dir or read error */ }
    return "";
}
function extractPatch(output) {
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
    const summaryLine = lines.find(l => l.includes("Resolved") || l.includes("Applied") || l.includes("patch"));
    return summaryLine ?? lines.slice(-3).join("\n").slice(0, 500);
}
//# sourceMappingURL=swe-agent.js.map