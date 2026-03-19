import type pg from "pg";
/**
 * Repair Engine (Section 13.3 Loop A, 13.4.5-6, 12C.11 A10):
 * Failure signatures → repair_recipes → hypothesis generation → escalation.
 *
 * Implements:
 * - Repair recipe lookup (known fixes first)
 * - Bounded hypothesis generation for novel failures
 * - Model tier escalation
 * - Halt + incident generation when budget exhausted
 */
export interface RepairRecipe {
    id: string;
    error_signature: string;
    patch_pattern: string;
    validation_required: string;
    success_count: number;
    failure_count: number;
}
/**
 * Look up known repair recipes for an error signature.
 * Supports both schemas: (1) 20250403 applies_to_class/strategy_type, (2) core error_signature/patch_pattern.
 * Returns legacy RepairRecipe shape for executeRepairLoop.
 */
export declare function findRepairRecipes(pool: pg.Pool, errorSignature: string, jobType?: string, adapterId?: string): Promise<RepairRecipe[]>;
/**
 * Record the outcome of applying a repair recipe.
 * No-op for 20250403 schema (no success_count/failure_count). For core schema, updates counts.
 */
export declare function recordRepairOutcome(pool: pg.Pool, recipeId: string, succeeded: boolean): Promise<void>;
/**
 * Promote a new repair into the recipe library.
 * For core schema: INSERT. For 20250403 schema: no-op (use evolution or seed to add recipes).
 */
export declare function promoteRepairRecipe(pool: pg.Pool, errorSignature: string, patchPattern: string, validationRequired: string, createdFromJobRunId: string, jobType?: string, adapterId?: string): Promise<string>;
/**
 * Execute the repair loop for a failed job_run.
 * Implements: known recipes first → hypotheses → model escalation → halt.
 */
export declare function executeRepairLoop(pool: pg.Pool, jobRunId: string, runId: string, planNodeId: string, errorSignature: string, maxAttempts?: number, modelTiers?: string[]): Promise<{
    repaired: boolean;
    halted: boolean;
}>;
//# sourceMappingURL=repair-engine.d.ts.map