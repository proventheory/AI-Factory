import type { DbClient } from "./db.js";
import type { Environment, Cohort } from "./types.js";
/**
 * Scheduler: creates runs, initializes node_progress, enqueues roots,
 * and advances successors when nodes complete.
 */
export interface CreateRunParams {
    planId: string;
    releaseId: string;
    policyVersion: string;
    environment: Environment;
    cohort: Cohort | null;
    rootIdempotencyKey: string;
    routingReason?: string;
    routingRuleId?: string;
    promptTemplateVersion?: string;
    adapterContractVersion?: string;
    /** 'gateway' = use LLM_GATEWAY_URL; 'openai_direct' = use OPENAI_API_KEY on runner. Default 'gateway'. */
    llmSource?: "gateway" | "openai_direct" | null;
}
export declare function createRun(db: DbClient, params: CreateRunParams): Promise<string>;
/**
 * Called after a job_run succeeds: advance successor nodes.
 * Must be called under the run's scheduler lock.
 */
export declare function advanceSuccessors(db: DbClient, runId: string, completedNodeId: string, winningJobRunId: string): Promise<void>;
/**
 * Complete an approval node after human approved: create synthetic job_run (succeeded), node_completions, update node_progress, advance successors.
 */
export declare function completeApprovalAndAdvance(db: DbClient, runId: string, planNodeId: string): Promise<void>;
/**
 * Check if all nodes in the run have succeeded; if so, mark the run succeeded.
 */
export declare function checkRunCompletion(db: DbClient, runId: string): Promise<boolean>;
/**
 * When a job fails, mark the run as failed if there are no more queued or running
 * job_runs for this run. So the run status stops being "running" and pollers (e.g.
 * the email wizard) see "failed" instead of timing out.
 */
export declare function markRunFailedIfNoPendingJobs(db: DbClient, runId: string): Promise<void>;
/**
 * Acquire the scheduler lock for a run (prevents duplicate schedulers).
 */
export declare function acquireRunLock(db: DbClient, runId: string, lockDurationMs?: number): Promise<string | null>;
export declare function releaseRunLock(db: DbClient, runId: string, token: string): Promise<void>;
//# sourceMappingURL=scheduler.d.ts.map