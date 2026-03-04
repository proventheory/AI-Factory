/**
 * Kernel contract: executor interface for multi-framework support.
 * See docs/STACK_AND_DECISIONS.md §7.1.
 *
 * LangGraph is the kernel; AutoGen/CrewAI/custom plug in by implementing
 * (1) job schema (JobRequest → JobResult) (2) tool recording (ToolCallRecord)
 * (3) memory (predecessor artifacts + agent_memory). This file defines the
 * TypeScript shapes so every edge framework records the same structure.
 *
 * Logging schema (every edge framework must conform):
 *
 * - ArtifactRecord → artifacts table: run_id, job_run_id, producer_plan_node_id,
 *   artifact_type, artifact_class, uri, sha256, metadata_json.
 *
 * - ToolCallRecord → tool_calls table: job_run_id, adapter_id, capability,
 *   operation_key, idempotency_key, request_hash, status, response_artifact_id.
 *   (idempotency_key = hash(run_id:plan_node_id:adapter:capability:operation_key);
 *   request_hash = hash(sorted JSON of input_payload).)
 */
export {};
// Helpers that build JobRequest from runner context live in runners/src/executor-registry.ts
// so control-plane does not depend on runners.
//# sourceMappingURL=kernel-contract.js.map