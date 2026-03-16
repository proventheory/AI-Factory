import { createHash } from "node:crypto";

/**
 * Error signature normalization (Plan §5C):
 * Normalize stack (strip line numbers, paths), parameterize message, canonical order, then hash.
 * Same root cause → same signature; enables clustering and repair_recipes keying.
 */

/** Replace line numbers in stack lines with :N */
function stripLineNumbers(line: string): string {
  return line.replace(/:\d+(:\d+)?(\s|$)/g, ":N$2");
}

/** Normalize file paths: strip absolute paths to last segment or placeholder */
function normalizePath(pathPart: string): string {
  const trimmed = pathPart.trim();
  const lastSlash = trimmed.lastIndexOf("/");
  const backslash = trimmed.lastIndexOf("\\");
  const lastSep = Math.max(lastSlash, backslash);
  if (lastSep >= 0) return trimmed.slice(lastSep + 1);
  return trimmed || "<anonymous>";
}

/** Parameterize message: replace numbers, hex ids, UUIDs with placeholders */
function parameterizeMessage(msg: string): string {
  return msg
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, "<uuid>")
    .replace(/\b0x[0-9a-fA-F]+\b/g, "<hex>")
    .replace(/\b[0-9]{10,}\b/g, "<num>")
    .replace(/\b[0-9]+\.[0-9]+\b/g, "<float>")
    .slice(0, 500);
}

/** Normalize a single stack frame line */
function normalizeStackLine(line: string): string {
  const withoutNumbers = stripLineNumbers(line);
  const atMatch = withoutNumbers.match(/^\s*at\s+(.+?)\s+\((.+)\)\s*$/);
  if (atMatch) {
    const fn = atMatch[1].trim();
    const pathPart = atMatch[2].trim();
    return `at ${fn} (${normalizePath(pathPart)})`;
  }
  const atMatch2 = withoutNumbers.match(/^\s*at\s+(.+)\s*$/);
  if (atMatch2) return `at ${normalizePath(atMatch2[1])}`;
  return withoutNumbers;
}

/**
 * Build canonical normalized string from error for hashing.
 */
function canonicalNormalizedString(err: unknown): string {
  const parts: string[] = [];
  const asError = err as Error & { code?: string; statusCode?: number };
  const name = asError?.name ?? "Error";
  const message = parameterizeMessage((asError?.message ?? String(err)).trim());
  parts.push(`type:${name}`);
  parts.push(`msg:${message}`);
  if (asError?.code) parts.push(`code:${asError.code}`);
  if (asError?.statusCode != null) parts.push(`status:${asError.statusCode}`);
  if (asError?.stack) {
    const lines = asError.stack.split("\n").slice(1).map(normalizeStackLine).filter(Boolean);
    parts.push("stack:" + lines.join("|"));
  }
  return parts.sort().join("\n");
}

const SIGNATURE_PREFIX_LEN = 16;

/**
 * Normalize error and return a stable signature (hash prefix) for clustering and repair_recipes.
 * Optionally return a display string (truncated message) for UI.
 */
export function normalizeErrorSignature(err: unknown): string {
  const canonical = canonicalNormalizedString(err);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return hash.slice(0, SIGNATURE_PREFIX_LEN);
}

/**
 * Human-readable prefix for UI (e.g. first 80 chars of parameterized message).
 */
export function errorSignatureDisplay(err: unknown): string {
  const asError = err as Error;
  const msg = parameterizeMessage((asError?.message ?? String(err)).trim());
  return msg.slice(0, 80);
}
