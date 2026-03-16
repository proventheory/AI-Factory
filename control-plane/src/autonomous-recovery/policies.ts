/**
 * Policy engine: retry suppression and deterministic-failure classification.
 */

import type { FailurePhase } from "./types.js";
import type { SignatureMatch } from "./types.js";

/**
 * Whether to suppress further redeploys for this service/env (avoid infinite retry loop).
 */
export function shouldSuppressRetries(args: {
  failureStreak: number;
  signature: SignatureMatch | null;
  phase: FailurePhase;
  sameSignatureAsLast: boolean;
}): boolean {
  const { failureStreak, signature, phase, sameSignatureAsLast } = args;

  if (!signature) return false;
  if (phase === "migrate" && failureStreak >= 2) return true;
  if (phase === "boot" && sameSignatureAsLast && failureStreak >= 3) return true;
  if (signature.signatureKey.startsWith("boot_failed.migration") && failureStreak >= 2) {
    return true;
  }

  return false;
}

/**
 * Whether this signature indicates a deterministic (non-transient) failure.
 */
export function isDeterministicFailure(signature: SignatureMatch | null): boolean {
  if (!signature) return false;
  return (
    signature.signatureKey === "boot_failed.migration.duplicate_policy" ||
    signature.signatureKey === "boot_failed.migration.missing_relation" ||
    signature.signatureKey === "boot_failed.env.missing_secret"
  );
}
