/**
 * LLM tool for autonomous recovery: classify ambiguous failure logs.
 * Optional fallback when rule-based signatures don't match.
 */

import type { SignatureMatch } from "../types.js";

/**
 * Classify failure from combined evidence text using LLM. Returns null if not configured or no match.
 */
export async function classifyFailureWithLlm(
  _combinedText: string
): Promise<SignatureMatch | null> {
  return null;
}
