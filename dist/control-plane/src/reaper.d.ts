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
//# sourceMappingURL=reaper.d.ts.map