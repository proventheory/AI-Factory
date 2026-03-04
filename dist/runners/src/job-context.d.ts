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
}
/**
 * Build full job context for a claimed job run.
 */
export declare function getJobContext(client: pg.PoolClient, jobRun: {
    id: string;
    run_id: string;
    plan_node_id: string;
}): Promise<JobContext | null>;
//# sourceMappingURL=job-context.d.ts.map