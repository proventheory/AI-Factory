/**
 * Build job context for a claimed job: plan_node (agent_role), predecessor artifacts, run metadata.
 * See docs/TODO_MULTI_FRAMEWORK_PLAN.md — Runner: job context includes agent_role and artifacts.
 */
import type pg from "pg";
export interface PredecessorArtifact {
    id: string;
    run_id: string;
    producer_plan_node_id: string;
    artifact_type: string;
    uri: string;
}
export interface JobContext {
    run_id: string;
    initiative_id: string | null;
    plan_node_id: string;
    node_key: string;
    job_type: string;
    agent_role: string | null;
    workspace_path: string | null;
    human_feedback: string | null;
    predecessor_artifact_ids: string[];
    predecessor_artifacts: PredecessorArtifact[];
    /** 'gateway' = use LLM_GATEWAY_URL; 'openai_direct' = use OPENAI_API_KEY. Default 'gateway'. */
    llm_source: "gateway" | "openai_direct";
    /** Optional phase/config for quality gate and other handlers. */
    config?: {
        phase?: string;
    };
    /** Initiative goal_metadata (e.g. for seo_migration_audit: source_url, target_url, crawl options). */
    goal_metadata?: Record<string, unknown> | null;
    /** Release runner_image_digest for this run (if set); runner must match or job fails. */
    runner_image_digest?: string | null;
    /** Run's environment for secret_access_events. */
    environment?: string | null;
}
/**
 * Build full job context for a claimed job run.
 */
export declare function getJobContext(client: pg.PoolClient, jobRun: {
    id: string;
    run_id: string;
    plan_node_id: string;
}): Promise<JobContext | null>;
/**
 * Record artifact consumption for graph lineage (V1 self-heal).
 * Call after a job run succeeds; inserts into artifact_consumption for each artifact used as input.
 * Table may not exist in older DBs — safe to no-op on error.
 */
export declare function recordArtifactConsumption(client: pg.PoolClient, runId: string, jobRunId: string, planNodeId: string, artifactIds: string[], role?: string): Promise<void>;
//# sourceMappingURL=job-context.d.ts.map