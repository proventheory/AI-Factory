import type pg from "pg";

/**
 * Plan §13.3 Loop B, 13.4.10: On canary regression, tighten policies or capability_grants.
 * Call after executeRollback to reduce blast radius on future runs.
 */

export interface TightenOptions {
  /** Reduce percent_rollout for other canary releases in this environment (already 0 for rolled-back release). */
  reduceOtherCanaryPercent?: boolean;
  /** Tighten default policy: e.g. lower max_diff_bytes, add to deny_paths. */
  tightenRulesJson?: boolean;
  /** Set requires_approval on capability_grants for this environment. */
  requireApprovalForCapabilities?: boolean;
}

/**
 * After rollback, optionally tighten policies.rules_json (e.g. lower max_diff_bytes, add deny_paths)
 * and/or set capability_grants.requires_approval = true for the environment.
 */
export async function tightenPoliciesOnDrift(
  pool: pg.Pool,
  environment: string,
  _options: TightenOptions = {},
): Promise<{ rulesUpdated: boolean; capabilityGrantsUpdated: number }> {
  let rulesUpdated = false;
  let capabilityGrantsUpdated = 0;

  const opts = {
    tightenRulesJson: true,
    requireApprovalForCapabilities: true,
    ..._options,
  };

  if (opts.tightenRulesJson) {
    const r = await pool.query<{ rules_json: unknown }>(
      "SELECT rules_json FROM policies WHERE version = 'latest'",
    );
    if (r.rows.length > 0) {
      const current = (r.rows[0].rules_json ?? {}) as Record<string, unknown>;
      const maxDiffBytes = typeof current.max_diff_bytes === "number" ? current.max_diff_bytes : 500_000;
      const newMaxDiff = Math.max(50_000, Math.floor(maxDiffBytes * 0.8));
      const updated = {
        ...current,
        max_changed_files: Math.min(typeof current.max_changed_files === "number" ? current.max_changed_files : 50, 30),
        max_diff_bytes: newMaxDiff,
      };
      await pool.query(
        `UPDATE policies SET rules_json = $2 WHERE version = 'latest'`,
        [JSON.stringify(updated)],
      ).catch(() => {});
      rulesUpdated = true;
    }
  }

  if (opts.requireApprovalForCapabilities) {
    const r = await pool.query(
      `UPDATE capability_grants SET requires_approval = true
       WHERE environment = $1 AND (requires_approval IS NULL OR requires_approval = false)
       RETURNING id`,
      [environment],
    ).catch(() => ({ rowCount: 0 }));
    capabilityGrantsUpdated = r?.rowCount ?? 0;
  }

  return { rulesUpdated, capabilityGrantsUpdated };
}
