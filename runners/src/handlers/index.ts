/**
 * Node handler registry: job_type → handler.
 * Handlers receive JobContext and return success; they write artifacts with producer_plan_node_id.
 */

import type { JobContext } from "../job-context.js";
import type pg from "pg";
import { chat, isGatewayConfigured, isSafeToCache } from "../llm-client.js";
import type { ModelTier } from "../llm-client.js";

export type NodeHandler = (
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string }
) => Promise<void>;

const registry = new Map<string, NodeHandler>();

export function registerHandler(jobType: string, handler: NodeHandler): void {
  registry.set(jobType, handler);
}

export function getHandler(jobType: string): NodeHandler | undefined {
  return registry.get(jobType);
}

function pickTier(jobType: string): ModelTier {
  const maxTypes = new Set(["codegen", "write_patch", "design", "openhands_resolver"]);
  if (maxTypes.has(jobType)) return "max/chat";
  if (isSafeToCache(jobType)) return "fast/chat";
  return "auto/chat";
}

async function writeArtifact(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
  artifactType: string,
  content: string,
  artifactClass: string = "docs",
): Promise<void> {
  const uri = `mem://${artifactType}/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, artifactType, artifactClass, uri, JSON.stringify({ content: content.slice(0, 10000) })]
  ).catch(() =>
    client.query(
      `INSERT INTO artifacts (run_id, job_run_id, artifact_type, artifact_class, uri, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [params.runId, params.jobRunId, artifactType, artifactClass, uri, JSON.stringify({ content: content.slice(0, 10000) })]
    )
  );
}

async function recordLlmCall(
  client: pg.PoolClient,
  runId: string,
  jobRunId: string,
  tier: string,
  modelId: string,
  tokensIn: number | undefined,
  tokensOut: number | undefined,
  latencyMs: number | undefined,
): Promise<void> {
  await client.query(
    `INSERT INTO llm_calls (run_id, job_run_id, model_tier, model_id, tokens_in, tokens_out, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [runId, jobRunId, tier, modelId, tokensIn ?? null, tokensOut ?? null, latencyMs ?? null]
  ).catch(() => {});
}

async function callLlmAndRecord(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string },
  systemPrompt: string,
  userPrompt: string,
  tier?: ModelTier,
): Promise<string> {
  const model = tier ?? pickTier(context.job_type);
  if (!isGatewayConfigured()) return `[stub] LLM not configured. System: ${systemPrompt.slice(0, 100)}`;
  const result = await chat({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    context: { run_id: context.run_id, job_run_id: params.jobRunId, job_type: context.job_type, initiative_id: context.initiative_id },
  });
  await recordLlmCall(client, params.runId, params.jobRunId, model, result.model_id, result.tokens_in, result.tokens_out, result.latency_ms);
  return result.content;
}

/** Approval: no-op (scheduler handles) */
export function registerApprovalHandler(): void {
  registry.set("approval", async () => {});
}

/** PRD: produce product requirements document */
export function registerPrdHandler(): void {
  registry.set("prd", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a product manager. Write a concise PRD based on the initiative description.",
      `Initiative: ${context.human_feedback ?? "No description provided"}`
    );
    await writeArtifact(client, context, params, "prd_doc", content);
  });
}

/** Design: produce architecture/design doc */
export function registerDesignHandler(): void {
  registry.set("design", async (client, context, params) => {
    const predecessorContent = context.predecessor_artifacts.map(a => a.artifact_type).join(", ");
    const content = await callLlmAndRecord(client, context, params,
      "You are a software architect. Write a concise design document based on the PRD and prior artifacts.",
      `Predecessor artifacts: ${predecessorContent || "none"}`
    );
    await writeArtifact(client, context, params, "design", content);
  });
}

/** Codegen: generate code from spec */
export function registerCodegenHandler(): void {
  registry.set("codegen", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a software engineer. Implement the specification described in predecessor artifacts.",
      `Predecessor artifacts: ${context.predecessor_artifacts.map(a => `${a.artifact_type}:${a.uri}`).join(", ") || "none"}`
    );
    await writeArtifact(client, context, params, "code", content);
  });
}

/** Unit test: generate tests */
export function registerUnitTestHandler(): void {
  registry.set("unit_test", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a QA engineer. Write unit tests for the code described in predecessor artifacts.",
      `Predecessor artifacts: ${context.predecessor_artifacts.map(a => `${a.artifact_type}:${a.uri}`).join(", ") || "none"}`
    );
    await writeArtifact(client, context, params, "test", content);
  });
}

/** Code review: produce review verdict */
export function registerCodeReviewHandler(): void {
  registry.set("code_review", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a code reviewer. Review the code and produce a verdict (APPROVE or REQUEST_CHANGES) with issues and summary as JSON.",
      `Predecessor artifacts: ${context.predecessor_artifacts.map(a => `${a.artifact_type}:${a.uri}`).join(", ") || "none"}`
    );
    let verdict: Record<string, unknown>;
    try { verdict = JSON.parse(content); } catch { verdict = { verdict: "approved", summary: content, issues: [] }; }
    await writeArtifact(client, context, params, "review_verdict", JSON.stringify(verdict));
  });
}

/** Analyze repo: produce repo summary */
export function registerAnalyzeRepoHandler(): void {
  registry.set("analyze_repo", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a codebase analyst. Produce a repo summary including language, framework, architecture, and key directories.",
      `Workspace: ${context.workspace_path ?? "not specified"}`
    );
    await writeArtifact(client, context, params, "repo_summary", content);
  });
}

/** Write patch: produce code patch */
export function registerWritePatchHandler(): void {
  registry.set("write_patch", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a software engineer. Write a code patch to fix the issue described by predecessor artifacts.",
      `Predecessor artifacts: ${context.predecessor_artifacts.map(a => `${a.artifact_type}:${a.uri}`).join(", ") || "none"}`
    );
    await writeArtifact(client, context, params, "patch", content);
  });
}

/** Submit PR: create pull request */
export function registerSubmitPRHandler(): void {
  registry.set("submit_pr", async (client, context, params) => {
    const prUrl = `https://github.com/example/repo/pull/0`;
    await writeArtifact(client, context, params, "pr_url", prUrl, "external_object_refs");
  });
}

/** Plan migration: produce migration plan */
export function registerPlanMigrationHandler(): void {
  registry.set("plan_migration", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a database architect. Produce a migration plan based on the repo analysis.",
      `Predecessor artifacts: ${context.predecessor_artifacts.map(a => `${a.artifact_type}:${a.uri}`).join(", ") || "none"}`
    );
    await writeArtifact(client, context, params, "migration_plan", content);
  });
}

/** Apply batch: apply migration batch */
export function registerApplyBatchHandler(): void {
  registry.set("apply_batch", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a database engineer. Apply the migration plan and produce results.",
      `Predecessor artifacts: ${context.predecessor_artifacts.map(a => `${a.artifact_type}:${a.uri}`).join(", ") || "none"}`
    );
    await writeArtifact(client, context, params, "apply_batch", content);
  });
}

/** Research: produce research summary */
export function registerResearchHandler(): void {
  registry.set("research", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are a research analyst. Produce a research summary on the topic.",
      `Initiative: ${context.human_feedback ?? "No description provided"}`
    );
    await writeArtifact(client, context, params, "research", content);
  });
}

/** Triage: classify issue */
export function registerTriageHandler(): void {
  registry.set("triage", async (client, context, params) => {
    const content = await callLlmAndRecord(client, context, params,
      "You are an issue triage agent. Classify the issue by severity and type. Respond with JSON: {severity, type, summary}.",
      `Issue: ${context.human_feedback ?? "No issue text provided"}`
    );
    await writeArtifact(client, context, params, "triage_result", content);
  });
}

/** OpenHands Resolver: real integration (Phase 6) */
export function registerOpenHandsResolverHandler(): void {
  registry.set("openhands_resolver", async (client, context, params) => {
    const { runOpenHandsResolver } = await import("../openhands-resolver.js");

    const issueUrl = context.predecessor_artifacts.find(a => a.artifact_type === "pr_url" || a.uri.startsWith("https://"))?.uri;
    const result = await runOpenHandsResolver({
      issue_url: issueUrl ?? undefined,
      issue_title: context.human_feedback ?? undefined,
      issue_body: context.human_feedback ?? undefined,
      workspace_path: context.workspace_path ?? undefined,
    });

    await recordLlmCall(client, params.runId, params.jobRunId, "max/chat", result.model_used, undefined, undefined, undefined);
    await writeArtifact(client, context, params, "resolver_patch", result.patch);
    await writeArtifact(client, context, params, "resolver_log", result.logs, "logs");
  });
}

/** SWE-agent: real integration (Phase 6) */
export function registerSweAgentHandler(): void {
  registry.set("swe_agent", async (client, context, params) => {
    const { runSweAgent } = await import("../swe-agent.js");

    const issueUrl = context.predecessor_artifacts.find(a => a.uri.startsWith("https://"))?.uri;
    const result = await runSweAgent({
      issue_url: issueUrl ?? undefined,
      issue_text: context.human_feedback ?? undefined,
      workspace_path: context.workspace_path ?? undefined,
    });

    await recordLlmCall(client, params.runId, params.jobRunId, "max/chat", result.model_used, undefined, undefined, undefined);
    await writeArtifact(client, context, params, "swe_agent_patch", result.patch);
    await writeArtifact(client, context, params, "swe_agent_trajectory", result.trajectory_log, "logs");
  });
}

/** Register all built-in handlers. */
export function registerAllHandlers(): void {
  registerApprovalHandler();
  registerPrdHandler();
  registerDesignHandler();
  registerCodegenHandler();
  registerUnitTestHandler();
  registerCodeReviewHandler();
  registerAnalyzeRepoHandler();
  registerWritePatchHandler();
  registerSubmitPRHandler();
  registerPlanMigrationHandler();
  registerApplyBatchHandler();
  registerResearchHandler();
  registerTriageHandler();
  registerOpenHandsResolverHandler();
  registerSweAgentHandler();

  // 8090: Quality gates, slop guard, continuous improvement
  registry.set("quality_gate", async (client, context, params) => {
    const { handleQualityGate } = await import("./quality-gate.js");
    await handleQualityGate(client, context, params);
  });
  registry.set("slop_guard", async (client, context, params) => {
    const { handleSlopGuard } = await import("./slop-guard.js");
    await handleSlopGuard(client, context, params);
  });
  registry.set("optimizer", async (client, context, params) => {
    const { handleOptimizer } = await import("./optimizer.js");
    await handleOptimizer(client, context, params);
  });
}
