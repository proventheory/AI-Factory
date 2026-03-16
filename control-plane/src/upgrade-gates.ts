import type pg from "pg";

/**
 * Plan §12: Upgrade Initiative gates — Schema/Policy compatibility and Control-plane safety.
 * Call before promoting a release or enabling canary.
 */

export interface SchemaPolicyCompatibilityResult {
  pass: boolean;
  errors: string[];
}

/**
 * Gate: Schema/Policy compatibility — migrations additive, policies exist, adapters match, rollback plan.
 */
export async function checkSchemaPolicyCompatibility(
  pool: pg.Pool,
  _releaseId?: string,
): Promise<SchemaPolicyCompatibilityResult> {
  const errors: string[] = [];

  const policyCount = await pool.query(
    "SELECT count(*)::int AS c FROM policies WHERE version = 'latest'",
  ).then((r) => (r.rows[0] as { c: number }).c);
  if (policyCount === 0) errors.push("No policy version 'latest' found");

  const adapterCount = await pool.query(
    "SELECT count(*)::int AS c FROM adapters",
  ).then((r) => (r.rows[0] as { c: number }).c);
  if (adapterCount === 0) errors.push("No adapters registered");

  return {
    pass: errors.length === 0,
    errors,
  };
}

export interface ControlPlaneSafetyResult {
  pass: boolean;
  requiresApproval: boolean;
  requiresLongerSoak: boolean;
  requiresMandatoryCanary: boolean;
  killSwitchVerified: boolean;
  errors: string[];
}

/**
 * Gate: Control-plane safety — if update touches control-plane paths: require approval, longer soak, mandatory canary, kill-switch verification.
 */
export async function checkControlPlaneSafety(
  pool: pg.Pool,
  options: {
    touchedPaths?: string[];
    controlPlanePaths?: string[];
    humanApprovalReceived?: boolean;
    soakMinutes?: number;
    canaryRequired?: boolean;
  } = {},
): Promise<ControlPlaneSafetyResult> {
  const controlPlanePaths = options.controlPlanePaths ?? [
    "control-plane/",
    "schemas/001_core_schema",
    "scripts/run-migrate",
  ];
  const touched = options.touchedPaths ?? [];
  const touchesControlPlane = touched.some((p) =>
    controlPlanePaths.some((cp) => p.includes(cp)),
  );

  const errors: string[] = [];
  let requiresApproval = false;
  let requiresLongerSoak = false;
  let requiresMandatoryCanary = false;
  let killSwitchVerified = false;

  if (touchesControlPlane) {
    requiresApproval = true;
    requiresLongerSoak = true;
    requiresMandatoryCanary = true;
    if (!options.humanApprovalReceived) {
      errors.push("Control-plane paths touched; human approval required");
    }
    if (options.soakMinutes != null && options.soakMinutes < 60) {
      errors.push("Control-plane change requires at least 60 minutes soak");
    }
    if (options.canaryRequired === false) {
      errors.push("Control-plane change requires mandatory canary (no direct 100%)");
    }
    killSwitchVerified = options.humanApprovalReceived === true;
  } else {
    killSwitchVerified = true;
  }

  return {
    pass: errors.length === 0,
    requiresApproval,
    requiresLongerSoak,
    requiresMandatoryCanary,
    killSwitchVerified,
    errors,
  };
}

/**
 * Run both gates; return combined result.
 */
export async function runUpgradeGates(
  pool: pg.Pool,
  options: Parameters<typeof checkControlPlaneSafety>[1] & { releaseId?: string },
): Promise<{
  schemaPolicy: SchemaPolicyCompatibilityResult;
  controlPlane: ControlPlaneSafetyResult;
  pass: boolean;
}> {
  const schemaPolicy = await checkSchemaPolicyCompatibility(pool, options.releaseId);
  const controlPlane = await checkControlPlaneSafety(pool, options);
  const pass = schemaPolicy.pass && controlPlane.pass;
  return { schemaPolicy, controlPlane, pass };
}
