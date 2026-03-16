/**
 * Artifact content loading for LLM and prompt use.
 * Invariant: any path that may serialize artifact body into model context must use loadArtifactContentForLlm
 * (or loadPredecessorContentsForLlm for multiple artifacts). See docs/ARTIFACT_HYGIENE.md.
 * Fallback: if metadata_json.content is string → use it; else if metadata_json.summary is string → use it;
 * else → JSON.stringify(metadata_json) with stable key ordering, then apply byte/char limits.
 */

import type pg from "pg";

/** Max characters of artifact content to allow into LLM context. Default 15000. */
export const MAX_ARTIFACT_CHARS_FOR_LLM = Number(process.env.MAX_ARTIFACT_CHARS_FOR_LLM) || 15_000;

/** Max serialized bytes before truncation (so huge JSON cannot blow context). Default 50000. */
export const MAX_ARTIFACT_BYTES_SERIALIZED = Number(process.env.MAX_ARTIFACT_BYTES_SERIALIZED) || 50_000;

const TRUNCATED_MARKER = "\n[truncated...]";

/** Stable key ordering for JSON.stringify so output is deterministic. */
function stringifyStable(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map((v) => stringifyStable(v)).join(",") + "]";
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + stringifyStable((obj as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

/**
 * Load artifact content safe for LLM context: capped by bytes then chars, with deterministic fallback for non-text.
 * Use on every path that may serialize artifact body into model context (prompt builders, evaluators, validators, comparison, repair).
 */
export async function loadArtifactContentForLlm(
  client: pg.PoolClient,
  artifactId: string,
  maxChars: number = MAX_ARTIFACT_CHARS_FOR_LLM,
  maxBytes: number = MAX_ARTIFACT_BYTES_SERIALIZED
): Promise<string> {
  const r = await client.query<{ metadata_json: Record<string, unknown> | null }>(
    "SELECT metadata_json FROM artifacts WHERE id = $1",
    [artifactId]
  );
  const metadata = r.rows[0]?.metadata_json ?? null;
  if (metadata == null) return "";

  let content: string;
  const contentVal = metadata.content;
  const summaryVal = metadata.summary;
  if (typeof contentVal === "string") {
    content = contentVal;
  } else if (typeof summaryVal === "string") {
    content = summaryVal;
  } else {
    content = stringifyStable(metadata);
  }

  const encoder = new TextEncoder();
  let bytes = encoder.encode(content).length;
  if (bytes > maxBytes) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const truncated = decoder.decode(encoder.encode(content).slice(0, maxBytes));
    content = truncated + TRUNCATED_MARKER;
    bytes = maxBytes + encoder.encode(TRUNCATED_MARKER).length;
  }

  if (content.length > maxChars) {
    content = content.slice(0, maxChars) + TRUNCATED_MARKER;
  }
  return content;
}

/** Default max total characters when concatenating multiple predecessor artifacts into one prompt section. */
export const MAX_PREDECESSOR_CHARS_TOTAL = Number(process.env.MAX_PREDECESSOR_CHARS_TOTAL) || 40_000;

/**
 * Load content from multiple artifacts for LLM prompt use (e.g. predecessor artifacts).
 * Each artifact is loaded via loadArtifactContentForLlm and labeled by artifact_type.
 * Total output is capped at maxTotalChars to avoid blowing context.
 */
export async function loadPredecessorContentsForLlm(
  client: pg.PoolClient,
  artifacts: { id: string; artifact_type: string }[],
  options?: { maxCharsPerArtifact?: number; maxTotalChars?: number }
): Promise<string> {
  if (artifacts.length === 0) return "";
  const maxPer = options?.maxCharsPerArtifact ?? MAX_ARTIFACT_CHARS_FOR_LLM;
  const maxTotal = options?.maxTotalChars ?? MAX_PREDECESSOR_CHARS_TOTAL;
  const parts: string[] = [];
  let total = 0;
  for (const a of artifacts) {
    if (total >= maxTotal) break;
    const content = await loadArtifactContentForLlm(client, a.id, maxPer, MAX_ARTIFACT_BYTES_SERIALIZED);
    if (content.length === 0) continue;
    const label = `--- Artifact (${a.artifact_type}) ---`;
    const block = `${label}\n${content}`;
    const take = total + block.length <= maxTotal ? block : block.slice(0, maxTotal - total) + TRUNCATED_MARKER;
    parts.push(take);
    total += take.length;
  }
  return parts.join("\n\n");
}
