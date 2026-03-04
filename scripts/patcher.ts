/**
 * Patcher: apply SEARCH/REPLACE and ADD_FILE blocks from LLM output.
 * No git apply — uses exact string matching with fuzzy fallback.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface PatchBlock {
  type: "search_replace" | "add_file" | "cannot_fix";
  file: string;
  search?: string;
  replace?: string;
  content?: string;
  reason?: string;
}

export interface PatchResult {
  block: PatchBlock;
  applied: boolean;
  matchType: "exact" | "fuzzy" | "created" | "cannot_fix" | "blocked" | "failed";
  detail?: string;
}

const BLOCKED_PATTERNS = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.env($|\.)/,
  /node_modules\//,
  /supabase\/migrations\//,
  /\.lock$/,
];

function isBlocked(filePath: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(filePath));
}

export function parseLlmOutput(output: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];

  // Parse SEARCH/REPLACE blocks
  const srRegex = /<<<<<<< SEARCH\n([\s\S]*?)======= REPLACE\n([\s\S]*?)>>>>>>> FILE:\s*(.+)/g;
  let m;
  while ((m = srRegex.exec(output)) !== null) {
    blocks.push({
      type: "search_replace",
      search: m[1].replace(/\n$/, ""),
      replace: m[2].replace(/\n$/, ""),
      file: m[3].trim(),
    });
  }

  // Parse ADD_FILE blocks
  const addRegex = /<<<<<<< ADD_FILE:\s*(.+)\n([\s\S]*?)>>>>>>> END/g;
  while ((m = addRegex.exec(output)) !== null) {
    blocks.push({
      type: "add_file",
      file: m[1].trim(),
      content: m[2],
    });
  }

  // Parse CANNOT_FIX blocks
  const cfRegex = /<<<<<<< CANNOT_FIX:\s*(.+?)(?:\n[\s\S]*?)?>>>>>>> END/g;
  while ((m = cfRegex.exec(output)) !== null) {
    blocks.push({
      type: "cannot_fix",
      file: "",
      reason: m[1].trim(),
    });
  }

  return blocks;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}

function fuzzyMatch(haystack: string, needle: string): { start: number; end: number } | null {
  // Strip trailing whitespace from each line and try
  const normHaystack = normalizeWhitespace(haystack);
  const normNeedle = normalizeWhitespace(needle);

  const idx = normHaystack.indexOf(normNeedle);
  if (idx >= 0) {
    // Map back to original string position
    const origIdx = haystack.indexOf(needle.split("\n")[0].trimEnd());
    if (origIdx >= 0) {
      // Find the end by counting same number of lines
      const needleLines = needle.split("\n").length;
      const haystackLines = haystack.split("\n");
      const startLine = haystack.slice(0, origIdx).split("\n").length - 1;
      const endOffset = haystackLines.slice(0, startLine + needleLines).join("\n").length;
      return { start: origIdx, end: endOffset };
    }
  }

  // Try ignoring blank lines entirely
  const needleCompact = needle.split("\n").filter((l) => l.trim()).join("\n");
  const haystackCompact = haystack.split("\n").filter((l) => l.trim()).join("\n");
  const compactIdx = haystackCompact.indexOf(needleCompact);
  if (compactIdx >= 0) {
    // Found via compact matching — find approximate position in original
    const firstLine = needle.split("\n").find((l) => l.trim());
    if (firstLine) {
      const origStart = haystack.indexOf(firstLine.trimEnd());
      const lastLine = needle.split("\n").reverse().find((l) => l.trim());
      if (origStart >= 0 && lastLine) {
        const origEnd = haystack.indexOf(lastLine.trimEnd(), origStart) + lastLine.trimEnd().length;
        return { start: origStart, end: origEnd };
      }
    }
  }

  return null;
}

function applySearchReplace(block: PatchBlock): PatchResult {
  const filePath = resolve(block.file);

  if (isBlocked(block.file)) {
    return { block, applied: false, matchType: "blocked", detail: `Blocked file: ${block.file}` };
  }

  if (!existsSync(filePath)) {
    return { block, applied: false, matchType: "failed", detail: `File not found: ${block.file}` };
  }

  const content = readFileSync(filePath, "utf-8");
  const search = block.search!;
  const replace = block.replace!;

  // Exact match
  if (content.includes(search)) {
    const updated = content.replace(search, replace);
    writeFileSync(filePath, updated);
    return { block, applied: true, matchType: "exact" };
  }

  // Fuzzy match
  const match = fuzzyMatch(content, search);
  if (match) {
    const updated = content.slice(0, match.start) + replace + content.slice(match.end);
    writeFileSync(filePath, updated);
    return { block, applied: true, matchType: "fuzzy", detail: `Fuzzy matched at offset ${match.start}` };
  }

  return { block, applied: false, matchType: "failed", detail: `SEARCH block not found in ${block.file}` };
}

function applyAddFile(block: PatchBlock): PatchResult {
  const filePath = resolve(block.file);

  if (isBlocked(block.file)) {
    return { block, applied: false, matchType: "blocked", detail: `Blocked file: ${block.file}` };
  }

  if (existsSync(filePath)) {
    return { block, applied: false, matchType: "failed", detail: `File already exists: ${block.file} (use SEARCH/REPLACE to modify)` };
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, block.content!);
  return { block, applied: true, matchType: "created" };
}

export function applyPatches(llmOutput: string, dryRun: boolean = false): PatchResult[] {
  const blocks = parseLlmOutput(llmOutput);
  const results: PatchResult[] = [];

  for (const block of blocks) {
    if (block.type === "cannot_fix") {
      results.push({ block, applied: false, matchType: "cannot_fix", detail: block.reason });
      continue;
    }

    if (dryRun) {
      results.push({
        block,
        applied: false,
        matchType: block.type === "add_file" ? "created" : "exact",
        detail: `[DRY RUN] Would ${block.type === "add_file" ? "create" : "modify"} ${block.file}`,
      });
      continue;
    }

    if (block.type === "search_replace") {
      results.push(applySearchReplace(block));
    } else if (block.type === "add_file") {
      results.push(applyAddFile(block));
    }
  }

  return results;
}

export function getChangedFiles(results: PatchResult[]): string[] {
  return results.filter((r) => r.applied).map((r) => r.block.file);
}
