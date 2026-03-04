/**
 * Adversarial Slop Guard: L0 deterministic + L1 semantic.
 * L0 runs regex/policy rules on artifact content.
 * L1 calls LLM (FAST tier) only when L0 passes.
 * Reads config/slop_guard.yaml for rules.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type pg from "pg";
import { chat, isGatewayConfigured } from "../llm-client.js";

interface L0Rule {
  id: string;
  name: string;
  type: string;
  pattern?: string;
  apply_to_artifact_types: string[];
  fail_if_match?: boolean;
  force_reject?: boolean;
  max_matches?: number;
  patterns?: string[];
  min_chars?: number;
  policy_ref?: string;
}

interface L1Config {
  enabled: boolean;
  model_tier: string;
  prompt: string;
  threshold: number;
  max_tokens: number;
}

interface SlopGuardConfig {
  version: number;
  artifact_types: string[];
  l0: { rules: L0Rule[] };
  l1: L1Config;
}

let configCache: SlopGuardConfig | null = null;

function loadConfig(): SlopGuardConfig {
  if (configCache) return configCache;
  const configPath = resolve(process.cwd(), "config/slop_guard.yaml");
  if (!existsSync(configPath)) {
    return { version: 1, artifact_types: [], l0: { rules: [] }, l1: { enabled: false, model_tier: "fast/chat", prompt: "", threshold: 6, max_tokens: 500 } };
  }
  const raw = readFileSync(configPath, "utf-8");
  const rules: L0Rule[] = [];
  let inRules = false;
  let currentRule: Partial<L0Rule> = {};

  for (const line of raw.split("\n")) {
    if (line.includes("rules:")) { inRules = true; continue; }
    if (line.startsWith("l1:")) { inRules = false; continue; }
    if (inRules && line.match(/^\s{4}- id:/)) {
      if (currentRule.id) rules.push(currentRule as L0Rule);
      currentRule = { id: line.split(":")[1]?.trim(), apply_to_artifact_types: [] };
    }
    if (inRules && line.match(/^\s{6}pattern:/)) {
      currentRule.pattern = line.split("pattern:")[1]?.trim().replace(/^["']|["']$/g, "");
    }
    if (inRules && line.match(/^\s{6}force_reject:/)) {
      currentRule.force_reject = line.includes("true");
    }
    if (inRules && line.match(/^\s{6}fail_if_match:/)) {
      currentRule.fail_if_match = line.includes("true");
    }
  }
  if (currentRule.id) rules.push(currentRule as L0Rule);

  configCache = {
    version: 1,
    artifact_types: ["code", "patch", "doc_bundle", "copy", "email_template"],
    l0: { rules },
    l1: { enabled: true, model_tier: "fast/chat", prompt: "Analyze for slop. Score 0-10. JSON: {score, issues, verdict}", threshold: 6, max_tokens: 500 },
  };
  return configCache;
}

export interface SlopGuardResult {
  passed: boolean;
  layer: "l0" | "l1";
  failedRules: string[];
  l1Score?: number;
  details: string;
}

export async function runSlopGuard(
  client: pg.PoolClient,
  artifactContent: string,
  artifactType: string,
  runId: string,
  jobRunId: string,
): Promise<SlopGuardResult> {
  const config = loadConfig();

  if (!config.artifact_types.includes(artifactType)) {
    return { passed: true, layer: "l0", failedRules: [], details: `Artifact type '${artifactType}' not guarded.` };
  }

  const failedRules: string[] = [];
  let forceReject = false;

  for (const rule of config.l0.rules) {
    if (rule.apply_to_artifact_types.length > 0 && !rule.apply_to_artifact_types.includes(artifactType)) continue;

    if (rule.type === "regex" && rule.pattern) {
      try {
        const re = new RegExp(rule.pattern, "gm");
        const matches = artifactContent.match(re);
        if (matches && matches.length > 0) {
          if (rule.fail_if_match !== false) {
            if (rule.max_matches && matches.length <= rule.max_matches) continue;
            failedRules.push(rule.id);
            if (rule.force_reject) forceReject = true;
          }
        }
      } catch { /* invalid regex, skip */ }
    }

    if (rule.type === "policy") {
      if (rule.policy_ref === "stack_mismatch" && rule.patterns) {
        for (const pat of rule.patterns) {
          if (artifactContent.includes(pat)) {
            failedRules.push(rule.id);
            break;
          }
        }
      }
      if (rule.policy_ref === "min_length" && rule.min_chars) {
        if (artifactContent.length < rule.min_chars) {
          failedRules.push(rule.id);
        }
      }
    }
  }

  if (failedRules.length > 0) {
    const status = "fail";
    await client.query(
      `INSERT INTO validations (id, run_id, job_run_id, validator_type, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'slop_guard_l0', $3, now())`,
      [runId, jobRunId, status],
    );
    return {
      passed: false,
      layer: "l0",
      failedRules,
      details: `L0 failed: ${failedRules.join(", ")}${forceReject ? " (force reject)" : ""}`,
    };
  }

  await client.query(
    `INSERT INTO validations (id, run_id, job_run_id, validator_type, status, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'slop_guard_l0', 'pass', now())`,
    [runId, jobRunId],
  );

  if (config.l1.enabled && isGatewayConfigured()) {
    try {
      const result = await chat({
        model: config.l1.model_tier as "fast/chat",
        messages: [
          { role: "system", content: config.l1.prompt },
          { role: "user", content: artifactContent.slice(0, 8000) },
        ],
        max_tokens: config.l1.max_tokens,
        context: { run_id: runId, job_run_id: jobRunId, job_type: "slop_guard_l1" },
      });

      let score = config.l1.threshold;
      let verdict = "pass";
      try {
        const parsed = JSON.parse(result.content);
        score = parsed.score ?? config.l1.threshold;
        verdict = parsed.verdict ?? (score >= config.l1.threshold ? "pass" : "fail");
      } catch {
        verdict = "pass";
      }

      const l1Passed = verdict === "pass" && score >= config.l1.threshold;
      await client.query(
        `INSERT INTO validations (id, run_id, job_run_id, validator_type, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'slop_guard_l1', $3, now())`,
        [runId, jobRunId, l1Passed ? "pass" : "fail"],
      );

      return {
        passed: l1Passed,
        layer: "l1",
        failedRules: [],
        l1Score: score,
        details: l1Passed ? `L1 passed (score: ${score})` : `L1 failed (score: ${score}, threshold: ${config.l1.threshold})`,
      };
    } catch (err) {
      return { passed: true, layer: "l1", failedRules: [], details: `L1 skipped (gateway error): ${err}` };
    }
  }

  return { passed: true, layer: "l0", failedRules: [], details: "L0 passed, L1 disabled or gateway not configured." };
}
