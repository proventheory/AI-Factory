/**
 * Self-Heal Runner: local repair loop for the AI Factory monorepo.
 *
 * Usage: npx tsx scripts/self-heal.ts [flags]
 * Requires: OPENAI_API_KEY env (no cloud, no gateway, no DB)
 *
 * Flow: stash -> branch -> doctor -> parse -> context -> LLM -> patch -> rerun -> repeat
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseStepOutput, type ParsedError } from "./error-parser.js";
import { collectContext } from "./context-loader.js";
import { applyPatches, getChangedFiles, type PatchResult } from "./patcher.js";
import { loadBaseline, generateBaseline, isBaselineError, type ErrorFingerprint } from "./baseline.js";
import { chatLocal, type LLMChatResult } from "../runners/src/llm-client.js";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getFlag(name: string, defaultValue: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}
function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const DRY_RUN = hasFlag("dry-run");
const VERBOSE = hasFlag("verbose");
const NO_BASELINE = hasFlag("no-baseline");
const UPDATE_BASELINE = hasFlag("update-baseline");
const MAX_ITERATIONS = parseInt(getFlag("max-iterations", "5"), 10);
const MAX_FILES = parseInt(getFlag("max-files", "10"), 10);
const MAX_COST = parseFloat(getFlag("max-cost", "2.00"));
const MODEL = getFlag("model", "gpt-4o");
const STEP_FILTER = getFlag("step", "all");
const AGENT = getFlag("agent", "llm");

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

interface CostTracker {
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  calls: number;
}

const cost: CostTracker = { total_tokens_in: 0, total_tokens_out: 0, total_cost_usd: 0, calls: 0 };

// gpt-4o pricing as of 2024: $2.50/M in, $10.00/M out
function trackCost(result: LLMChatResult): void {
  const tokensIn = result.tokens_in ?? 0;
  const tokensOut = result.tokens_out ?? 0;
  cost.total_tokens_in += tokensIn;
  cost.total_tokens_out += tokensOut;
  cost.total_cost_usd += (tokensIn * 2.5 + tokensOut * 10.0) / 1_000_000;
  cost.calls++;
}

// ---------------------------------------------------------------------------
// Attempt history
// ---------------------------------------------------------------------------

interface AttemptRecord {
  iteration: number;
  errors_targeted: string[];
  patch_summary: string;
  result: "applied_still_failing" | "patch_rejected" | "new_errors_introduced" | "partial_fix";
  new_errors?: string[];
}

const history: AttemptRecord[] = [];

function historyToString(): string {
  if (history.length === 0) return "None yet.";
  return history
    .map((h) => `Attempt ${h.iteration}: ${h.result}. Targeted: ${h.errors_targeted.join("; ").slice(0, 200)}. Patch: ${h.patch_summary.slice(0, 300)}${h.new_errors ? ". New errors: " + h.new_errors.join("; ").slice(0, 200) : ""}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Doctor runner
// ---------------------------------------------------------------------------

function runDoctor(): { success: boolean; output: string; errors: ParsedError[] } {
  const stepArg = STEP_FILTER !== "all" ? `--step ${STEP_FILTER}` : "";
  let rawOutput = "";
  try {
    rawOutput = execSync(`bash scripts/doctor.sh --json ${stepArg}`, {
      encoding: "utf-8",
      timeout: 5 * 60_000,
      cwd: process.cwd(),
    });
  } catch (e) {
    rawOutput = (e as { stdout?: string }).stdout ?? (e as { stderr?: string }).stderr ?? String(e);
  }

  try {
    const report = JSON.parse(rawOutput) as { status: string; results?: Array<{ step: string; workspace: string; success: boolean; output: string }> };
    if (report.status === "pass") return { success: true, output: rawOutput, errors: [] };
    const errors: ParsedError[] = [];
    for (const r of report.results ?? []) {
      if (!r.success) {
        errors.push(...parseStepOutput(r.step, r.workspace, r.output));
      }
    }
    if (errors.length === 0) {
      // Fallback: try parsing the combined output as tsc
      const allOutput = (report.results ?? []).map(r => r.output).join("\n");
      errors.push(...parseStepOutput("tsc", "root", allOutput));
    }
    return { success: false, output: rawOutput, errors };
  } catch {
    // Not valid JSON — parse raw output directly
    const errors: ParsedError[] = [];
    errors.push(...parseStepOutput("tsc", "root", rawOutput));
    return { success: false, output: rawOutput, errors };
  }
}

// ---------------------------------------------------------------------------
// LLM system prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a TypeScript/Next.js expert fixing build errors in a 4.4GB monorepo with 4 workspaces.

OUTPUT FORMAT:
- SEARCH/REPLACE blocks to modify existing files
- ADD_FILE blocks to create new files
- No explanations outside blocks

BLOCK SYNTAX:
<<<<<<< SEARCH
[exact existing code]
======= REPLACE
[fixed code]
>>>>>>> FILE: path/to/file.ts

<<<<<<< ADD_FILE: path/to/new-file.ts
[file contents]
>>>>>>> END

<<<<<<< CANNOT_FIX: [reason why this error cannot be fixed with a code change]
>>>>>>> END

RULES:
1. The SEARCH section must EXACTLY match existing code (copy-paste precision, including whitespace and indentation).
2. Make the MINIMUM change needed. Do not refactor unrelated code.
3. NEVER modify: package-lock.json, pnpm-lock.yaml, .env*, node_modules/*, supabase/migrations/*, *.lock
4. NEVER add \`any\` type annotations. Use proper types.
5. If a type is missing, ADD_FILE a proper type definition rather than using \`as unknown\`.
6. One block per file change. Multiple blocks allowed for multiple files.

WORKSPACE CONTEXT:
- root: control-plane/, runners/, adapters/ — compiled with tsc (ES2022, Node16)
- console: Next.js 14, app router, src/ dir, bundler module resolution
- email-marketing-factory: separate Next.js app with its own tsconfig`;

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  console.log("Self-Heal Runner v2");
  console.log(`  Model: ${MODEL} | Max iterations: ${MAX_ITERATIONS} | Max cost: $${MAX_COST}`);
  console.log(`  Dry run: ${DRY_RUN} | Step filter: ${STEP_FILTER} | Agent: ${AGENT}`);
  console.log("");

  // Step 1: Stash + branch
  const branch = `autofix/${Date.now()}`;
  if (!DRY_RUN) {
    try { execSync("git stash", { encoding: "utf-8" }); } catch { /* clean working dir */ }
    try { execSync(`git checkout -b ${branch}`, { encoding: "utf-8" }); } catch {
      console.error(`Failed to create branch ${branch}. Aborting.`);
      process.exit(1);
    }
    console.log(`Created branch: ${branch}`);
  }

  // Step 2: Load or generate baseline
  let baseline = NO_BASELINE ? null : loadBaseline();
  if (!baseline && !NO_BASELINE) {
    console.log("No baseline found. Generating from current errors...");
    baseline = generateBaseline();
  }

  let lastErrorCount = Infinity;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`\n--- Iteration ${i + 1}/${MAX_ITERATIONS} ---`);

    // Step 3: Run doctor
    const report = runDoctor();

    // Step 4: Filter baseline errors
    let errors = report.errors;
    if (baseline && !NO_BASELINE) {
      const before = errors.length;
      errors = errors.filter((e) => {
        const fp: ErrorFingerprint = {
          file: e.file,
          line: e.line,
          code: e.code ?? "",
          message_hash: createHash("sha256").update(e.message).digest("hex").slice(0, 12),
        };
        return !isBaselineError(fp, baseline!);
      });
      if (before !== errors.length) {
        console.log(`  Filtered ${before - errors.length} baseline errors (${errors.length} new errors remain)`);
      }
    }

    // Step 5: Green check
    if (errors.length === 0) {
      console.log("\n  All new errors fixed!");
      break;
    }

    console.log(`  ${errors.length} errors to fix`);
    for (const e of errors.slice(0, 5)) {
      console.log(`    ${e.file}:${e.line} [${e.code ?? e.step}] ${e.message.slice(0, 100)}`);
    }
    if (errors.length > 5) console.log(`    ... and ${errors.length - 5} more`);

    // Check if we're making progress
    if (errors.length >= lastErrorCount && i > 0) {
      console.log(`  WARNING: Error count not decreasing (${errors.length} >= ${lastErrorCount})`);
    }
    lastErrorCount = errors.length;

    // Step 6: Cost check
    const estimatedTokens = 50_000 * 0.75; // rough: 50KB context ≈ 37.5K tokens
    const estimatedCost = cost.total_cost_usd + (estimatedTokens * 2.5 + 4096 * 10.0) / 1_000_000;
    if (estimatedCost > MAX_COST) {
      console.log(`\n  Cost limit reached: ~$${cost.total_cost_usd.toFixed(4)} spent, next call would exceed $${MAX_COST}`);
      break;
    }

    // Step 7: Collect context
    const context = collectContext(errors, history.map((h) => `Attempt ${h.iteration}: ${h.result} — ${h.patch_summary.slice(0, 200)}`));
    if (VERBOSE) {
      console.log(`\n--- Context (${(context.length / 1024).toFixed(1)}KB) ---`);
      console.log(context.slice(0, 2000) + (context.length > 2000 ? "\n... truncated for display" : ""));
    }

    // Step 8: Build prompt
    const errorReport = errors.slice(0, 15).map((e) =>
      `${e.file}:${e.line}${e.column ? ":" + e.column : ""} [${e.code ?? e.step}] ${e.message}`
    ).join("\n");

    const userMessage = `ERRORS TO FIX (pre-existing errors already filtered out):\n${errorReport}\n\nCODE CONTEXT:\n${context}\n\nPREVIOUS FAILED ATTEMPTS (do NOT repeat these):\n${historyToString()}`;

    if (VERBOSE) {
      console.log(`\n--- LLM Prompt (${(userMessage.length / 1024).toFixed(1)}KB) ---`);
      console.log(userMessage.slice(0, 3000));
    }

    // Step 9: LLM call
    console.log(`  Calling ${MODEL}...`);
    let llmResult: LLMChatResult;
    try {
      llmResult = await chatLocal({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4096,
        temperature: 0,
      });
    } catch (e) {
      console.error(`  LLM call failed: ${(e as Error).message}`);
      history.push({
        iteration: i + 1,
        errors_targeted: errors.slice(0, 5).map((e) => e.message.slice(0, 100)),
        patch_summary: "LLM call failed",
        result: "patch_rejected",
      });
      continue;
    }

    trackCost(llmResult);
    console.log(`  LLM response: ${llmResult.tokens_in ?? "?"}t in, ${llmResult.tokens_out ?? "?"}t out, ${llmResult.latency_ms}ms, $${cost.total_cost_usd.toFixed(4)} total`);

    if (VERBOSE) {
      console.log(`\n--- LLM Output ---`);
      console.log(llmResult.content.slice(0, 3000));
    }

    // Step 10: Apply patches
    const results = applyPatches(llmResult.content, DRY_RUN);
    const applied = results.filter((r) => r.applied);
    const failed = results.filter((r) => !r.applied && r.matchType !== "cannot_fix");
    const cannotFix = results.filter((r) => r.matchType === "cannot_fix");

    console.log(`  Patches: ${applied.length} applied, ${failed.length} failed, ${cannotFix.length} cannot_fix`);
    for (const r of results) {
      const icon = r.applied ? "+" : r.matchType === "cannot_fix" ? "!" : "x";
      console.log(`    [${icon}] ${r.block.file || "(no file)"} — ${r.matchType}${r.detail ? ": " + r.detail.slice(0, 80) : ""}`);
    }

    // Step 11: Check max files
    const changedFiles = getChangedFiles(results);
    if (changedFiles.length > MAX_FILES) {
      console.log(`\n  Too many files changed (${changedFiles.length} > ${MAX_FILES}). Aborting.`);
      break;
    }

    // Step 12: Record history
    if (applied.length === 0) {
      history.push({
        iteration: i + 1,
        errors_targeted: errors.slice(0, 5).map((e) => e.message.slice(0, 100)),
        patch_summary: llmResult.content.slice(0, 500),
        result: "patch_rejected",
      });
      continue;
    }

    // Step 13: Commit
    if (!DRY_RUN) {
      try {
        execSync("git add -A", { encoding: "utf-8" });
        const summary = errors.slice(0, 3).map((e) => `${e.code ?? e.step}: ${e.message.slice(0, 50)}`).join("; ");
        execSync(`git commit -m "autofix(${i + 1}): ${summary.slice(0, 72).replace(/"/g, "'")}"`, { encoding: "utf-8" });
        console.log(`  Committed autofix(${i + 1})`);
      } catch (e) {
        console.log(`  Commit failed: ${(e as Error).message?.slice(0, 100)}`);
      }
    }

    // Step 14: Recheck — will happen on next iteration
    history.push({
      iteration: i + 1,
      errors_targeted: errors.slice(0, 5).map((e) => e.message.slice(0, 100)),
      patch_summary: applied.map((r) => `${r.matchType} ${r.block.file}`).join(", "),
      result: "applied_still_failing", // will be overwritten if green on next iteration
    });
  }

  // Step 15: Final doctor run
  const finalReport = runDoctor();
  let finalErrors = finalReport.errors;
  if (baseline && !NO_BASELINE) {
    finalErrors = finalErrors.filter((e) => {
      const fp: ErrorFingerprint = {
        file: e.file,
        line: e.line,
        code: e.code ?? "",
        message_hash: createHash("sha256").update(e.message).digest("hex").slice(0, 12),
      };
      return !isBaselineError(fp, baseline!);
    });
  }

  console.log("\n=== Self-Heal Summary ===");
  console.log(`  Iterations: ${history.length}`);
  console.log(`  LLM calls: ${cost.calls}`);
  console.log(`  Tokens: ${cost.total_tokens_in} in, ${cost.total_tokens_out} out`);
  console.log(`  Cost: $${cost.total_cost_usd.toFixed(4)}`);
  console.log(`  Remaining new errors: ${finalErrors.length}`);

  if (finalErrors.length === 0) {
    console.log("\n  STATUS: ALL NEW ERRORS FIXED");
    if (!DRY_RUN) {
      try {
        const diff = execSync("git diff main..HEAD --stat", { encoding: "utf-8" });
        console.log(`\n  Changes:\n${diff}`);
      } catch { /* not on main */ }
    }
    if (UPDATE_BASELINE) {
      console.log("  Updating baseline...");
      generateBaseline();
    }
  } else {
    console.log(`\n  STATUS: ${finalErrors.length} ERRORS REMAIN`);
    for (const e of finalErrors.slice(0, 10)) {
      console.log(`    ${e.file}:${e.line} [${e.code ?? e.step}] ${e.message.slice(0, 100)}`);
    }
    // Cleanup on failure
    if (!DRY_RUN) {
      console.log(`\n  Cleaning up: deleting branch ${branch}...`);
      try {
        execSync("git checkout -", { encoding: "utf-8" });
        execSync(`git branch -D ${branch}`, { encoding: "utf-8" });
        try { execSync("git stash pop", { encoding: "utf-8" }); } catch { /* no stash */ }
        console.log("  Branch deleted, stash restored.");
      } catch (e) {
        console.log(`  Cleanup failed: ${(e as Error).message?.slice(0, 100)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error("Self-heal failed:", e);
  process.exit(1);
});
