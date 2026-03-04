import type pg from "pg";
import type { Environment } from "./types.js";
/**
 * Factory Scorecard (Section 13.3, 13.4.3):
 * Computed per release + cohort. Evaluates along five axes:
 * reliability, determinism, safety, velocity, quality.
 */
export interface Scorecard {
    releaseId: string;
    environment: Environment;
    cohort: string | null;
    reliability: ReliabilityMetrics;
    determinism: DeterminismMetrics;
    safety: SafetyMetrics;
    velocity: VelocityMetrics;
    quality: QualityMetrics;
    computedAt: Date;
}
export interface ReliabilityMetrics {
    runSuccessRate: number;
    jobSuccessRate: number;
    leaseExpiryRate: number;
    retryRate: number;
}
export interface DeterminismMetrics {
    reproducibilityRate: number;
    idempotencyConflictRate: number;
}
export interface SafetyMetrics {
    policyViolationCount: number;
    unauthorizedCapabilityAttempts: number;
}
export interface VelocityMetrics {
    medianRunDurationMs: number;
    p95RunDurationMs: number;
    timeToGreenAfterFailureMs: number;
}
export interface QualityMetrics {
    goldenSuitePassRate: number;
    validationFailureRate: number;
}
/**
 * Generate a Factory Scorecard for a given release + environment.
 */
export declare function generateScorecard(pool: pg.Pool, releaseId: string, environment: Environment, windowMinutes?: number): Promise<Scorecard>;
//# sourceMappingURL=scorecard.d.ts.map