import type pg from "pg";
/**
 * Golden Initiative Suite (Section 13, 13.4.7):
 * Permanent validation workflows that every upgrade must pass.
 *
 * The golden suite is the fitness function for the factory.
 * Each golden test simulates a critical operation and validates it end-to-end.
 */
export interface GoldenTest {
    name: string;
    description: string;
    validatorType: string;
    execute: (runId: string, client: pg.PoolClient) => Promise<GoldenTestResult>;
}
export interface GoldenTestResult {
    passed: boolean;
    details: string;
    artifactUri?: string;
}
export declare const GOLDEN_TESTS: GoldenTest[];
/**
 * Run the full golden suite against a release candidate.
 * Returns true only if ALL tests pass.
 */
export declare function runGoldenSuite(pool: pg.Pool, runId: string): Promise<{
    allPassed: boolean;
    results: Array<{
        name: string;
        passed: boolean;
        details: string;
    }>;
}>;
//# sourceMappingURL=golden-suite.d.ts.map