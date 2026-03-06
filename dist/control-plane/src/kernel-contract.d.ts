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
/** Input payload for a job: repo refs, issue text, predecessor artifact refs, options. */
export interface JobInput {
    /** Refs to artifacts produced by predecessor nodes (run-scoped memory). */
    predecessor_artifact_refs: string[];
    /** Repo refs (e.g. branch, commit, repo URL). */
    repo_refs?: Record<string, string>;
    /** Issue or task text (e.g. GitHub issue body). */
    issue_text?: string | null;
    /** Free-form options for this job type. */
    options?: Record<string, unknown>;
    /** Human feedback from operator (between-run input). */
    human_feedback?: string | null;
}
/** Canonical job envelope passed from kernel to executor. */
export interface JobRequest {
    job_type: string;
    run_id: string;
    plan_node_id: string;
    initiative_id: string | null;
    node_key: string;
    /** Agent role for this node (e.g. engineer, reviewer). */
    agent_role: string | null;
    /** Workspace path when applicable. */
    workspace_path: string | null;
    input: JobInput;
    /** LLM source for this run: 'gateway' = LLM_GATEWAY_URL, 'openai_direct' = OPENAI_API_KEY. */
    llm_source?: "gateway" | "openai_direct";
}
/** Structured result: patch refs, verdict, notes, metrics. */
export interface JobOutput {
    /** Verdict for review-style jobs (e.g. approved, changes_requested). */
    verdict?: string;
    /** Human-readable summary or notes. */
    summary?: string;
    /** Metrics (e.g. confidence, duration). */
    metrics?: Record<string, number | string | boolean>;
    /** Refs to patches or other output artifacts (by artifact_id or URI). */
    patch_refs?: string[];
    /** Free-form structured result. */
    data?: Record<string, unknown>;
}
/**
 * Canonical result returned by an executor. Kernel persists job record and lineage.
 * Every artifact must include producer_plan_node_id (supplied by kernel when persisting).
 */
export interface JobResult {
    success: boolean;
    /** Structured output (verdict, summary, metrics, patch refs). */
    output?: JobOutput;
    /** Artifacts produced; kernel will persist with producer_plan_node_id. */
    artifacts: ArtifactRecord[];
    /** Tool calls made; kernel will persist for audit/reproducibility. */
    tool_calls?: ToolCallRecord[];
    /** When success is false, error message or signature. */
    error?: string;
}
/** Executor interface: black box that receives JobRequest and returns JobResult. */
export interface Executor {
    run(request: JobRequest): Promise<JobResult>;
}
/**
 * Canonical shape for recording a tool call. Kernel requires this so runs
 * are reproducible and auditable. Executors may implement tools directly
 * or proxy via MCP; same contract either way.
 */
export interface ToolCallRecord {
    /** Capability name (e.g. code_execute, file_read). */
    capability: string;
    /** Operation key (e.g. read_file, run_command). */
    operation_key: string;
    /** Input payload (will be hashed for idempotency when persisting). */
    input_payload: Record<string, unknown>;
    /** Optional: artifact id of the response (when already persisted). */
    result_artifact_id?: string | null;
    /** Optional: adapter id when tool was invoked via a registered adapter. */
    adapter_id?: string | null;
}
/**
 * Canonical shape for an artifact produced by an executor. Kernel persists
 * with producer_plan_node_id for traceability (plan_edges + producer_plan_node_id).
 */
export interface ArtifactRecord {
    artifact_type: string;
    /** URI or ref (e.g. mem://..., s3://..., or artifact id). */
    uri: string;
    /** Optional artifact_class (e.g. docs, external_object_refs). */
    artifact_class?: string;
    /** Optional content hash. */
    sha256?: string | null;
    /** Optional metadata (stored as metadata_json). */
    metadata?: Record<string, unknown> | null;
}
//# sourceMappingURL=kernel-contract.d.ts.map