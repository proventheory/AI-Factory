/**
 * Executor registry: job_type → Executor (kernel contract).
 * Run a job via ExecutorRegistry.run(jobType, request); persist result with persistJobResult.
 * See docs/STACK_AND_DECISIONS.md §7.1 and control-plane/src/kernel-contract.ts.
 */
import type pg from "pg";
import type { JobRequest, JobResult, Executor, ArtifactRecord, ToolCallRecord } from "../../control-plane/src/kernel-contract.js";
import type { JobContext } from "./job-context.js";
export declare function registerExecutor(jobType: string, executor: Executor): void;
export declare function getExecutor(jobType: string): Executor | undefined;
/**
 * Run an executor for the given job type. Returns JobResult; caller is responsible
 * for persisting via persistJobResult (and optionally completing job_run).
 */
export declare function run(jobType: string, request: JobRequest): Promise<JobResult>;
/**
 * Build JobRequest from runner JobContext. Use when invoking ExecutorRegistry.run()
 * so edge frameworks receive the kernel contract shape.
 */
export declare function jobRequestFromContext(context: JobContext): JobRequest;
/**
 * Persist JobResult into the kernel (artifacts + optional tool_calls).
 * Every artifact is stored with producer_plan_node_id for lineage.
 * Tool calls are recorded with the given adapterId (required by schema);
 * use a "runner" or "executor" adapter for executor-native tool calls.
 */
export declare function persistJobResult(client: pg.PoolClient, result: JobResult, params: {
    runId: string;
    jobRunId: string;
    planNodeId: string;
    /** Required when result.tool_calls is present (adapters.id). */
    adapterIdForToolCalls?: string | null;
}): Promise<void>;
/**
 * Record a single artifact in the kernel shape (run_id, job_run_id, producer_plan_node_id,
 * artifact_type, uri, artifact_class, sha256, metadata_json). Every edge framework
 * should emit artifacts in this shape for reproducibility and lineage.
 */
export declare function recordArtifact(client: pg.PoolClient, record: ArtifactRecord, params: {
    runId: string;
    jobRunId: string;
    producerPlanNodeId: string;
}): Promise<string>;
/**
 * Record a single tool call in the kernel shape. Uses same schema as tool_calls table:
 * job_run_id, adapter_id, capability, operation_key, idempotency_key, request_hash, status.
 * Caller must provide adapterId (use a registered "runner" adapter for executor-native calls).
 */
export declare function recordToolCall(client: pg.PoolClient, record: ToolCallRecord, params: {
    jobRunId: string;
    runId: string;
    planNodeId: string;
    adapterId: string;
    adapterName?: string;
}): Promise<string>;
//# sourceMappingURL=executor-registry.d.ts.map