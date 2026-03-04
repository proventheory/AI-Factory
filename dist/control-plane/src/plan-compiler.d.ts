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
//# sourceMappingURL=plan-compiler.d.ts.map