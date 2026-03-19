/**
 * Node handler registry: job_type → handler.
 * Handlers receive JobContext and return success; they write artifacts with producer_plan_node_id.
 */
import type { JobContext } from "../job-context.js";
import type pg from "pg";
export type NodeHandler = (client: pg.PoolClient, context: JobContext, params: {
    runId: string;
    jobRunId: string;
    planNodeId: string;
}) => Promise<void>;
export declare function registerHandler(jobType: string, handler: NodeHandler): void;
export declare function getHandler(jobType: string): NodeHandler | undefined;
/** Approval: no-op (scheduler handles) */
export declare function registerApprovalHandler(): void;
/** PRD: produce product requirements document */
export declare function registerPrdHandler(): void;
/** Design: produce architecture/design doc */
export declare function registerDesignHandler(): void;
/** Codegen: generate code from spec */
export declare function registerCodegenHandler(): void;
/** Unit test: generate tests */
export declare function registerUnitTestHandler(): void;
/** Code review: produce review verdict */
export declare function registerCodeReviewHandler(): void;
/** Analyze repo: produce repo summary; when goal_metadata.deploy_failure is set, include logs so the LLM can diagnose the failure. */
export declare function registerAnalyzeRepoHandler(): void;
/** Write patch: produce code patch; when goal_metadata.deploy_failure is set, emphasize fixing the deploy error from the repo summary. */
export declare function registerWritePatchHandler(): void;
/** Submit PR: create pull request */
export declare function registerSubmitPRHandler(): void;
/** Push fix: apply patch and push to main. Used by deploy_fix template when ALLOW_SELF_HEAL_PUSH=true. */
export declare function registerPushFixHandler(): void;
/** Plan migration: produce migration plan */
export declare function registerPlanMigrationHandler(): void;
/** Apply batch: apply migration batch */
export declare function registerApplyBatchHandler(): void;
/** Research: produce research summary */
export declare function registerResearchHandler(): void;
/** Triage: classify issue */
export declare function registerTriageHandler(): void;
/** OpenHands Resolver: real integration (Phase 6) */
export declare function registerOpenHandsResolverHandler(): void;
/** SWE-agent: real integration (Phase 6) */
export declare function registerSweAgentHandler(): void;
/** Register all built-in handlers. */
export declare function registerAllHandlers(): void;
//# sourceMappingURL=index.d.ts.map