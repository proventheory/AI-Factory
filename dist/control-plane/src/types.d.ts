export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "rolled_back";
export type JobRunStatus = "queued" | "running" | "succeeded" | "failed";
export type ToolCallStatus = "pending" | "running" | "succeeded" | "failed";
export type Environment = "sandbox" | "staging" | "prod";
export type Cohort = "canary" | "control";
export type ReleaseStatus = "draft" | "canary" | "promoted" | "rolled_back";
export type RiskLevel = "low" | "med" | "high";
export type NodeType = "job" | "gate" | "approval" | "validator";
export type NodeProgressStatus = "pending" | "eligible" | "running" | "succeeded" | "failed";
export type ApprovalAction = "approved" | "rejected";
export type ValidationStatus = "pass" | "fail";
export type AgentRole = "product_manager" | "architect" | "engineer" | "qa" | "reviewer";
export interface Initiative {
    id: string;
    intent_type: string;
    title: string | null;
    risk_level: RiskLevel;
    created_by: string | null;
    created_at: Date;
    goal_state?: string | null;
    goal_metadata?: Record<string, unknown> | null;
    source_ref?: string | null;
    template_id?: string | null;
    priority?: number;
    metadata?: Record<string, unknown> | null;
}
export interface Plan {
    id: string;
    initiative_id: string;
    plan_hash: string;
    deterministic_seed: string | null;
    name: string | null;
    version: number;
    created_at: Date;
}
export interface PlanNode {
    id: string;
    plan_id: string;
    node_key: string;
    job_type: string;
    node_type: NodeType;
    agent_role: AgentRole | string | null;
    input_schema_ref: string | null;
    output_schema_ref: string | null;
    retry_policy_json: Record<string, unknown> | null;
    risk_level: RiskLevel | null;
    config: Record<string, unknown> | null;
    timeout_seconds: number | null;
    consumes_artifact_types: string[] | null;
    display_name: string | null;
    sequence: number | null;
    created_at: Date;
}
export interface PlanEdge {
    id: string;
    plan_id: string;
    from_node_id: string;
    to_node_id: string;
    condition: string;
}
export interface Release {
    id: string;
    control_plane_version: string | null;
    workplane_bundle_version: string | null;
    runner_image_digest: string | null;
    policy_version: string | null;
    status: ReleaseStatus;
    percent_rollout: number | null;
    created_at: Date;
}
export interface Run {
    id: string;
    plan_id: string;
    release_id: string;
    initiative_id: string | null;
    policy_version: string | null;
    environment: Environment;
    cohort: Cohort | null;
    status: RunStatus;
    started_at: Date | null;
    ended_at: Date | null;
    root_idempotency_key: string;
    routed_at: Date | null;
    routing_reason: string | null;
    routing_rule_id: string | null;
    prompt_template_version: string | null;
    adapter_contract_version: string | null;
    scheduler_lock_token: string | null;
    scheduler_lock_expires_at: Date | null;
    workspace_path: string | null;
    human_feedback: string | null;
    metadata: Record<string, unknown> | null;
    trigger_source: string | null;
    cancelled_at: Date | null;
    cancelled_reason: string | null;
    parent_run_id: string | null;
}
export interface JobRun {
    id: string;
    run_id: string;
    plan_node_id: string;
    attempt: number;
    status: JobRunStatus;
    started_at: Date | null;
    ended_at: Date | null;
    error_signature: string | null;
    idempotency_key: string;
}
export interface NodeProgress {
    id: string;
    run_id: string;
    plan_node_id: string;
    deps_total: number;
    deps_satisfied: number;
    eligible_at: Date | null;
    status: NodeProgressStatus;
}
export interface ToolCall {
    id: string;
    job_run_id: string;
    adapter_id: string;
    capability: string;
    operation_key: string;
    idempotency_key: string;
    request_hash: string | null;
    status: ToolCallStatus;
    started_at: Date | null;
    ended_at: Date | null;
}
export interface JobClaim {
    id: string;
    job_run_id: string;
    worker_id: string;
    claim_token: string;
    claimed_at: Date;
    lease_expires_at: Date;
    heartbeat_at: Date;
    released_at: Date | null;
}
export interface Artifact {
    id: string;
    run_id: string;
    job_run_id: string | null;
    producer_plan_node_id: string | null;
    artifact_type: string;
    uri: string;
    created_at: Date;
}
export interface ApprovalRequest {
    id: string;
    run_id: string;
    plan_node_id: string;
    requested_at: Date;
    requested_reason: string | null;
    context_ref: string | null;
}
//# sourceMappingURL=types.d.ts.map