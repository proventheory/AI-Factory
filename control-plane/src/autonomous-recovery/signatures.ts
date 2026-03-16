/**
 * Rule-based failure signature matcher: raw log text → SignatureMatch (or null).
 * Used by classifier before optional LLM fallback.
 */

import type { FailurePhase } from "./types.js";
import type { SignatureMatch } from "./types.js";

function containsAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

/**
 * Match failure signature from combined evidence text. Returns null if no rule matches.
 * signatureId is empty; classifier fills it from failure_signatures when persisting.
 */
export function matchFailureSignature(rawText: string): SignatureMatch | null {
  if (
    containsAny(rawText, ["policy", "already exists"]) ||
    containsAny(rawText, ["42710", "duplicate_object"])
  ) {
    return {
      signatureId: "",
      signatureKey: "boot_failed.migration.duplicate_policy",
      confidence: 0.95,
      matchedBy: "rule",
      rationale: "Matched duplicate policy markers in startup/migration logs.",
      phase: "boot",
      className: "migration",
      subclass: "duplicate_policy",
    };
  }

  if (
    containsAny(rawText, ["relation", "does not exist"]) ||
    containsAny(rawText, ["42P01"])
  ) {
    return {
      signatureId: "",
      signatureKey: "boot_failed.migration.missing_relation",
      confidence: 0.94,
      matchedBy: "rule",
      rationale: "Matched missing relation markers in startup/migration logs.",
      phase: "boot",
      className: "migration",
      subclass: "missing_relation",
    };
  }

  if (containsAny(rawText, ["missing env", "missing secret", "environment variable"])) {
    return {
      signatureId: "",
      signatureKey: "boot_failed.env.missing_secret",
      confidence: 0.9,
      matchedBy: "rule",
      rationale: "Matched missing environment/secret markers.",
      phase: "boot",
      className: "env",
      subclass: "missing_secret",
    };
  }

  if (containsAny(rawText, ["health check", "timed out", "timeout"])) {
    return {
      signatureId: "",
      signatureKey: "runtime_failed.healthcheck_timeout",
      confidence: 0.78,
      matchedBy: "rule",
      rationale: "Matched healthcheck timeout markers.",
      phase: "runtime",
      className: "healthcheck",
      subclass: "timeout",
    };
  }

  return null;
}
