import type pg from "pg";
import type { Cohort, Environment } from "./types.js";
/**
 * Release Manager (Section 8.1, 12C.6):
 * Canary routing, drift detection, auto-rollback.
 */
export interface RouteDecision {
    releaseId: string;
    cohort: Cohort;
    routingReason: string;
    routingRuleId: string | null;
}
/**
 * Determine which release/cohort a new run should be assigned to.
 * Uses release_routes or percent_rollout on active releases.
 */
export declare function routeRun(pool: pg.Pool, environment: Environment): Promise<RouteDecision>;
export interface DriftMetrics {
    canarySuccessRate: number;
    controlSuccessRate: number;
    successRateDelta: number;
    canaryNewSignatures: string[];
    shouldRollback: boolean;
}
/**
 * Compute canary drift metrics over a sliding window (Section 8.1).
 */
export declare function computeDrift(pool: pg.Pool, environment: Environment, windowMinutes?: number, rollbackThreshold?: number): Promise<DriftMetrics>;
/**
 * Execute an automatic rollback: disable canary, mark release rolled_back.
 */
export declare function executeRollback(pool: pg.Pool, canaryReleaseId: string, environment: Environment): Promise<string>;
//# sourceMappingURL=release-manager.d.ts.map