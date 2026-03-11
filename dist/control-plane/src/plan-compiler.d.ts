/**
 * Plan compiler: initiative → DAG (nodes + edges).
 * Templates: software (prd→design→code→test→review), issue_fix, migration, factory_ops, ci_gate, Crew.
 * See docs/TODO_MULTI_FRAMEWORK_PLAN.md and multi-framework plan.
 */
import type { DbClient } from "./db.js";
import type { Initiative } from "./types.js";
export type AgentRole = "product_manager" | "architect" | "engineer" | "qa" | "reviewer";
export interface PlanTemplateNode {
    node_key: string;
    job_type: string;
    agent_role: AgentRole;
    node_type: "job" | "gate" | "approval" | "validator";
    consumes_artifact_types?: string[];
}
export interface PlanTemplateEdge {
    from_key: string;
    to_key: string;
    condition?: string;
}
/** Return template nodes/edges for an intent type (for prompt-built pipelines). */
export declare function getTemplateByIntentType(intentType: string): {
    nodes: PlanTemplateNode[];
    edges: PlanTemplateEdge[];
} | null;
/** Load initiative; includes template_id when present for email_design_generator and other template-driven flows. */
export declare function loadInitiative(db: DbClient, initiativeId: string): Promise<Initiative | null>;
export declare function loadPRDArtifact(_db: DbClient, _initiativeId: string): Promise<string | null>;
export declare function computePlanHash(initiativeId: string, intentType: string, prdHashOrSeed: string): string;
export declare function decomposeToDAG(initiative: Initiative): {
    nodes: PlanTemplateNode[];
    edges: PlanTemplateEdge[];
};
export interface CompiledPlan {
    planId: string;
    nodeIds: Map<string, string>;
    planHash: string;
}
export declare function compilePlan(db: DbClient, initiativeId: string, options?: {
    seed?: string;
    force?: boolean;
}): Promise<CompiledPlan>;
/** PipelineDraft shape used by compilePlanFromDraft (avoids importing pipeline-draft in this file). */
export type DraftNodeLike = {
    node_key: string;
    job_type: string;
    node_type?: "job" | "gate" | "approval" | "validator";
    agent_role?: AgentRole;
    consumes_artifact_types?: string[];
};
export type DraftEdgeLike = {
    from_key: string;
    to_key: string;
    condition?: string;
};
/**
 * Compile a plan from a pipeline draft (prompt-built pipeline).
 * Caller should run lintPipelineDraft first.
 */
export declare function compilePlanFromDraft(db: DbClient, initiativeId: string, draft: {
    nodes: DraftNodeLike[];
    edges: DraftEdgeLike[];
    summary?: string;
}, options?: {
    force?: boolean;
}): Promise<CompiledPlan>;
//# sourceMappingURL=plan-compiler.d.ts.map