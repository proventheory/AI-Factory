/**
 * Executor registry: job_type → Executor (kernel contract).
 * Run a job via ExecutorRegistry.run(jobType, request); persist result with persistJobResult.
 * See docs/STACK_AND_DECISIONS.md §7.1 and control-plane/src/kernel-contract.ts.
 */
import { createHash } from "node:crypto";
import { v4 as uuid } from "uuid";
// ---------------------------------------------------------------------------
// Registry: job_type → Executor
// ---------------------------------------------------------------------------
const executors = new Map();
export function registerExecutor(jobType, executor) {
    executors.set(jobType, executor);
}
export function getExecutor(jobType) {
    return executors.get(jobType);
}
/**
 * Run an executor for the given job type. Returns JobResult; caller is responsible
 * for persisting via persistJobResult (and optionally completing job_run).
 */
export async function run(jobType, request) {
    const executor = executors.get(jobType);
    if (!executor) {
        return {
            success: false,
            artifacts: [],
            error: `No executor registered for job_type=${jobType}`,
        };
    }
    return executor.run(request);
}
/**
 * Build JobRequest from runner JobContext. Use when invoking ExecutorRegistry.run()
 * so edge frameworks receive the kernel contract shape.
 */
export function jobRequestFromContext(context) {
    return {
        job_type: context.job_type,
        run_id: context.run_id,
        plan_node_id: context.plan_node_id,
        initiative_id: context.initiative_id,
        node_key: context.node_key,
        agent_role: context.agent_role,
        workspace_path: context.workspace_path,
        input: {
            predecessor_artifact_refs: context.predecessor_artifact_ids,
            options: {
                predecessor_artifacts: context.predecessor_artifacts,
            },
            human_feedback: context.human_feedback,
        },
    };
}
// ---------------------------------------------------------------------------
// Logging schema: persist JobResult (artifacts + tool_calls) in kernel shape
// ---------------------------------------------------------------------------
/**
 * Persist JobResult into the kernel (artifacts + optional tool_calls).
 * Every artifact is stored with producer_plan_node_id for lineage.
 * Tool calls are recorded with the given adapterId (required by schema);
 * use a "runner" or "executor" adapter for executor-native tool calls.
 */
export async function persistJobResult(client, result, params) {
    for (const art of result.artifacts) {
        await recordArtifact(client, art, {
            runId: params.runId,
            jobRunId: params.jobRunId,
            producerPlanNodeId: params.planNodeId,
        });
    }
    if (result.tool_calls && result.tool_calls.length > 0 && params.adapterIdForToolCalls) {
        for (const tc of result.tool_calls) {
            await recordToolCall(client, tc, {
                jobRunId: params.jobRunId,
                runId: params.runId,
                planNodeId: params.planNodeId,
                adapterId: params.adapterIdForToolCalls,
            });
        }
    }
}
/**
 * Record a single artifact in the kernel shape (run_id, job_run_id, producer_plan_node_id,
 * artifact_type, uri, artifact_class, sha256, metadata_json). Every edge framework
 * should emit artifacts in this shape for reproducibility and lineage.
 */
export async function recordArtifact(client, record, params) {
    const id = uuid();
    const artifactClass = (record.artifact_class ?? "docs");
    const metadataJson = record.metadata ? JSON.stringify(record.metadata) : null;
    try {
        await client.query(`INSERT INTO artifacts (
         id, run_id, job_run_id, producer_plan_node_id,
         artifact_type, artifact_class, uri, sha256, metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
            id,
            params.runId,
            params.jobRunId,
            params.producerPlanNodeId,
            record.artifact_type,
            artifactClass,
            record.uri,
            record.sha256 ?? null,
            metadataJson,
        ]);
    }
    catch {
        await client.query(`INSERT INTO artifacts (
         id, run_id, job_run_id, artifact_type, artifact_class, uri, sha256, metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            id,
            params.runId,
            params.jobRunId,
            record.artifact_type,
            artifactClass,
            record.uri,
            record.sha256 ?? null,
            metadataJson,
        ]);
    }
    return id;
}
/**
 * Record a single tool call in the kernel shape. Uses same schema as tool_calls table:
 * job_run_id, adapter_id, capability, operation_key, idempotency_key, request_hash, status.
 * Caller must provide adapterId (use a registered "runner" adapter for executor-native calls).
 */
export async function recordToolCall(client, record, params) {
    const adapterName = params.adapterName ?? "executor";
    const idempotencyKey = createHash("sha256")
        .update(`${params.runId}:${params.planNodeId}:${adapterName}:${record.capability}:${record.operation_key}`)
        .digest("hex");
    const requestHash = createHash("sha256")
        .update(JSON.stringify(record.input_payload, Object.keys(record.input_payload).sort()))
        .digest("hex");
    const toolCallId = uuid();
    await client.query(`INSERT INTO tool_calls (
       id, job_run_id, adapter_id, capability, operation_key,
       idempotency_key, request_hash, status, response_artifact_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
        toolCallId,
        params.jobRunId,
        params.adapterId,
        record.capability,
        record.operation_key,
        idempotencyKey,
        requestHash,
        record.result_artifact_id ? "succeeded" : "pending",
        record.result_artifact_id ?? null,
    ]);
    return toolCallId;
}
//# sourceMappingURL=executor-registry.js.map