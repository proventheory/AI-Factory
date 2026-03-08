/**
 * Parse runner log messages and derive validation results (runner_log_check:*).
 * Used after log ingest to populate the Validations tab from log patterns.
 * See .cursor/plans/log_mirror_and_template_proofing_*.plan.md Phase 2.1.
 */

export type ValidationStatus = "pass" | "fail";

export interface LogValidation {
  validator_type: string;
  status: ValidationStatus;
}

/** Known failure patterns: message substring or regex → validator_type. */
const FAIL_PATTERNS: { pattern: RegExp | string; validator_type: string }[] = [
  { pattern: /hasLogo:\s*false|logoUrl:\s*['"]?(none|\(none\))['"]?/i, validator_type: "runner_log_check:logo_missing" },
  { pattern: /campaign copy snippet not found|campaign copy not found/i, validator_type: "runner_log_check:campaign_copy_missing" },
  { pattern: /pre-write check failed|prewrite check failed/i, validator_type: "runner_log_check:pre_write_failed" },
  { pattern: /template_placeholders:\s*\[\]/i, validator_type: "runner_log_check:placeholder_mismatch" },
];

/**
 * Parse a log message and return a validation result if it matches a known failure pattern.
 */
export function parseLogValidation(message: string): LogValidation | null {
  if (!message || typeof message !== "string") return null;
  for (const { pattern, validator_type } of FAIL_PATTERNS) {
    const matches = typeof pattern === "string" ? message.includes(pattern) : pattern.test(message);
    if (matches) return { validator_type, status: "fail" };
  }
  return null;
}

/**
 * Insert validation rows for a run (one per validator_type). Skips if a validation for that run_id + validator_type already exists.
 */
export async function insertLogValidations(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  runId: string,
  validations: LogValidation[]
): Promise<number> {
  const seen = new Set<string>();
  let inserted = 0;
  for (const v of validations) {
    if (v.status !== "fail" || seen.has(v.validator_type)) continue;
    seen.add(v.validator_type);
    try {
      const existing = await pool.query(
        "SELECT id FROM validations WHERE run_id = $1 AND validator_type = $2 LIMIT 1",
        [runId, v.validator_type]
      );
      if (existing.rows.length > 0) continue;
      await pool.query(
        "INSERT INTO validations (id, run_id, validator_type, status, created_at) VALUES (gen_random_uuid(), $1, $2, $3, now())",
        [runId, v.validator_type, v.status]
      );
      inserted += 1;
    } catch {
      // table missing or constraint
    }
  }
  return inserted;
}
