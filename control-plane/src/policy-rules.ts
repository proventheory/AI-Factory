import type pg from "pg";

/**
 * Plan §5.11: Machine-enforced keys in policies.rules_json (self-build guardrails).
 * Enforced when reading policy and when validating runs/jobs.
 */
export interface PolicyRulesJson {
  max_changed_files?: number;
  max_diff_bytes?: number;
  allowed_paths_by_job_type?: Record<string, string[]>;
  deny_paths?: string[];
  requires_approval_if_paths_touched?: string[];
  self_update_max_depth?: number;
  control_plane_requires_human_approval?: boolean;
}

const DEFAULT_RULES: PolicyRulesJson = {
  max_changed_files: 50,
  max_diff_bytes: 500_000,
  allowed_paths_by_job_type: {},
  deny_paths: [],
  requires_approval_if_paths_touched: [],
  self_update_max_depth: 1,
  control_plane_requires_human_approval: true,
};

function ensureRulesShape(raw: unknown): PolicyRulesJson {
  if (raw == null || typeof raw !== "object") return DEFAULT_RULES;
  const o = raw as Record<string, unknown>;
  return {
    max_changed_files: typeof o.max_changed_files === "number" ? o.max_changed_files : DEFAULT_RULES.max_changed_files,
    max_diff_bytes: typeof o.max_diff_bytes === "number" ? o.max_diff_bytes : DEFAULT_RULES.max_diff_bytes,
    allowed_paths_by_job_type:
      o.allowed_paths_by_job_type && typeof o.allowed_paths_by_job_type === "object" && !Array.isArray(o.allowed_paths_by_job_type)
        ? (o.allowed_paths_by_job_type as Record<string, string[]>)
        : DEFAULT_RULES.allowed_paths_by_job_type ?? {},
    deny_paths: Array.isArray(o.deny_paths) ? (o.deny_paths as string[]) : DEFAULT_RULES.deny_paths ?? [],
    requires_approval_if_paths_touched: Array.isArray(o.requires_approval_if_paths_touched)
      ? (o.requires_approval_if_paths_touched as string[])
      : DEFAULT_RULES.requires_approval_if_paths_touched ?? [],
    self_update_max_depth: typeof o.self_update_max_depth === "number" ? o.self_update_max_depth : DEFAULT_RULES.self_update_max_depth,
    control_plane_requires_human_approval:
      typeof o.control_plane_requires_human_approval === "boolean" ? o.control_plane_requires_human_approval : DEFAULT_RULES.control_plane_requires_human_approval,
  };
}

/**
 * Load and validate policy rules for a version. Returns machine-enforced shape (with defaults for missing keys).
 */
export async function getPolicyRules(pool: pg.Pool, version: string = "latest"): Promise<PolicyRulesJson> {
  const r = await pool.query<{ rules_json: unknown }>(
    "SELECT rules_json FROM policies WHERE version = $1",
    [version],
  );
  if (r.rows.length === 0) return DEFAULT_RULES;
  return ensureRulesShape(r.rows[0].rules_json);
}

/**
 * Check whether a path is allowed for a job type (if allowed_paths_by_job_type is set for that type).
 * Returns true if no allowlist for the job type (allow all) or path is in the allowlist.
 */
export function isPathAllowedForJobType(rules: PolicyRulesJson, jobType: string, path: string): boolean {
  const allowlist = rules.allowed_paths_by_job_type?.[jobType];
  if (!allowlist || allowlist.length === 0) return true;
  const normalized = path.replace(/\\/g, "/");
  return allowlist.some((p) => normalized === p || normalized.startsWith(p + "/"));
}

/**
 * Check whether any of the touched paths require approval (requires_approval_if_paths_touched).
 */
export function requiresApprovalForPaths(rules: PolicyRulesJson, touchedPaths: string[]): boolean {
  const required = rules.requires_approval_if_paths_touched ?? [];
  if (required.length === 0) return false;
  const normalized = touchedPaths.map((p) => p.replace(/\\/g, "/"));
  return required.some((r) => normalized.some((p) => p === r || p.startsWith(r + "/"))));
}
