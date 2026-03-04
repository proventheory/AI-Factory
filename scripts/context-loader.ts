/**
 * Surgical context loader for the self-healer.
 * Collects minimal context from a 4.4GB repo using rg and file reads.
 * 50KB budget per LLM call. Priority-ordered: failing file > symbol defs > .d.ts > imports > config.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ParsedError } from "./error-parser.js";

const MAX_CONTEXT_BYTES = 50 * 1024; // 50KB
const MAX_FILE_BYTES = 15 * 1024; // 15KB per individual file read

interface ContextChunk {
  label: string;
  path: string;
  content: string;
  priority: number;
}

function safeRead(filePath: string, maxBytes: number = MAX_FILE_BYTES): string {
  try {
    const abs = resolve(filePath);
    if (!existsSync(abs)) return "";
    const content = readFileSync(abs, "utf-8");
    return content.slice(0, maxBytes);
  } catch {
    return "";
  }
}

function rg(pattern: string, globFilter?: string, maxResults: number = 10): string[] {
  try {
    const globArg = globFilter ? `--glob "${globFilter}"` : "";
    const cmd = `rg -l ${globArg} --max-count 1 --max-filesize 500K "${pattern}" 2>/dev/null | head -${maxResults}`;
    const output = execSync(cmd, { encoding: "utf-8", timeout: 5000, cwd: process.cwd() });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function findSymbolDefinitions(symbol: string): string[] {
  if (!symbol || symbol.length < 2) return [];
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rg(
    `(?:export\\s+)?(?:interface|type|class|enum|function|const|let|var)\\s+${escapedSymbol}\\b`,
    "*.{ts,tsx}",
    5
  );
}

function findTypeDefinitions(symbol: string): string[] {
  if (!symbol || symbol.length < 2) return [];
  return rg(symbol, "*.d.ts", 3);
}

function extractImportPaths(fileContent: string, filePath: string): string[] {
  const dir = dirname(filePath);
  const paths: string[] = [];
  const importRegex = /from\s+["']([^"']+)["']/g;
  let m;
  while ((m = importRegex.exec(fileContent)) !== null) {
    const importPath = m[1];
    if (importPath.startsWith(".")) {
      const resolved = resolve(dir, importPath);
      for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const full = resolved + ext;
        if (existsSync(full)) { paths.push(full); break; }
      }
    }
  }
  return paths;
}

function findNearbyTest(filePath: string): string | null {
  const base = filePath.replace(/\.(ts|tsx)$/, "");
  const candidates = [
    `${base}.test.ts`,
    `${base}.test.tsx`,
    `${base}.spec.ts`,
    join(dirname(filePath), "__tests__", filePath.split("/").pop()!.replace(/\.(ts|tsx)$/, ".test.ts")),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function findWorkspaceConfig(filePath: string): string[] {
  const configs: string[] = [];
  let dir = dirname(resolve(filePath));
  const root = process.cwd();
  while (dir.length >= root.length) {
    for (const name of ["tsconfig.json", "package.json"]) {
      const p = join(dir, name);
      if (existsSync(p) && !configs.includes(p)) configs.push(p);
    }
    if (configs.length >= 2) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return configs;
}

export function collectContext(errors: ParsedError[], attemptHistory: string[]): string {
  const chunks: ContextChunk[] = [];
  const seenPaths = new Set<string>();

  function addChunk(label: string, path: string, priority: number) {
    const abs = resolve(path);
    if (seenPaths.has(abs)) return;
    const content = safeRead(abs);
    if (!content) return;
    seenPaths.add(abs);
    chunks.push({ label, path, content, priority });
  }

  // Deduplicate error files
  const uniqueFiles = [...new Set(errors.map((e) => e.file))];
  const allHints = [...new Set(errors.flatMap((e) => e.context_hints))];

  // Priority 1: Failing files
  for (const file of uniqueFiles) {
    addChunk(`Failing file`, file, 1);
  }

  // Priority 2: Symbol definitions from context_hints
  for (const hint of allHints) {
    const defFiles = findSymbolDefinitions(hint);
    for (const f of defFiles) {
      addChunk(`Symbol definition (${hint})`, f, 2);
    }
  }

  // Priority 3: .d.ts type definitions
  for (const hint of allHints) {
    const dtsFiles = findTypeDefinitions(hint);
    for (const f of dtsFiles) {
      addChunk(`Type definition (${hint})`, f, 3);
    }
  }

  // Priority 4: Direct imports from failing files
  for (const file of uniqueFiles) {
    const content = safeRead(file);
    if (!content) continue;
    const importPaths = extractImportPaths(content, file);
    for (const imp of importPaths.slice(0, 5)) {
      addChunk(`Import`, imp, 4);
    }
  }

  // Priority 5: Config files
  for (const file of uniqueFiles) {
    const configs = findWorkspaceConfig(file);
    for (const c of configs) {
      addChunk(`Config`, c, 5);
    }
  }

  // Priority 6: Nearby test files
  for (const file of uniqueFiles) {
    const test = findNearbyTest(file);
    if (test) addChunk(`Test`, test, 6);
  }

  // Sort by priority, then build context string within budget
  chunks.sort((a, b) => a.priority - b.priority);

  let totalBytes = 0;
  const parts: string[] = [];

  for (const chunk of chunks) {
    const entry = `--- ${chunk.label}: ${chunk.path} ---\n${chunk.content}\n`;
    if (totalBytes + entry.length > MAX_CONTEXT_BYTES) {
      if (totalBytes > MAX_CONTEXT_BYTES * 0.5) break; // already have enough
      // Truncate this chunk to fit
      const remaining = MAX_CONTEXT_BYTES - totalBytes - 100;
      if (remaining > 500) {
        parts.push(`--- ${chunk.label}: ${chunk.path} (truncated) ---\n${chunk.content.slice(0, remaining)}\n`);
      }
      break;
    }
    parts.push(entry);
    totalBytes += entry.length;
  }

  // Append attempt history summary if any
  if (attemptHistory.length > 0) {
    const historyStr = attemptHistory.join("\n---\n").slice(0, 5000);
    parts.push(`\n--- PREVIOUS ATTEMPTS ---\n${historyStr}\n`);
  }

  return parts.join("\n");
}
