import type pg from "pg";
/**
 * Lease Reaper (Section 12C.9 A6):
 * Scans for stale/expired job_claims and recovers stuck jobs.
 * Should be run periodically by the Control Plane (e.g. every 30s).
 */
export declare function reapStaleLeases(pool: pg.Pool, maxAttemptsPerNode?: number): Promise<number>;
//# sourceMappingURL=reaper.d.ts.map