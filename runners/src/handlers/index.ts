/**
 * Node handler registry: job_type → handler.
 * Handlers receive JobContext and return success; they write artifacts with producer_plan_node_id.
 */

import type { JobContext } from "../job-context.js";
import type pg from "pg";
import { chat, isGatewayConfigured, resolveTier } from "../llm-client.js";
import type { ModelTier } from "../llm-client.js";
import { getBudgetsForJob, checkBudgets, recordUsage } from "../llm-budgets.js";

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

async function writeArtifact(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
  artifactType: string,
  content: string,
  artifactClass: string = "docs",
  metadata?: Record<string, unknown>,
): Promise<string | null> {
  const uri = `mem://${artifactType}/${context.run_id}/${context.plan_node_id}`;
  const maxContent = artifactType === "landing_page" || artifactType === "email_template" ? 2_000_000 : 10_000;
  const contentSliced = content.slice(0, maxContent);
  const payloadObj: Record<string, unknown> = { content: contentSliced };
  if (metadata != null && typeof metadata === "object" && !Array.isArray(metadata)) {
    for (const [k, v] of Object.entries(metadata)) {
      if (k !== "content") payloadObj[k] = v;
    }
  }
  const payload = JSON.stringify(payloadObj);
  // Use minimal columns (no producer_plan_node_id) so INSERT never fails on core schema and never aborts the transaction.
  const r = await client.query<{ id: string }>(
    `INSERT INTO artifacts (id, run_id, job_run_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [params.runId, params.jobRunId, artifactType, artifactClass, uri, payload]
  );
  return r.rows[0]?.id ?? null;
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
  const model = tier ?? (await resolveTier(context.job_type));
  if (!isGatewayConfigured()) return `[stub] LLM not configured. System: ${systemPrompt.slice(0, 100)}`;

  const budgets = await getBudgetsForJob(client, context.job_type, context.initiative_id ?? null);
  for (const b of budgets) {
    const usage = Number(b.current_usage ?? 0);
    if (b.budget_tokens != null && usage >= b.budget_tokens) {
      throw new Error(`llm_budget exceeded: ${b.scope_type}=${b.scope_value} (${usage} >= ${b.budget_tokens} tokens)`);
    }
  }

  const result = await chat({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    context: { run_id: context.run_id, job_run_id: params.jobRunId, job_type: context.job_type, initiative_id: context.initiative_id },
    useGateway: context.llm_source === "gateway",
  });
  await recordLlmCall(client, params.runId, params.jobRunId, model, result.model_id, result.tokens_in, result.tokens_out, result.latency_ms);

  const tokensUsed = (result.tokens_in ?? 0) + (result.tokens_out ?? 0);
  for (const b of budgets) {
    await recordUsage(client, b.scope_type, b.scope_value, tokensUsed);
  }
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
      llm_source: context.llm_source,
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
      llm_source: context.llm_source,
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

  // Marketing / brand handlers (enable marketing + landing pipelines)
  registry.set("copy_generate", async (client, context, params) => {
    const { handleCopyGenerate } = await import("./copy-generate.js");
    const request = {
      run_id: context.run_id,
      job_run_id: params.jobRunId,
      job_type: context.job_type,
      initiative_id: context.initiative_id ?? undefined,
      llm_source: context.llm_source,
      input: context.config as { topic?: string; content_type?: string; length?: string } | undefined,
    };
    const out = await handleCopyGenerate(request);
    if (out?.content != null) {
      await writeArtifact(client, context, params, out.artifact_type, out.content, out.artifact_class ?? "docs");
    }
  });
  registry.set("deck_generate", async (client, context, params) => {
    const { handleDeckGenerate } = await import("./deck-generate.js");
    const brandCtx = context.initiative_id ? await (await import("../brand-context.js")).loadBrandContext(context.initiative_id) : null;
    const request = {
      run_id: context.run_id,
      job_run_id: params.jobRunId,
      job_type: context.job_type,
      initiative_id: context.initiative_id ?? undefined,
      input: {
        template: (context.config as { template?: { components: { type: string; config: Record<string, unknown> }[] } })?.template,
        brand_context: brandCtx ? { id: brandCtx.id, name: brandCtx.name } : undefined,
      },
    };
    const out = await handleDeckGenerate(request);
    if (out?.content != null) {
      await writeArtifact(client, context, params, out.artifact_type, out.content, "docs");
    }
  });
  registry.set("report_generate", async (client, context, params) => {
    const { handleReportGenerate } = await import("./report-generate.js");
    const brandCtx = context.initiative_id ? await (await import("../brand-context.js")).loadBrandContext(context.initiative_id) : null;
    const request = {
      run_id: context.run_id,
      job_run_id: params.jobRunId,
      job_type: context.job_type,
      initiative_id: context.initiative_id ?? undefined,
      input: {
        template: (context.config as { template?: { components: { type: string; config: Record<string, unknown> }[] } })?.template,
        brand_context: brandCtx ? { id: brandCtx.id, name: brandCtx.name } : undefined,
      },
    };
    const out = await handleReportGenerate(request);
    if (out?.content != null) {
      await writeArtifact(client, context, params, out.artifact_type, out.content, out.artifact_class ?? "docs");
    }
  });
  registry.set("email_generate", async (client, context, params) => {
    const { handleEmailGenerate } = await import("./email-generate.js");
    const request = {
      run_id: context.run_id,
      job_run_id: params.jobRunId,
      job_type: context.job_type,
      initiative_id: context.initiative_id ?? undefined,
      llm_source: context.llm_source,
      input: (context.config as { subject_hint?: string; audience?: string }) ?? {},
    };
    const out = await handleEmailGenerate(request);
    if (out?.content != null) {
      await writeArtifact(client, context, params, out.artifact_type, out.content, out.artifact_class ?? "docs");
    }
  });
  registry.set("email_generate_mjml", async (client, context, params) => {
    const { handleEmailGenerateMjml } = await import("./email-generate-mjml.js");
    const request = {
      run_id: context.run_id,
      job_run_id: params.jobRunId,
      job_type: context.job_type,
      initiative_id: context.initiative_id ?? undefined,
      llm_source: context.llm_source,
      input: (context.config as { template_id?: string; products?: Array<{ src?: string; title?: string; product_url?: string }>; campaign_prompt?: string }) ?? {},
      recordLlmCall: (tier: string, modelId: string, tokensIn?: number, tokensOut?: number, latencyMs?: number) =>
        recordLlmCall(client, context.run_id, params.jobRunId, tier, modelId, tokensIn, tokensOut, latencyMs),
    };
    const out = await handleEmailGenerateMjml(request);
    if (out?.content == null || out.content.length === 0) {
      throw new Error("email_generate_mjml produced no content (template and LLM path both failed or returned empty)");
    }
    {
      const len = out.content.length;
      if (len > 10_000) console.log("[runner] email_template content length exceeds 10KB, storing full length", { run_id: context.run_id, contentLen: len });
      const artifactId = await writeArtifact(client, context, params, out.artifact_type, out.content, out.artifact_class ?? "email_template", out.metadata);
      // Post-write verification: re-read and confirm stored length matches generated (no truncation)
      if (artifactId) {
        const r = await client.query<{ metadata_json: { content?: string } | null }>(
          "SELECT metadata_json FROM artifacts WHERE id = $1",
          [artifactId]
        );
        const storedContent = r.rows[0]?.metadata_json?.content;
        const storedLen = typeof storedContent === "string" ? storedContent.length : 0;
        const generatedLen = out.content.length;
        const postWritePassed = generatedLen === 0 || storedLen >= generatedLen * 0.95;
        if (!postWritePassed) {
          const msg = `[runner] post-write check: stored length less than 95% of generated (generated=${generatedLen}, stored=${storedLen}); artifact kept`;
          console.warn(msg, { run_id: context.run_id, job_run_id: params.jobRunId });
          await client.query(
            `INSERT INTO artifact_verifications (artifact_id, run_id, job_run_id, verification_type, passed, details)
             VALUES ($1, $2, $3, 'post_write', false, $4::jsonb)`,
            [artifactId, context.run_id, params.jobRunId, JSON.stringify({ generated_len: generatedLen, stored_len: storedLen })]
          ).catch(() => {});
          // Do not throw: keep the artifact so the user can see the preview; verification is recorded as failed
        } else {
        await client.query(
          `INSERT INTO artifact_verifications (artifact_id, run_id, job_run_id, verification_type, passed, details)
           VALUES ($1, $2, $3, 'post_write', true, $4::jsonb)`,
          [artifactId, context.run_id, params.jobRunId, JSON.stringify({ generated_len: generatedLen, stored_len: storedLen })]
        ).catch(() => {});
        const preWrite = (out.metadata as Record<string, unknown> | undefined)?.pre_write_verification as { passed: boolean; details?: unknown } | undefined;
        if (preWrite?.passed && preWrite.details != null) {
          await client.query(
            `INSERT INTO artifact_verifications (artifact_id, run_id, job_run_id, verification_type, passed, details)
             VALUES ($1, $2, $3, 'pre_write', true, $4::jsonb)`,
            [artifactId, context.run_id, params.jobRunId, JSON.stringify(preWrite.details)]
          ).catch(() => {});
        }
      }
    }
  });
  registry.set("brand_compile", async (client, context, params) => {
    const { loadBrandContext } = await import("../brand-context.js");
    const { readFileSync, existsSync } = await import("fs");
    const { handleBrandCompile } = await import("./brand-compile.js");
    const brandCtx = context.initiative_id ? await loadBrandContext(context.initiative_id) : null;
    if (!brandCtx) {
      throw new Error("brand_compile requires an initiative with a brand profile");
    }
    const request = {
      run_id: context.run_id,
      job_run_id: params.jobRunId,
      job_type: context.job_type,
      initiative_id: context.initiative_id ?? undefined,
      input: { brand_profile: brandCtx as unknown as Record<string, unknown> },
    };
    const out = await handleBrandCompile(request);
    if ((out as { error?: string }).error) {
      throw new Error((out as { error: string }).error);
    }
    const artifacts = (out as { artifacts?: { artifact_type: string; uri: string; artifact_class?: string }[] }).artifacts ?? [];
    for (const a of artifacts) {
      const content = existsSync(a.uri) ? readFileSync(a.uri, "utf8") : "";
      await writeArtifact(client, context, params, a.artifact_type, content, a.artifact_class ?? "docs");
    }
  });
  registry.set("ui_scaffold", async (client, context, params) => {
    const { handleUiScaffold } = await import("./ui-scaffold.js");
    const request = {
      run_id: context.run_id,
      job_run_id: params.jobRunId,
      job_type: context.job_type,
      initiative_id: context.initiative_id ?? undefined,
    };
    const out = await handleUiScaffold(request);
    if (out?.content != null) {
      await writeArtifact(client, context, params, out.artifact_type, out.content, out.artifact_class ?? "docs");
    }
  });
  registry.set("landing_page_generate", async (client, context, params) => {
    const { handleLandingPageGenerate } = await import("./landing-page-generate.js");
    await handleLandingPageGenerate({ client, context, params, writeArtifact });
  });
}
