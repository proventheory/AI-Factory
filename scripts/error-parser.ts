/**
 * Error parser: parse tsc, ESLint, next build, and test output into structured errors.
 * Extracts context_hints (symbol names) from error messages for the context loader.
 */

export interface ParsedError {
  file: string;
  line: number;
  column?: number;
  code?: string;
  message: string;
  context_hints: string[];
  workspace: string;
  step: string;
}

// Extract likely symbol names from a TypeScript error message
function extractContextHints(message: string): string[] {
  const hints: string[] = [];
  // "Property 'X' does not exist on type 'Y'" -> [Y, X]
  const propMatch = message.match(/Property '(\w+)' does not exist on type '(\w+)'/);
  if (propMatch) { hints.push(propMatch[2], propMatch[1]); }
  // "'X' is of type 'unknown'" -> [X]
  const unknownMatch = message.match(/'(\w+)' is of type '(\w+)'/);
  if (unknownMatch) { hints.push(unknownMatch[1]); }
  // "Type 'X' is not assignable to type 'Y'" -> [X, Y]
  const assignMatch = message.match(/Type '(\w+)' is not assignable to type '(\w+)'/);
  if (assignMatch) { hints.push(assignMatch[1], assignMatch[2]); }
  // "Cannot find name 'X'" -> [X]
  const nameMatch = message.match(/Cannot find name '(\w+)'/);
  if (nameMatch) { hints.push(nameMatch[1]); }
  // "Module '"X"' has no exported member 'Y'" -> [Y]
  const exportMatch = message.match(/has no exported member '(\w+)'/);
  if (exportMatch) { hints.push(exportMatch[1]); }
  // "Argument of type 'X' is not assignable" -> [X]
  const argMatch = message.match(/Argument of type '(\w+)'/);
  if (argMatch) { hints.push(argMatch[1]); }
  // Generic: extract all PascalCase words (likely type names)
  const pascalWords = message.match(/\b[A-Z][a-zA-Z0-9]{2,}\b/g);
  if (pascalWords) {
    for (const w of pascalWords) {
      if (!hints.includes(w) && !["Error", "Property", "Type", "Cannot", "Module", "Argument"].includes(w)) {
        hints.push(w);
      }
    }
  }
  return [...new Set(hints)];
}

export function parseTscOutput(output: string, workspace: string = "root"): ParsedError[] {
  const errors: ParsedError[] = [];
  const regex = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
  let m;
  while ((m = regex.exec(output)) !== null) {
    errors.push({
      file: m[1],
      line: parseInt(m[2], 10),
      column: parseInt(m[3], 10),
      code: m[4],
      message: m[5],
      context_hints: extractContextHints(m[5]),
      workspace,
      step: "tsc",
    });
  }
  return errors;
}

export function parseEslintJson(output: string, workspace: string = "console"): ParsedError[] {
  const errors: ParsedError[] = [];
  try {
    const data = JSON.parse(output) as Array<{
      filePath: string;
      messages: Array<{ line: number; column: number; ruleId: string; message: string; severity: number }>;
    }>;
    for (const file of data) {
      for (const msg of file.messages) {
        if (msg.severity < 2) continue; // skip warnings
        errors.push({
          file: file.filePath,
          line: msg.line,
          column: msg.column,
          code: msg.ruleId,
          message: msg.message,
          context_hints: extractContextHints(msg.message),
          workspace,
          step: "lint",
        });
      }
    }
  } catch {
    // If not valid JSON, try line-by-line ESLint default format
    const regex = /^(.+?):(\d+):(\d+):\s+error\s+(.+?)\s+(.+)$/gm;
    let m;
    while ((m = regex.exec(output)) !== null) {
      errors.push({
        file: m[1],
        line: parseInt(m[2], 10),
        column: parseInt(m[3], 10),
        code: m[4],
        message: m[5],
        context_hints: extractContextHints(m[5]),
        workspace,
        step: "lint",
      });
    }
  }
  return errors;
}

export function parseNextBuildOutput(output: string, workspace: string = "console"): ParsedError[] {
  const errors: ParsedError[] = [];
  // Next.js build errors: "Type error: ..." or "./path/file.ts:line:col"
  const typeErrorRegex = /Type error:\s*(.+?)(?:\n|$)/g;
  let m;
  while ((m = typeErrorRegex.exec(output)) !== null) {
    const fileMatch = output.slice(Math.max(0, m.index - 200), m.index).match(/\.\/(.+?):(\d+):(\d+)/);
    errors.push({
      file: fileMatch ? fileMatch[1] : "unknown",
      line: fileMatch ? parseInt(fileMatch[2], 10) : 0,
      column: fileMatch ? parseInt(fileMatch[3], 10) : undefined,
      message: m[1],
      context_hints: extractContextHints(m[1]),
      workspace,
      step: "build",
    });
  }
  // Also catch "Error: ..." lines with file paths
  const errorRegex = /^(.+?):(\d+):(\d+)\s*\n.*?Error:\s*(.+)$/gm;
  while ((m = errorRegex.exec(output)) !== null) {
    errors.push({
      file: m[1],
      line: parseInt(m[2], 10),
      column: parseInt(m[3], 10),
      message: m[4],
      context_hints: extractContextHints(m[4]),
      workspace,
      step: "build",
    });
  }
  return errors;
}

export function parseTestOutput(output: string, workspace: string = "root"): ParsedError[] {
  const errors: ParsedError[] = [];
  // node:test TAP: "not ok N - description"
  const notOkRegex = /not ok \d+ - (.+)/g;
  let m;
  while ((m = notOkRegex.exec(output)) !== null) {
    // Try to find file from stack trace nearby
    const nearbyStack = output.slice(m.index, m.index + 500);
    const fileMatch = nearbyStack.match(/at .+?\((.+?):(\d+):(\d+)\)/);
    errors.push({
      file: fileMatch?.[1] ?? "unknown",
      line: fileMatch ? parseInt(fileMatch[2], 10) : 0,
      message: m[1],
      context_hints: extractContextHints(m[1]),
      workspace,
      step: "test",
    });
  }
  return errors;
}

export function parseStepOutput(step: string, workspace: string, output: string): ParsedError[] {
  switch (step) {
    case "tsc": return parseTscOutput(output, workspace);
    case "lint": return parseEslintJson(output, workspace);
    case "build": return parseNextBuildOutput(output, workspace);
    case "test": return parseTestOutput(output, workspace);
    default: return [];
  }
}
