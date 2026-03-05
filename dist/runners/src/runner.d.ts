import type pg from "pg";
import type { JobRun, JobClaim } from "@control-plane/types.js";
export interface RunnerConfig {
    workerId: string;
    runnerVersion: string;
    environment: string;
    maxConcurrency: number;
}
export interface ClaimedJob {
    jobRun: JobRun;
    claim: JobClaim;
}
/**
 * Register this worker in the registry.
 */
export declare function registerWorker(pool: pg.Pool, config: RunnerConfig): Promise<void>;
/**
 * Claim a single eligible job (Section 12C.9 A3-A4).
 * Atomic: SELECT FOR UPDATE SKIP LOCKED + INSERT job_claims + UPDATE job_runs.
 */
export declare function claimJob(client: pg.PoolClient, workerId: string): Promise<ClaimedJob | null>;
/**
 * Heartbeat: update heartbeat_at for the active lease.
 */
export declare function heartbeat(pool: pg.Pool, jobRunId: string, workerId: string): Promise<boolean>;
/**
 * Release the lease after job completion.
 */
export declare function releaseLease(pool: pg.Pool, jobRunId: string, workerId: string): Promise<void>;
/**
 * Complete a job run as succeeded.
 * Uses node_outcomes for single-winner election (Section 5.7c).
 */
export declare function completeJobSuccess(client: pg.PoolClient, jobRunId: string, runId: string, planNodeId: string, workerId: string): Promise<boolean>;
/**
 * Complete a job run as failed.
 */
export declare function completeJobFailure(client: pg.PoolClient, jobRunId: string, runId: string, planNodeId: string, workerId: string, errorSignature: string): Promise<void>;
/**
 * Start the heartbeat loop for a claimed job.
 * Returns a function to stop the loop.
 */
export declare function startHeartbeatLoop(pool: pg.Pool, jobRunId: string, workerId: string): () => void;
//# sourceMappingURL=runner.d.ts.map