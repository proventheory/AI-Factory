import type pg from "pg";
import type { Adapter } from "../../adapters/src/adapter-interface.js";
/**
 * Tool-call framework (Sections 5.8, 5A, 6, 12C.10).
 *
 * Enforces:
 * - Stable idempotency keys (no attempt in key)
 * - request_hash safety (same key must match hash or reject)
 * - Dedupe on (adapter_id, idempotency_key) unique constraint
 * - Capability/policy gating before execution
 */
export interface ToolCallParams {
    jobRunId: string;
    runId: string;
    planNodeId: string;
    adapterId: string;
    adapterName: string;
    capability: string;
    operationKey: string;
    request: Record<string, unknown>;
}
export declare function computeIdempotencyKey(runId: string, planNodeId: string, adapterName: string, capability: string, operationKey: string): string;
export declare function computeRequestHash(request: Record<string, unknown>): string;
/**
 * Execute a tool call with full idempotency + dedupe.
 * Returns the tool_call id.
 * When passing pool, a unique violation (23505) on insert is resolved by checking
 * the existing row on a separate connection so the caller's transaction is not left aborted.
 */
export declare function executeToolCall(client: pg.PoolClient, params: ToolCallParams, adapter: Adapter, environment: string, releaseId: string, pool?: pg.Pool): Promise<string>;
//# sourceMappingURL=tool-calls.d.ts.map