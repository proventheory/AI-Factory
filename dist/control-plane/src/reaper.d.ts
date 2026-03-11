import type pg from "pg";
/**
 * Lease Reaper (Section 12C.9 A6):
 * Scans for stale/expired job_claims and recovers stuck jobs.
 * Should be run periodically by the Control Plane (e.g. every 30s).
 */
export declare function reapStaleLeases(pool: pg.Pool, maxAttemptsPerNode?: number): Promise<number>;
/**
 * Reconcile run status: runs that are still "running" but have all node_progress
 * succeeded (e.g. runner died or errored before calling checkRunCompletion) get
 * marked "succeeded" so the UI shows the correct state.
 */
export declare function reconcileRunStatuses(pool: pg.Pool): Promise<number>;
/**
 * Reconcile runs stuck in "running" when there are no pending job_runs (all are succeeded or failed).
 * E.g. after lease_expired the job_runs are failed but the run was never marked failed/succeeded.
 */
export declare function reconcileRunningRunsWithNoPendingJobs(pool: pg.Pool): Promise<{
    succeeded: number;
    failed: number;
}>;
/**
 * Reconcile runs that are "running" but have only queued job_runs that were never claimed.
 * After STALE_QUEUED_RUN_MS, mark the run and those job_runs as failed so the UI shows a result.
 */
export declare function reconcileRunningRunsWithStaleQueuedJobs(pool: pg.Pool): Promise<number>;
//# sourceMappingURL=reaper.d.ts.map