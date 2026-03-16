/**
 * Apply SEARCH/REPLACE and ADD_FILE blocks from write_patch output (deploy-fix flow).
 * Same format as scripts/patcher.ts but no path blocking so we can add migration stubs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface PatchBlock {
  type: "search_replace" | "add_file" | "cannot_fix";
  file: string;
  search?: string;
  replace?: string;
  content?: string;
  reason?: string;
}

export interface ApplyResult {
  block: PatchBlock;
  applied: boolean;
  detail?: string;
}

export function parsePatchOutput(output: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];
  const srRegex = /<<<<<<< SEARCH\n([\s\S]*?)======= REPLACE\n([\s\S]*?)>>>>>>> FILE:\s*(.+)/g;
  const addRegex = /<<<<<<< ADD_FILE:\s*(.+)\n([\s\S]*?)>>>>>>> END/g;
  const cfRegex = /<<<<<<< CANNOT_FIX:\s*(.+?)(?:\n[\s\S]*?)?>>>>>>> END/g;
  let m;
  while ((m = srRegex.exec(output)) !== null) {
    blocks.push({
      type: "search_replace",
      search: m[1].replace(/\n$/, ""),
      replace: m[2].replace(/\n$/, ""),
      file: m[3].trim(),
    });
  }
  while ((m = addRegex.exec(output)) !== null) {
    blocks.push({ type: "add_file", file: m[1].trim(), content: m[2] });
  }
  while ((m = cfRegex.exec(output)) !== null) {
    blocks.push({ type: "cannot_fix", file: "", reason: m[1].trim() });
  }
  return blocks;
}

function normalizeWs(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}

function fuzzyMatch(haystack: string, needle: string): { start: number; end: number } | null {
  const normHaystack = normalizeWs(haystack);
  const normNeedle = normalizeWs(needle);
  const idx = normHaystack.indexOf(normNeedle);
  if (idx >= 0) {
    const firstLine = needle.split("\n")[0].trimEnd();
    const origIdx = haystack.indexOf(firstLine);
    if (origIdx >= 0) {
      const needleLines = needle.split("\n").length;
      const startLine = haystack.slice(0, origIdx).split("\n").length - 1;
      const haystackLines = haystack.split("\n");
      const endOffset = haystackLines.slice(0, startLine + needleLines).join("\n").length;
      return { start: origIdx, end: endOffset };
    }
  }
  return null;
}

/**
 * Apply patch blocks inside rootDir (default process.cwd()). Allows all paths (e.g. supabase/migrations).
 */
export function applyPatchInDir(
  llmOutput: string,
  rootDir: string = process.cwd(),
  dryRun: boolean = false
): ApplyResult[] {
  const blocks = parsePatchOutput(llmOutput);
  const results: ApplyResult[] = [];

  for (const block of blocks) {
    if (block.type === "cannot_fix") {
      results.push({ block, applied: false, detail: block.reason });
      continue;
    }
    const filePath = resolve(rootDir, block.file);

    if (dryRun) {
      results.push({
        block,
        applied: false,
        detail: `[DRY RUN] Would ${block.type === "add_file" ? "create" : "modify"} ${block.file}`,
      });
      continue;
    }

    if (block.type === "search_replace") {
      if (!existsSync(filePath)) {
        results.push({ block, applied: false, detail: `File not found: ${block.file}` });
        continue;
      }
      const content = readFileSync(filePath, "utf-8");
      const search = block.search!;
      const replace = block.replace!;
      if (content.includes(search)) {
        writeFileSync(filePath, content.replace(search, replace));
        results.push({ block, applied: true });
      } else {
        const match = fuzzyMatch(content, search);
        if (match) {
          const updated = content.slice(0, match.start) + replace + content.slice(match.end);
          writeFileSync(filePath, updated);
          results.push({ block, applied: true, detail: "fuzzy" });
        } else {
          results.push({ block, applied: false, detail: `SEARCH not found in ${block.file}` });
        }
      }
    } else {
      if (existsSync(filePath)) {
        results.push({ block, applied: false, detail: `File exists: ${block.file}` });
        continue;
      }
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, block.content!);
      results.push({ block, applied: true });
    }
  }
  return results;
}
