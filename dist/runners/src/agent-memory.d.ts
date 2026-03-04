/**
 * Agent memory read/write lifecycle for runners.
 * Reads memory at job start (by initiative/scope), writes after completion.
 * See docs/FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md and STACK_AND_DECISIONS.md.
 */
import type pg from "pg";
export interface AgentMemoryEntry {
    id: string;
    initiative_id: string | null;
    run_id: string | null;
    scope: string;
    key: string;
    value: string;
}
export declare function readAgentMemory(client: pg.PoolClient, initiativeId: string | null, scope: string): Promise<AgentMemoryEntry[]>;
export declare function writeAgentMemory(client: pg.PoolClient, params: {
    initiativeId: string | null;
    runId: string | null;
    scope: string;
    key: string;
    value: string;
}): Promise<string | null>;
export declare function readMemoryForContext(client: pg.PoolClient, initiativeId: string | null, jobType: string): Promise<Record<string, string>>;
export declare function writeMemoryFromResult(client: pg.PoolClient, initiativeId: string | null, runId: string, jobType: string, key: string, value: string): Promise<void>;
//# sourceMappingURL=agent-memory.d.ts.map